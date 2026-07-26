import { api } from "@/lib/api/api";
import { router } from "expo-router";

export type OwnershipTransferDisposition =
  | "WORKSPACE_ADMIN"
  | "MANAGER"
  | "MEMBER"
  | "REMOVE";

export type OwnershipBillingPath = "KEEP_PAYMENT_METHOD" | "REPLACE_PAYMENT_METHOD";

export type OwnershipTransfer = {
  id: string;
  teamId: string;
  teamName: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  previousOwnerDisposition: string;
  billingPath: string;
  awaitingPaymentMethod: boolean;
  expiresAt: string;
  fromUser: { id: string; name: string | null; email: string | null; image: string | null };
  toUser: { id: string; name: string | null; email: string | null; image: string | null };
};

/** Full-screen “You’re the new owner” celebration (no Stripe return needed). */
export function openOwnershipCelebration(opts: {
  teamId: string;
  transferId: string;
  teamName?: string | null;
}) {
  router.push({
    pathname: "/ownership-transfer",
    params: {
      teamId: opts.teamId,
      transferId: opts.transferId,
      celebrate: "1",
      ...(opts.teamName?.trim() ? { teamName: opts.teamName.trim() } : {}),
    },
  });
}

export function fetchIncomingOwnershipTransfers() {
  return api.get<OwnershipTransfer[]>("/api/ownership-transfers/mine");
}

export function fetchOutgoingOwnershipTransfers() {
  return api.get<OwnershipTransfer[]>("/api/ownership-transfers/outgoing");
}

export function fetchPendingOwnershipTransfer(teamId: string) {
  return api.get<OwnershipTransfer | null>(`/api/teams/${teamId}/transfer-ownership/pending`);
}

export function initiateOwnershipTransfer(
  teamId: string,
  body: {
    toUserId: string;
    previousOwnerDisposition: OwnershipTransferDisposition;
    billingPath?: OwnershipBillingPath;
    password?: string;
    confirmPhrase?: string;
  },
) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership`, {
    ...body,
    billingPath: body.billingPath ?? "REPLACE_PAYMENT_METHOD",
  });
}

export function acceptOwnershipTransfer(
  teamId: string,
  transferId: string,
  opts?: { returnToApp?: boolean },
) {
  return api.post<{
    transfer: OwnershipTransfer;
    paymentSetupUrl: string | null;
    completed: boolean;
  }>(`/api/teams/${teamId}/transfer-ownership/${transferId}/accept`, {
    ...(opts?.returnToApp ? { returnToApp: true } : {}),
  });
}

export function completeOwnershipTransferPayment(
  teamId: string,
  transferId: string,
  opts?: { sessionId?: string; returnToApp?: boolean },
) {
  return api.post<{
    transfer: OwnershipTransfer;
    completed: boolean;
    paymentSetupUrl: string | null;
  }>(`/api/teams/${teamId}/transfer-ownership/${transferId}/complete-payment`, {
    ...(opts?.sessionId ? { sessionId: opts.sessionId } : {}),
    ...(opts?.returnToApp ? { returnToApp: true } : {}),
  });
}

export function declineOwnershipTransfer(teamId: string, transferId: string) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership/${transferId}/decline`, {});
}

export function cancelOwnershipTransfer(teamId: string, transferId: string) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership/${transferId}/cancel`, {});
}
