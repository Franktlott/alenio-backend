import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyTeamTaskUpdatedEvent, invalidateTaskCaches } from "@/lib/invalidate-task-caches";
import { realtimeClient, teamTasksRealtimeChannel } from "@/lib/realtime-client";

/** Keep this workspace's tasks in sync while the screen is open. */
export function useTeamTaskRealtime(teamId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!teamId) return;
    const channel = teamTasksRealtimeChannel(teamId);
    realtimeClient.subscribe([channel]);
    const offTask = realtimeClient.onTaskUpdated((event) => {
      if (event.teamId !== teamId) return;
      applyTeamTaskUpdatedEvent(queryClient, event);
    });
    let sawStatus = false;
    const offStatus = realtimeClient.onStatus((connected) => {
      if (!sawStatus) {
        sawStatus = true;
        return;
      }
      if (!connected) return;
      invalidateTaskCaches(queryClient, teamId);
      void queryClient.invalidateQueries({ queryKey: ["task"] });
      void queryClient.invalidateQueries({ queryKey: ["task-notes", teamId] });
    });
    return () => {
      offTask();
      offStatus();
      realtimeClient.unsubscribe([channel]);
    };
  }, [teamId, queryClient]);
}
