import { useCallback, useEffect, useState } from "react";
import {
  acceptOwnershipTransfer,
  approveTeamGoLoginRequest,
  approveTeamJoinRequest,
  completeOwnershipTransferPayment,
  declineOwnershipTransfer,
  fetchIncomingOwnershipTransfers,
  fetchTeamGoLoginRequests,
  fetchTeamJoinRequests,
  fetchWebTeams,
  rejectTeamGoLoginRequest,
  rejectTeamJoinRequest,
  type OwnershipTransferRow,
} from "../lib/api";
import {
  approvalBusyKey,
  canManageApprovals,
  type PendingGoLoginRow,
  type PendingJoinRow,
} from "../lib/pending-approvals";

export function usePendingApprovals(options?: { pollMs?: number; teamId?: string }) {
  const pollMs = options?.pollMs ?? 30_000;
  const teamIdFilter = options?.teamId?.trim() || "";

  const [joinRows, setJoinRows] = useState<PendingJoinRow[]>([]);
  const [goRows, setGoRows] = useState<PendingGoLoginRow[]>([]);
  const [ownershipRows, setOwnershipRows] = useState<OwnershipTransferRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const incomingOwnership = await fetchIncomingOwnershipTransfers().catch(
        () => [] as OwnershipTransferRow[],
      );
      setOwnershipRows(
        teamIdFilter
          ? incomingOwnership.filter((r) => r.teamId === teamIdFilter)
          : incomingOwnership,
      );

      const teams = await fetchWebTeams();
      const managed = (teams ?? []).filter((t) => {
        if (!canManageApprovals(t.role)) return false;
        if (teamIdFilter) return t.id === teamIdFilter;
        return true;
      });

      const joinChunks = await Promise.all(
        managed.map(async (t) => {
          try {
            const list = await fetchTeamJoinRequests(t.id);
            return list.map((r) => ({ ...r, teamName: t.name }));
          } catch {
            return [];
          }
        }),
      );
      const goChunks = await Promise.all(
        managed.map(async (t) => {
          try {
            const list = await fetchTeamGoLoginRequests(t.id);
            return list.map((r) => ({ ...r, teamName: t.name }));
          } catch {
            return [];
          }
        }),
      );
      setJoinRows(joinChunks.flat());
      setGoRows(goChunks.flat());
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }, [teamIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const onApproveJoin = async (teamId: string, requestId: string) => {
    const key = approvalBusyKey("join", teamId, requestId);
    setBusyKey(key);
    try {
      await approveTeamJoinRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not approve.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const onRejectJoin = async (teamId: string, requestId: string) => {
    const key = approvalBusyKey("join", teamId, requestId);
    setBusyKey(key);
    try {
      await rejectTeamJoinRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not decline.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const onApproveGo = async (teamId: string, requestId: string) => {
    const key = approvalBusyKey("go", teamId, requestId);
    setBusyKey(key);
    try {
      await approveTeamGoLoginRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not approve.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const onRejectGo = async (teamId: string, requestId: string) => {
    const key = approvalBusyKey("go", teamId, requestId);
    setBusyKey(key);
    try {
      await rejectTeamGoLoginRequest(teamId, requestId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not decline.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const onAcceptOwnership = async (teamId: string, transferId: string) => {
    const key = approvalBusyKey("ownership", teamId, transferId);
    setBusyKey(key);
    try {
      const row = ownershipRows.find((r) => r.id === transferId);
      if (row?.awaitingPaymentMethod) {
        await completeOwnershipTransferPayment(teamId, transferId);
      } else {
        const res = await acceptOwnershipTransfer(teamId, transferId);
        if (res.data.paymentSetupUrl) {
          window.location.href = res.data.paymentSetupUrl;
          return;
        }
      }
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not accept ownership transfer.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const onDeclineOwnership = async (teamId: string, transferId: string) => {
    const key = approvalBusyKey("ownership", teamId, transferId);
    setBusyKey(key);
    try {
      await declineOwnershipTransfer(teamId, transferId);
      await load();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not decline ownership transfer.");
      throw e;
    } finally {
      setBusyKey(null);
    }
  };

  const approvalCount = joinRows.length + goRows.length;
  const total = approvalCount + ownershipRows.length;

  return {
    joinRows,
    goRows,
    ownershipRows,
    /** Join + Go + ownership (notification bell). */
    total,
    /** Join + Go only (device / team approval UIs). */
    approvalCount,
    loadErr,
    busyKey,
    loading,
    reload: load,
    onApproveJoin,
    onRejectJoin,
    onApproveGo,
    onRejectGo,
    onAcceptOwnership,
    onDeclineOwnership,
  };
}
