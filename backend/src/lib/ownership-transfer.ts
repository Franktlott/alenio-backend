import { Resend } from "resend";
import { prisma } from "../prisma";
import { env } from "../env";
import { verifyEmailPassword } from "../auth";
import { logActivity } from "./activity";
import { sendPushToUsers } from "./push";
import { cleanupWorkspaceMemberDeparture } from "./workspace-member-departure";
import { getTeamSubscription, billingProviderFromSubscription } from "../routes/subscription";
import {
  billingReturnBaseUrl,
  ensureStripeCustomerIdForTeam,
  getStripeClient,
  isStripePortalConfigured,
} from "./stripe-billing";

export const OWNERSHIP_TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DISPOSITIONS = ["WORKSPACE_ADMIN", "MANAGER", "MEMBER", "REMOVE"] as const;
export type OwnershipDisposition = (typeof DISPOSITIONS)[number];

export const BILLING_PATHS = ["KEEP_PAYMENT_METHOD", "REPLACE_PAYMENT_METHOD"] as const;
export type OwnershipBillingPath = (typeof BILLING_PATHS)[number];

export type OwnershipTransferAuditEvent =
  | "ownership_transfer_started"
  | "ownership_transfer_accepted"
  | "ownership_transfer_declined"
  | "ownership_transfer_canceled"
  | "ownership_transfer_expired";

type ServiceError = { message: string; code: string; status: number };

const transferInclude = {
  fromUser: { select: { id: true, name: true, email: true, image: true } },
  toUser: { select: { id: true, name: true, email: true, image: true } },
  team: { select: { id: true, name: true } },
} as const;

export function serializeOwnershipTransfer(
  row: Awaited<ReturnType<typeof getPendingTransferForTeam>> extends infer T
    ? NonNullable<T>
    : never,
) {
  return {
    id: row.id,
    teamId: row.teamId,
    teamName: row.team.name,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status: row.status,
    previousOwnerDisposition: row.previousOwnerDisposition,
    billingPath: row.billingPath,
    awaitingPaymentMethod: row.awaitingPaymentMethod,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    fromUser: row.fromUser,
    toUser: row.toUser,
  };
}

async function writeAudit(opts: {
  teamId: string;
  event: OwnershipTransferAuditEvent;
  previousOwnerId: string;
  newOwnerId: string;
  performedByUserId: string;
  previousOwnerDisposition: string;
  transferId: string;
}) {
  await logActivity({
    teamId: opts.teamId,
    userId: opts.performedByUserId,
    type: opts.event,
    metadata: {
      workspaceId: opts.teamId,
      previousOwnerId: opts.previousOwnerId,
      newOwnerId: opts.newOwnerId,
      performedByUserId: opts.performedByUserId,
      timestamp: new Date().toISOString(),
      previousOwnerDisposition: opts.previousOwnerDisposition,
      transferId: opts.transferId,
    },
  });
}

async function notifyUsers(opts: {
  userIds: string[];
  title: string;
  body: string;
  emailSubject: string;
  emailHtml: string;
  data?: Record<string, unknown>;
}) {
  const unique = [...new Set(opts.userIds.filter(Boolean))];
  if (unique.length === 0) return;

  try {
    await sendPushToUsers(unique, opts.title, opts.body, opts.data);
  } catch (err) {
    console.warn("[ownership-transfer] push failed:", err);
  }

  if (!env.RESEND_API_KEY) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { email: true },
    });
    const resend = new Resend(env.RESEND_API_KEY);
    for (const u of users) {
      if (!u.email?.trim()) continue;
      await resend.emails.send({
        from: env.FROM_EMAIL,
        to: u.email,
        subject: opts.emailSubject,
        html: opts.emailHtml,
      });
    }
  } catch (err) {
    console.warn("[ownership-transfer] email failed:", err);
  }
}

function dispositionToRole(disposition: string): "team_leader" | "member" | "remove" {
  if (disposition === "REMOVE") return "remove";
  if (disposition === "MEMBER") return "member";
  return "team_leader"; // WORKSPACE_ADMIN | MANAGER
}

export async function listIncomingOwnershipTransfers(userId: string) {
  const rows = await prisma.ownershipTransfer.findMany({
    where: { toUserId: userId, status: "PENDING" },
    include: transferInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeOwnershipTransfer);
}

export async function getPendingTransferForTeam(teamId: string) {
  return prisma.ownershipTransfer.findFirst({
    where: { teamId, status: "PENDING" },
    include: transferInclude,
  });
}

export async function assertNoPendingRecipientRemoval(
  teamId: string,
  memberUserId: string,
): Promise<ServiceError | null> {
  const pending = await prisma.ownershipTransfer.findFirst({
    where: { teamId, status: "PENDING", toUserId: memberUserId },
    select: { id: true },
  });
  if (pending) {
    return {
      message: "Cancel the pending ownership transfer before removing this member.",
      code: "TRANSFER_PENDING_RECIPIENT",
      status: 409,
    };
  }
  return null;
}

export async function cancelPendingTransferIfRecipientLeaves(
  teamId: string,
  leavingUserId: string,
): Promise<void> {
  const pending = await prisma.ownershipTransfer.findFirst({
    where: { teamId, status: "PENDING", toUserId: leavingUserId },
    include: transferInclude,
  });
  if (!pending) return;

  const updated = await prisma.ownershipTransfer.update({
    where: { id: pending.id },
    data: { status: "CANCELED", canceledAt: new Date(), awaitingPaymentMethod: false },
    include: transferInclude,
  });

  await writeAudit({
    teamId,
    event: "ownership_transfer_canceled",
    previousOwnerId: pending.fromUserId,
    newOwnerId: pending.toUserId,
    performedByUserId: leavingUserId,
    previousOwnerDisposition: pending.previousOwnerDisposition,
    transferId: pending.id,
  });

  const teamName = updated.team.name;
  await notifyUsers({
    userIds: [pending.fromUserId],
    title: "Ownership transfer canceled",
    body: `The ownership transfer for ${teamName} was canceled because the recipient left the workspace.`,
    emailSubject: `Ownership transfer canceled — ${teamName}`,
    emailHtml: `<p>The ownership transfer for <strong>${escapeHtml(teamName)}</strong> was canceled because the recipient left the workspace.</p>`,
    data: { type: "ownership_transfer_canceled", teamId, transferId: pending.id },
  });
}

export async function requireTransferReauth(opts: {
  userId: string;
  email: string | null | undefined;
  password?: string;
  confirmPhrase?: string;
}): Promise<ServiceError | null> {
  const password = typeof opts.password === "string" ? opts.password.trim() : "";
  const phrase = typeof opts.confirmPhrase === "string" ? opts.confirmPhrase.trim() : "";

  const credential = await prisma.account.findFirst({
    where: { userId: opts.userId, providerId: "credential" },
    select: { id: true },
  });

  if (credential) {
    if (!password) {
      return {
        message: "Confirm your password to transfer ownership.",
        code: "REAUTH_REQUIRED",
        status: 401,
      };
    }
    if (!opts.email) {
      return { message: "User not found", code: "NOT_FOUND", status: 404 };
    }
    try {
      const ok = await verifyEmailPassword(opts.email, password);
      if (!ok) throw new Error("bad");
    } catch {
      return { message: "Incorrect password", code: "INVALID_PASSWORD", status: 401 };
    }
    return null;
  }

  // SSO / passwordless: require explicit confirmation phrase until IdP step-up is wired.
  if (phrase !== "TRANSFER") {
    return {
      message: 'Confirm transfer by typing TRANSFER (SSO reauthentication).',
      code: "REAUTH_REQUIRED",
      status: 401,
    };
  }
  return null;
}

export async function initiateOwnershipTransfer(opts: {
  teamId: string;
  fromUserId: string;
  fromUserEmail: string | null | undefined;
  toUserId: string;
  previousOwnerDisposition: string;
  billingPath: string;
  password?: string;
  confirmPhrase?: string;
}): Promise<{ data: ReturnType<typeof serializeOwnershipTransfer> } | { error: ServiceError }> {
  const reauth = await requireTransferReauth({
    userId: opts.fromUserId,
    email: opts.fromUserEmail,
    password: opts.password,
    confirmPhrase: opts.confirmPhrase,
  });
  if (reauth) return { error: reauth };

  if (opts.toUserId === opts.fromUserId) {
    return { error: { message: "You cannot transfer ownership to yourself", code: "VALIDATION_ERROR", status: 400 } };
  }
  if (!DISPOSITIONS.includes(opts.previousOwnerDisposition as OwnershipDisposition)) {
    return { error: { message: "Invalid previous owner disposition", code: "VALIDATION_ERROR", status: 400 } };
  }
  if (!BILLING_PATHS.includes(opts.billingPath as OwnershipBillingPath)) {
    return { error: { message: "Invalid billing path", code: "VALIDATION_ERROR", status: 400 } };
  }

  const caller = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: opts.fromUserId, teamId: opts.teamId } },
  });
  if (!caller || caller.role !== "owner") {
    return { error: { message: "Only the owner can transfer ownership", code: "FORBIDDEN", status: 403 } };
  }

  const existingPending = await prisma.ownershipTransfer.findFirst({
    where: { teamId: opts.teamId, status: "PENDING" },
    select: { id: true },
  });
  if (existingPending) {
    return {
      error: {
        message: "A ownership transfer is already pending. Cancel it or wait for it to complete.",
        code: "TRANSFER_ALREADY_PENDING",
        status: 409,
      },
    };
  }

  const target = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: opts.toUserId, teamId: opts.teamId } },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!target) {
    return { error: { message: "Member not found", code: "NOT_FOUND", status: 404 } };
  }
  if (target.role === "owner") {
    return { error: { message: "Member is already the owner", code: "VALIDATION_ERROR", status: 400 } };
  }

  const sub = await getTeamSubscription(opts.teamId);
  const provider = billingProviderFromSubscription(sub);
  let billingPath = opts.billingPath;
  if (provider === "none" || sub.plan === "free") {
    billingPath = "KEEP_PAYMENT_METHOD";
  }

  const created = await prisma.ownershipTransfer.create({
    data: {
      teamId: opts.teamId,
      fromUserId: opts.fromUserId,
      toUserId: opts.toUserId,
      status: "PENDING",
      previousOwnerDisposition: opts.previousOwnerDisposition,
      billingPath,
      awaitingPaymentMethod: false,
      expiresAt: new Date(Date.now() + OWNERSHIP_TRANSFER_TTL_MS),
    },
    include: transferInclude,
  });

  await writeAudit({
    teamId: opts.teamId,
    event: "ownership_transfer_started",
    previousOwnerId: opts.fromUserId,
    newOwnerId: opts.toUserId,
    performedByUserId: opts.fromUserId,
    previousOwnerDisposition: opts.previousOwnerDisposition,
    transferId: created.id,
  });

  const teamName = created.team.name;
  const fromName = created.fromUser.name ?? "The owner";
  await notifyUsers({
    userIds: [opts.toUserId],
    title: "Ownership transfer request",
    body: `${fromName} wants to transfer ownership of ${teamName} to you. You have 7 days to accept.`,
    emailSubject: `Ownership transfer request — ${teamName}`,
    emailHtml: `<p><strong>${escapeHtml(fromName)}</strong> wants to transfer ownership of <strong>${escapeHtml(teamName)}</strong> to you.</p><p>Open Alenio to accept or decline. This request expires in 7 days.</p>`,
    data: { type: "ownership_transfer_started", teamId: opts.teamId, transferId: created.id },
  });

  return { data: serializeOwnershipTransfer(created) };
}

async function applyAcceptedTransfer(
  transferId: string,
  performedByUserId: string,
): Promise<{ data: ReturnType<typeof serializeOwnershipTransfer> } | { error: ServiceError }> {
  const transfer = await prisma.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: transferInclude,
  });
  if (!transfer || transfer.status !== "PENDING") {
    return { error: { message: "Transfer not found or not pending", code: "NOT_FOUND", status: 404 } };
  }

  const disposition = transfer.previousOwnerDisposition;
  const nextRole = dispositionToRole(disposition);

  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({
      where: { userId_teamId: { userId: transfer.toUserId, teamId: transfer.teamId } },
      data: { role: "owner" },
    });

    if (nextRole === "remove") {
      await cleanupWorkspaceMemberDeparture(tx as unknown as typeof prisma, transfer.teamId, transfer.fromUserId);
      await tx.teamMember.delete({
        where: { userId_teamId: { userId: transfer.fromUserId, teamId: transfer.teamId } },
      });
    } else {
      await tx.teamMember.update({
        where: { userId_teamId: { userId: transfer.fromUserId, teamId: transfer.teamId } },
        data: { role: nextRole },
      });
    }

    await tx.ownershipTransfer.update({
      where: { id: transfer.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        awaitingPaymentMethod: false,
      },
    });
  });

  // Best-effort: update Stripe billing contact email to new owner (keep customer/sub).
  try {
    const sub = await getTeamSubscription(transfer.teamId);
    const customerId = sub.stripeCustomerId?.trim();
    const newOwner = await prisma.user.findUnique({
      where: { id: transfer.toUserId },
      select: { email: true, name: true },
    });
    if (customerId && newOwner?.email && getStripeClient()) {
      await getStripeClient()!.customers.update(customerId, {
        email: newOwner.email,
        name: newOwner.name ?? undefined,
        metadata: {
          team_id: transfer.teamId,
          billing_owner_user_id: transfer.toUserId,
        },
      });
    }
  } catch (err) {
    console.warn("[ownership-transfer] stripe customer email update failed:", err);
  }

  await writeAudit({
    teamId: transfer.teamId,
    event: "ownership_transfer_accepted",
    previousOwnerId: transfer.fromUserId,
    newOwnerId: transfer.toUserId,
    performedByUserId,
    previousOwnerDisposition: disposition,
    transferId: transfer.id,
  });

  if (nextRole === "remove") {
    await logActivity({
      teamId: transfer.teamId,
      userId: transfer.fromUserId,
      type: "member_removed",
      metadata: { userName: transfer.fromUser.name ?? "", reason: "ownership_transfer_disposition" },
    });
  }

  const teamName = transfer.team.name;
  const newName = transfer.toUser.name ?? "New owner";
  await notifyUsers({
    userIds: [transfer.fromUserId, transfer.toUserId],
    title: "Ownership transferred",
    body: `${newName} is now the owner of ${teamName}.`,
    emailSubject: `Ownership transferred — ${teamName}`,
    emailHtml: `<p><strong>${escapeHtml(newName)}</strong> is now the Workspace Owner of <strong>${escapeHtml(teamName)}</strong>.</p><p>Administrative control and billing responsibility have been transferred.</p>`,
    data: { type: "ownership_transfer_accepted", teamId: transfer.teamId, transferId: transfer.id },
  });

  const fresh = await prisma.ownershipTransfer.findUnique({
    where: { id: transfer.id },
    include: transferInclude,
  });
  if (!fresh) {
    return { error: { message: "Transfer completed but could not load result", code: "INTERNAL", status: 500 } };
  }
  return { data: serializeOwnershipTransfer(fresh) };
}

export async function acceptOwnershipTransfer(opts: {
  transferId: string;
  teamId: string;
  userId: string;
}): Promise<
  | { data: ReturnType<typeof serializeOwnershipTransfer>; paymentSetupUrl?: string }
  | { error: ServiceError }
> {
  const transfer = await prisma.ownershipTransfer.findFirst({
    where: { id: opts.transferId, teamId: opts.teamId, status: "PENDING" },
    include: transferInclude,
  });
  if (!transfer) {
    return { error: { message: "Transfer not found", code: "NOT_FOUND", status: 404 } };
  }
  if (transfer.toUserId !== opts.userId) {
    return { error: { message: "Only the recipient can accept this transfer", code: "FORBIDDEN", status: 403 } };
  }
  if (transfer.expiresAt.getTime() <= Date.now()) {
    await expireTransfer(transfer.id);
    return { error: { message: "This transfer has expired", code: "TRANSFER_EXPIRED", status: 410 } };
  }

  const stillMember = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: opts.userId, teamId: opts.teamId } },
  });
  if (!stillMember) {
    await cancelPendingTransferIfRecipientLeaves(opts.teamId, opts.userId);
    return { error: { message: "You are no longer a member of this workspace", code: "FORBIDDEN", status: 403 } };
  }

  if (transfer.billingPath === "REPLACE_PAYMENT_METHOD") {
    const sub = await getTeamSubscription(opts.teamId);
    const provider = billingProviderFromSubscription(sub);
    if (provider === "stripe" || sub.stripeCustomerId || sub.stripeSubscriptionId) {
      if (!isStripePortalConfigured()) {
        return {
          error: {
            message: "Billing portal is not available. Keep the existing payment method or try again later.",
            code: "NOT_CONFIGURED",
            status: 503,
          },
        };
      }
      const customerId =
        sub.stripeCustomerId?.trim() || (await ensureStripeCustomerIdForTeam(opts.teamId))?.trim() || null;
      if (!customerId) {
        return {
          error: { message: "No billing profile for this workplace yet.", code: "NO_CUSTOMER", status: 400 },
        };
      }
      const base = billingReturnBaseUrl();
      if (!base || !getStripeClient()) {
        return { error: { message: "Billing is not configured", code: "NOT_CONFIGURED", status: 503 } };
      }

      await prisma.ownershipTransfer.update({
        where: { id: transfer.id },
        data: { awaitingPaymentMethod: true },
      });

      const portal = await getStripeClient()!.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${base}/ownership-transfer?teamId=${encodeURIComponent(opts.teamId)}&transferId=${encodeURIComponent(transfer.id)}&billing=return`,
      });
      if (!portal.url) {
        return { error: { message: "Could not start payment method setup", code: "STRIPE_ERROR", status: 502 } };
      }

      const pending = await prisma.ownershipTransfer.findUnique({
        where: { id: transfer.id },
        include: transferInclude,
      });
      return {
        data: pending ? serializeOwnershipTransfer(pending) : serializeOwnershipTransfer(transfer),
        paymentSetupUrl: portal.url,
      };
    }
  }

  const result = await applyAcceptedTransfer(transfer.id, opts.userId);
  if ("error" in result) return result;
  return { data: result.data };
}

export async function completeOwnershipTransferPayment(opts: {
  transferId: string;
  teamId: string;
  userId: string;
}): Promise<{ data: ReturnType<typeof serializeOwnershipTransfer> } | { error: ServiceError }> {
  const transfer = await prisma.ownershipTransfer.findFirst({
    where: { id: opts.transferId, teamId: opts.teamId, status: "PENDING" },
  });
  if (!transfer) {
    return { error: { message: "Transfer not found", code: "NOT_FOUND", status: 404 } };
  }
  if (transfer.toUserId !== opts.userId) {
    return { error: { message: "Only the recipient can complete this transfer", code: "FORBIDDEN", status: 403 } };
  }
  if (!transfer.awaitingPaymentMethod) {
    return { error: { message: "This transfer is not awaiting payment setup", code: "VALIDATION_ERROR", status: 400 } };
  }

  const sub = await getTeamSubscription(opts.teamId);
  const customerId = sub.stripeCustomerId?.trim();
  if (!customerId || !getStripeClient()) {
    return { error: { message: "Billing profile missing", code: "NO_CUSTOMER", status: 400 } };
  }

  const customer = await getStripeClient()!.customers.retrieve(customerId);
  if (customer.deleted) {
    return { error: { message: "Billing profile missing", code: "NO_CUSTOMER", status: 400 } };
  }
  const defaultPm =
    typeof customer.invoice_settings?.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;
  if (!defaultPm) {
    const pms = await getStripeClient()!.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    if (pms.data.length === 0) {
      return {
        error: {
          message: "Add a payment method in Stripe before completing the transfer.",
          code: "PAYMENT_METHOD_REQUIRED",
          status: 400,
        },
      };
    }
  }

  const result = await applyAcceptedTransfer(transfer.id, opts.userId);
  if ("error" in result) return result;
  return { data: result.data };
}

export async function declineOwnershipTransfer(opts: {
  transferId: string;
  teamId: string;
  userId: string;
}): Promise<{ data: ReturnType<typeof serializeOwnershipTransfer> } | { error: ServiceError }> {
  const transfer = await prisma.ownershipTransfer.findFirst({
    where: { id: opts.transferId, teamId: opts.teamId, status: "PENDING" },
    include: transferInclude,
  });
  if (!transfer) {
    return { error: { message: "Transfer not found", code: "NOT_FOUND", status: 404 } };
  }
  if (transfer.toUserId !== opts.userId) {
    return { error: { message: "Only the recipient can decline this transfer", code: "FORBIDDEN", status: 403 } };
  }

  const updated = await prisma.ownershipTransfer.update({
    where: { id: transfer.id },
    data: { status: "DECLINED", canceledAt: new Date(), awaitingPaymentMethod: false },
    include: transferInclude,
  });

  await writeAudit({
    teamId: opts.teamId,
    event: "ownership_transfer_declined",
    previousOwnerId: transfer.fromUserId,
    newOwnerId: transfer.toUserId,
    performedByUserId: opts.userId,
    previousOwnerDisposition: transfer.previousOwnerDisposition,
    transferId: transfer.id,
  });

  await notifyUsers({
    userIds: [transfer.fromUserId],
    title: "Ownership transfer declined",
    body: `${transfer.toUser.name ?? "The recipient"} declined ownership of ${transfer.team.name}.`,
    emailSubject: `Ownership transfer declined — ${transfer.team.name}`,
    emailHtml: `<p>The ownership transfer for <strong>${escapeHtml(transfer.team.name)}</strong> was declined.</p>`,
    data: { type: "ownership_transfer_declined", teamId: opts.teamId, transferId: transfer.id },
  });

  return { data: serializeOwnershipTransfer(updated) };
}

export async function cancelOwnershipTransfer(opts: {
  transferId: string;
  teamId: string;
  userId: string;
}): Promise<{ data: ReturnType<typeof serializeOwnershipTransfer> } | { error: ServiceError }> {
  const transfer = await prisma.ownershipTransfer.findFirst({
    where: { id: opts.transferId, teamId: opts.teamId, status: "PENDING" },
    include: transferInclude,
  });
  if (!transfer) {
    return { error: { message: "Transfer not found", code: "NOT_FOUND", status: 404 } };
  }
  if (transfer.fromUserId !== opts.userId) {
    return { error: { message: "Only the current owner can cancel this transfer", code: "FORBIDDEN", status: 403 } };
  }

  const updated = await prisma.ownershipTransfer.update({
    where: { id: transfer.id },
    data: { status: "CANCELED", canceledAt: new Date(), awaitingPaymentMethod: false },
    include: transferInclude,
  });

  await writeAudit({
    teamId: opts.teamId,
    event: "ownership_transfer_canceled",
    previousOwnerId: transfer.fromUserId,
    newOwnerId: transfer.toUserId,
    performedByUserId: opts.userId,
    previousOwnerDisposition: transfer.previousOwnerDisposition,
    transferId: transfer.id,
  });

  await notifyUsers({
    userIds: [transfer.toUserId],
    title: "Ownership transfer canceled",
    body: `The ownership transfer for ${transfer.team.name} was canceled.`,
    emailSubject: `Ownership transfer canceled — ${transfer.team.name}`,
    emailHtml: `<p>The ownership transfer for <strong>${escapeHtml(transfer.team.name)}</strong> was canceled by the owner.</p>`,
    data: { type: "ownership_transfer_canceled", teamId: opts.teamId, transferId: transfer.id },
  });

  return { data: serializeOwnershipTransfer(updated) };
}

async function expireTransfer(transferId: string) {
  const transfer = await prisma.ownershipTransfer.findUnique({
    where: { id: transferId },
    include: transferInclude,
  });
  if (!transfer || transfer.status !== "PENDING") return;

  await prisma.ownershipTransfer.update({
    where: { id: transferId },
    data: { status: "EXPIRED", canceledAt: new Date(), awaitingPaymentMethod: false },
  });

  await writeAudit({
    teamId: transfer.teamId,
    event: "ownership_transfer_expired",
    previousOwnerId: transfer.fromUserId,
    newOwnerId: transfer.toUserId,
    performedByUserId: transfer.fromUserId,
    previousOwnerDisposition: transfer.previousOwnerDisposition,
    transferId: transfer.id,
  });

  await notifyUsers({
    userIds: [transfer.fromUserId, transfer.toUserId],
    title: "Ownership transfer expired",
    body: `The ownership transfer for ${transfer.team.name} expired.`,
    emailSubject: `Ownership transfer expired — ${transfer.team.name}`,
    emailHtml: `<p>The ownership transfer for <strong>${escapeHtml(transfer.team.name)}</strong> expired after 7 days.</p>`,
    data: { type: "ownership_transfer_expired", teamId: transfer.teamId, transferId: transfer.id },
  });
}

export async function expirePendingOwnershipTransfers(): Promise<number> {
  const due = await prisma.ownershipTransfer.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const row of due) {
    await expireTransfer(row.id);
  }
  return due.length;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
