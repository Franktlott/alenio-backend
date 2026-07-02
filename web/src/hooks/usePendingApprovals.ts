import { useCallback, useEffect, useState } from "react";
import {
  approveTeamGoLoginRequest,
  approveTeamJoinRequest,
  fetchTeamGoLoginRequests,
  fetchTeamJoinRequests,
  fetchWebTeams,
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
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
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

  return {
    joinRows,
    goRows,
    total: joinRows.length + goRows.length,
    loadErr,
    busyKey,
    loading,
    reload: load,
    onApproveJoin,
    onRejectJoin,
    onApproveGo,
    onRejectGo,
  };
}
