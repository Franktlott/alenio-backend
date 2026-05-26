import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useTeamStore } from "@/lib/state/team-store";
import { performWorkspaceSwitch, type SwitchWorkspaceOptions } from "@/lib/workspace-switch";

export function useSwitchWorkspace() {
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const switchWorkspace = useCallback(
    async (teamId: string, options?: SwitchWorkspaceOptions) => {
      const changed = await performWorkspaceSwitch(
        teamId,
        activeTeamId,
        setActiveTeamId,
        queryClient,
      );
      if (!changed) return false;
      if (options?.navigateTo) {
        router.replace(options.navigateTo as never);
      }
      return true;
    },
    [activeTeamId, setActiveTeamId, queryClient],
  );

  return { switchWorkspace, activeTeamId };
}
