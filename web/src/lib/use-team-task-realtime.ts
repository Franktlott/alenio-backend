import { useEffect } from "react";
import { webRealtimeClient, teamTasksRealtimeChannel, type WebTaskUpdatedEvent } from "./realtime-client";

export function useTeamTaskRealtime(
  teamId: string | null | undefined,
  onEvent: (event: WebTaskUpdatedEvent) => void,
) {
  useEffect(() => {
    if (!teamId) return;
    const channel = teamTasksRealtimeChannel(teamId);
    webRealtimeClient.subscribe([channel]);
    const off = webRealtimeClient.onTaskUpdated((event) => {
      if (event.teamId !== teamId) return;
      onEvent(event);
    });
    return () => {
      off();
      webRealtimeClient.unsubscribe([channel]);
    };
  }, [teamId, onEvent]);
}
