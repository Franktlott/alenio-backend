import { useOutletContext } from "react-router-dom";
import type { usePendingApprovals } from "../../hooks/usePendingApprovals";

export type AlenioGoOutletContext = {
  teamId: string | undefined;
  teamName: string;
  teamImage?: string | null;
  inviteCode?: string | null;
  userName?: string | null;
  roleLabel: string;
  canManage: boolean;
  approvals: ReturnType<typeof usePendingApprovals>;
};

export function useAlenioGoShell(): AlenioGoOutletContext {
  return useOutletContext<AlenioGoOutletContext>();
}
