import type { PlayExternalReport, PlayLinkOut } from "@prisma/client";
import type Stripe from "stripe";
import { env } from "../env";
import { prisma } from "../prisma";
import { createExternalTransaction, refundExternalTransaction } from "./google-play-api";

/** Stripe metadata key that ties a subscription to its Android hand-off. */
export const PLAY_LINK_METADATA_KEY = "play_link_id";
const TOKEN_MAX = 4096;
const MAX_ATTEMPTS = 30;

export type PlayReportKind = "initial" | "renewal" | "refund";

/** Saves the single-use Play token from the app; returns the id to tag the Stripe checkout with. */
export async function createPlayLinkOut(input: {
  token: string | null | undefined;
  userId: string;
  teamId?: string | null;
  pendingCheckoutId?: string | null;
}): Promise<string | null> {
  const token = input.token?.trim();
  if (!token || token.length > TOKEN_MAX) return null;
  const row = await prisma.playLinkOut.create({
    data: { token, userId: input.userId, teamId: input.teamId ?? null, pendingCheckoutId: input.pendingCheckoutId ?? null },
  });
  return row.id;
}

export function playLinkMetadata(linkOutId: string | null): Record<string, string> {
  return linkOutId ? { [PLAY_LINK_METADATA_KEY]: linkOutId } : {};
}

/** Cents → Google's micros string. */
export function centsToMicros(cents: number): string {
  return String(Math.max(0, Math.round(cents)) * 10_000);
}

/** Google allows 1–63 chars of [a-zA-Z0-9_-]; Stripe ids already fit. */
export function safeTransactionId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 63);
}

function shouldReport(livemode: boolean): boolean {
  return livemode || env.GOOGLE_PLAY_REPORT_TEST_PAYMENTS?.trim().toLowerCase() === "true";
}

function subscriptionDetailsOf(invoice: Stripe.Invoice): { subscriptionId: string | null; linkOutId: string | null } {
  const details = invoice.parent?.subscription_details ?? null;
  const ref = details?.subscription;
  const subscriptionId = typeof ref === "string" ? ref : ref?.id ?? null;
  const linkOutId = details?.metadata?.[PLAY_LINK_METADATA_KEY]?.trim() || null;
  return { subscriptionId, linkOutId };
}

async function paymentIntentOfInvoice(stripe: Stripe, invoiceId: string): Promise<string | null> {
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
    for (const entry of payments.data) {
      const pi = entry.payment?.payment_intent;
      if (pi) return typeof pi === "string" ? pi : pi.id;
    }
  } catch (error) {
    console.warn("[play-links] could not read invoice payment", invoiceId, error);
  }
  return null;
}

/** Queues a paid invoice on an Android-started subscription and tries to report it right away. */
export async function recordPaidInvoiceForPlay(stripe: Stripe, invoice: Stripe.Invoice): Promise<void> {
  const { subscriptionId, linkOutId } = subscriptionDetailsOf(invoice);
  if (!linkOutId || !invoice.id) return;
  const linkOut = await prisma.playLinkOut.findUnique({ where: { id: linkOutId } });
  if (!linkOut) return;

  const transactionId = safeTransactionId(invoice.id);
  if (await prisma.playExternalReport.findUnique({ where: { id: transactionId } })) return;

  const total = invoice.total ?? 0;
  const preTax = invoice.total_excluding_tax ?? total;
  const paymentIntentId = await paymentIntentOfInvoice(stripe, invoice.id);
  const paidAt = invoice.status_transitions?.paid_at ?? invoice.created;

  const created = await prisma.$transaction(async (tx) => {
    const fresh = await tx.playLinkOut.findUnique({ where: { id: linkOut.id } });
    const kind: PlayReportKind = fresh?.initialTransactionId ? "renewal" : "initial";
    await tx.playLinkOut.update({
      where: { id: linkOut.id },
      data: {
        stripeSubscriptionId: fresh?.stripeSubscriptionId ?? subscriptionId,
        initialTransactionId: fresh?.initialTransactionId ?? transactionId,
      },
    });
    return tx.playExternalReport.create({
      data: {
        id: transactionId,
        linkOutId: linkOut.id,
        kind,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId,
        preTaxMicros: centsToMicros(preTax),
        taxMicros: centsToMicros(Math.max(0, total - preTax)),
        currency: (invoice.currency || "usd").toUpperCase(),
        transactionTime: new Date(paidAt * 1000),
        testPurchase: !invoice.livemode,
        status: shouldReport(invoice.livemode) ? "pending" : "test_skipped",
      },
    });
  });
  if (created.status === "pending") void sendPlayReport(created.id);
}

/** Queues refunds of a reported Android-started payment. */
export async function recordRefundForPlay(stripe: Stripe, charge: Stripe.Charge): Promise<void> {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const original = await prisma.playExternalReport.findFirst({
    where: { stripePaymentIntentId: pi, kind: { in: ["initial", "renewal"] } },
  });
  if (!original) return;

  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
  const originalTotal = charge.amount || 1;
  const preTaxShare = Number(original.preTaxMicros) / Math.max(1, Number(original.preTaxMicros) + Number(original.taxMicros));
  for (const refund of refunds.data) {
    if (refund.status !== "succeeded") continue;
    const id = safeTransactionId(`rf_${refund.id}`);
    if (await prisma.playExternalReport.findUnique({ where: { id } })) continue;
    const full = refund.amount >= originalTotal;
    const created = await prisma.playExternalReport.create({
      data: {
        id,
        linkOutId: original.linkOutId,
        kind: "refund",
        refundsTransactionId: original.id,
        stripePaymentIntentId: pi,
        preTaxMicros: String(Math.round(refund.amount * 10_000 * preTaxShare)),
        currency: original.currency,
        transactionTime: new Date(refund.created * 1000),
        testPurchase: original.testPurchase,
        fullRefund: full,
        status: original.status === "test_skipped" ? "test_skipped" : "pending",
      },
    });
    if (created.status === "pending") void sendPlayReport(created.id);
  }
}

/** The request body Google expects for a payment report. */
export function paymentReportBody(report: PlayExternalReport, linkOut: PlayLinkOut) {
  const recurringTransaction =
    report.kind === "initial"
      ? { externalTransactionToken: linkOut.token, externalSubscription: { subscriptionType: "RECURRING" } }
      : { initialExternalTransactionId: linkOut.initialTransactionId, externalSubscription: { subscriptionType: "RECURRING" } };
  return {
    originalPreTaxAmount: { priceMicros: report.preTaxMicros, currency: report.currency },
    originalTaxAmount: { priceMicros: report.taxMicros, currency: report.currency },
    transactionTime: report.transactionTime.toISOString(),
    recurringTransaction,
    userTaxAddress: { regionCode: "US" },
    externalContentLinkDetails: { linkType: "LINK_TO_DIGITAL_CONTENT_OFFER" },
  };
}

export function refundReportBody(report: PlayExternalReport) {
  return {
    refundTime: report.transactionTime.toISOString(),
    ...(report.fullRefund
      ? { fullRefund: {} }
      : { partialRefund: { refundId: report.id, refundPreTaxAmount: { priceMicros: report.preTaxMicros, currency: report.currency } } }),
  };
}

/** Sends one queued report. Renewals and refunds wait until the payment they point at is reported. */
export async function sendPlayReport(reportId: string): Promise<void> {
  const report = await prisma.playExternalReport.findUnique({ where: { id: reportId } });
  if (!report || report.status === "reported" || report.status === "test_skipped") return;
  const linkOut = await prisma.playLinkOut.findUnique({ where: { id: report.linkOutId } });
  if (!linkOut) return;

  const dependsOn = report.kind === "renewal" ? linkOut.initialTransactionId : report.kind === "refund" ? report.refundsTransactionId : null;
  if (dependsOn) {
    const parent = await prisma.playExternalReport.findUnique({ where: { id: dependsOn }, select: { status: true } });
    if (parent?.status !== "reported") return;
  }

  try {
    const result =
      report.kind === "refund"
        ? await refundExternalTransaction(report.refundsTransactionId!, refundReportBody(report))
        : await createExternalTransaction(report.id, paymentReportBody(report, linkOut));
    if (result.ok || (result.alreadyExists && report.kind !== "refund")) {
      await prisma.playExternalReport.update({
        where: { id: report.id },
        data: { status: "reported", reportedAt: new Date(), lastError: null, attempts: { increment: 1 } },
      });
      return;
    }
    await prisma.playExternalReport.update({
      where: { id: report.id },
      data: { status: result.status === 0 ? "pending" : "failed", lastError: result.message, attempts: { increment: result.status === 0 ? 0 : 1 } },
    });
  } catch (error) {
    await prisma.playExternalReport.update({
      where: { id: report.id },
      data: { status: "failed", lastError: error instanceof Error ? error.message : String(error), attempts: { increment: 1 } },
    });
  }
}

/** Retries anything not yet reported, oldest first, so payments go before their renewals and refunds. */
export async function retryPlayReports(): Promise<number> {
  const queued = await prisma.playExternalReport.findMany({
    where: { status: { in: ["pending", "failed"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true },
  });
  for (const { id } of queued) await sendPlayReport(id);
  return queued.length;
}
