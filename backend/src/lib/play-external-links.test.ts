import { describe, expect, test } from "bun:test";
import type { PlayExternalReport, PlayLinkOut } from "@prisma/client";
import { centsToMicros, paymentReportBody, playLinkMetadata, refundReportBody, safeTransactionId } from "./play-external-links";

const linkOut: PlayLinkOut = {
  id: "lo1",
  token: "tok-abc",
  userId: "u1",
  teamId: "t1",
  pendingCheckoutId: null,
  stripeSubscriptionId: "sub_1",
  initialTransactionId: "in_first",
  createdAt: new Date("2026-11-01T00:00:00Z"),
};

function report(patch: Partial<PlayExternalReport>): PlayExternalReport {
  return {
    id: "in_first",
    linkOutId: "lo1",
    kind: "initial",
    stripeInvoiceId: "in_first",
    stripePaymentIntentId: "pi_1",
    refundsTransactionId: null,
    preTaxMicros: "39990000",
    taxMicros: "3200000",
    currency: "USD",
    transactionTime: new Date("2026-11-01T12:00:00Z"),
    testPurchase: false,
    fullRefund: false,
    status: "pending",
    attempts: 0,
    lastError: null,
    reportedAt: null,
    createdAt: new Date("2026-11-01T12:00:00Z"),
    ...patch,
  };
}

describe("amounts and ids", () => {
  test("converts cents to micros", () => {
    expect(centsToMicros(3999)).toBe("39990000");
    expect(centsToMicros(0)).toBe("0");
  });

  test("keeps transaction ids inside Google's character rules", () => {
    expect(safeTransactionId("in_1AbC")).toBe("in_1AbC");
    expect(safeTransactionId("rf_re:1.2")).toBe("rf_re_1_2");
    expect(safeTransactionId("x".repeat(80))).toHaveLength(63);
  });

  test("only tags Stripe when there is a hand-off", () => {
    expect(playLinkMetadata(null)).toEqual({});
    expect(playLinkMetadata("lo1")).toEqual({ play_link_id: "lo1" });
  });
});

describe("report bodies", () => {
  test("the first payment carries the single-use token", () => {
    const body = paymentReportBody(report({}), linkOut);
    expect(body.recurringTransaction).toEqual({
      externalTransactionToken: "tok-abc",
      externalSubscription: { subscriptionType: "RECURRING" },
    });
    expect(body.originalPreTaxAmount).toEqual({ priceMicros: "39990000", currency: "USD" });
    expect(body.externalContentLinkDetails).toEqual({ linkType: "LINK_TO_DIGITAL_CONTENT_OFFER" });
    expect(body.userTaxAddress).toEqual({ regionCode: "US" });
  });

  test("renewals point back to the first payment instead of the token", () => {
    const body = paymentReportBody(report({ id: "in_second", kind: "renewal" }), linkOut);
    expect(body.recurringTransaction).toEqual({
      initialExternalTransactionId: "in_first",
      externalSubscription: { subscriptionType: "RECURRING" },
    });
  });

  test("refunds are full or partial", () => {
    expect(refundReportBody(report({ kind: "refund", fullRefund: true }))).toEqual({
      refundTime: "2026-11-01T12:00:00.000Z",
      fullRefund: {},
    });
    expect(refundReportBody(report({ id: "rf_re_1", kind: "refund", preTaxMicros: "10000000" }))).toEqual({
      refundTime: "2026-11-01T12:00:00.000Z",
      partialRefund: { refundId: "rf_re_1", refundPreTaxAmount: { priceMicros: "10000000", currency: "USD" } },
    });
  });
});
