import { api } from "@/lib/api/api";

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

export function fetchIncomingOwnershipTransfers() {
  return api.get<OwnershipTransfer[]>("/api/ownership-transfers/mine");
}

export function fetchPendingOwnershipTransfer(teamId: string) {
  return api.get<OwnershipTransfer | null>(`/api/teams/${teamId}/transfer-ownership/pending`);
}

export function initiateOwnershipTransfer(
  teamId: string,
  body: {
    toUserId: string;
    previousOwnerDisposition: OwnershipTransferDisposition;
    billingPath: OwnershipBillingPath;
    password?: string;
    confirmPhrase?: string;
  },
) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership`, body);
}

export function acceptOwnershipTransfer(teamId: string, transferId: string) {
  return api.post<{
    transfer: OwnershipTransfer;
    paymentSetupUrl: string | null;
    completed: boolean;
  }>(`/api/teams/${teamId}/transfer-ownership/${transferId}/accept`, {});
}

export function completeOwnershipTransferPayment(teamId: string, transferId: string) {
  return api.post<{ transfer: OwnershipTransfer; completed: boolean }>(
    `/api/teams/${teamId}/transfer-ownership/${transferId}/complete-payment`,
    {},
  );
}

export function declineOwnershipTransfer(teamId: string, transferId: string) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership/${transferId}/decline`, {});
}

export function cancelOwnershipTransfer(teamId: string, transferId: string) {
  return api.post<OwnershipTransfer>(`/api/teams/${teamId}/transfer-ownership/${transferId}/cancel`, {});
}
