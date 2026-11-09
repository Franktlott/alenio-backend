import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimeClient, teamTasksRealtimeChannel } from "@/lib/realtime-client";

/**
 * Home spans every workspace, so it listens on all of them at once and
 * refreshes Today when a task changes in any of them.
 */
export function useHomeScheduleRealtime(teamIds: string[]) {
  const queryClient = useQueryClient();
  /** A stable dependency, so a re-rendered array does not resubscribe. */
  const channelKey = teamIds.join(",");

  useEffect(() => {
    const ids = channelKey ? channelKey.split(",") : [];
    if (ids.length === 0) return;
    const channels = ids.map(teamTasksRealtimeChannel);
    realtimeClient.subscribe(channels);

    /** Bulk edits arrive as a burst; one refresh covers the whole run. */
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["home-today"] });
      }, 120);
    };

    const offTask = realtimeClient.onTaskUpdated((event) => {
      if (!ids.includes(event.teamId)) return;
      refresh();
    });
    /** The first status callback is the current state, not a reconnect. */
    let sawStatus = false;
    const offStatus = realtimeClient.onStatus((connected) => {
      if (!sawStatus) {
        sawStatus = true;
        return;
      }
      if (connected) refresh();
    });

    return () => {
      if (timer) clearTimeout(timer);
      offTask();
      offStatus();
      realtimeClient.unsubscribe(channels);
    };
  }, [channelKey, queryClient]);
}
