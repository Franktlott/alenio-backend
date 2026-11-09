import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  resolveWorkspaceSpotlight,
  TEAMWORK_SPOTLIGHT,
  type ResolvedSpotlight,
  type SpotlightActivity,
  type SpotlightSource,
} from "@/lib/workspace-spotlight";

const SEP = "\u001f";

export function spotlightDismissalKey(
  userId: string,
  teamId: string,
  eventId: string,
): string {
  return `${userId}${SEP}${teamId}${SEP}${eventId}`;
}

export function dismissedSpotlightIds(
  dismissed: Readonly<Record<string, true>>,
  userId: string,
  teamId: string,
): Set<string> {
  const prefix = `${userId}${SEP}${teamId}${SEP}`;
  const ids = new Set<string>();
  for (const key of Object.keys(dismissed)) {
    if (key.startsWith(prefix)) ids.add(key.slice(prefix.length));
  }
  return ids;
}

type WorkspaceSpotlightStore = {
  dismissed: Record<string, true>;
  hydrated: boolean;
  dismiss: (userId: string, teamId: string, eventId: string) => void;
  setHydrated: () => void;
};

export const useWorkspaceSpotlightStore = create<WorkspaceSpotlightStore>()(
  persist(
    (set) => ({
      dismissed: {},
      hydrated: false,
      dismiss: (userId, teamId, eventId) =>
        set((state) => ({
          dismissed: {
            ...state.dismissed,
            [spotlightDismissalKey(userId, teamId, eventId)]: true,
          },
        })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "workspace-spotlight-dismissed",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ dismissed: state.dismissed }),
      onRehydrateStorage: () => () => {
        useWorkspaceSpotlightStore.getState().setHydrated();
      },
    },
  ),
);

type SpotlightQuery = {
  teamId: string | null;
  viewerId: string | null;
  workspaceCreatedAt?: string | null;
  activities: readonly SpotlightActivity[];
  status: SpotlightSource;
};

/**
 * Resolves the card for this viewer and workspace. The default picture shows
 * immediately. A welcome, milestone, or quiet card replaces it once the feed
 * and saved dismissals are in.
 */
export function useWorkspaceSpotlight(query: SpotlightQuery): {
  spotlight: ResolvedSpotlight | null;
  dismiss: () => void;
} {
  const hydrated = useWorkspaceSpotlightStore((state) => state.hydrated);
  const dismissed = useWorkspaceSpotlightStore((state) => state.dismissed);
  useEffect(() => {
    const markReady = () => useWorkspaceSpotlightStore.getState().setHydrated();
    if (useWorkspaceSpotlightStore.persist.hasHydrated()) {
      markReady();
      return;
    }
    return useWorkspaceSpotlightStore.persist.onFinishHydration(markReady);
  }, []);
  const dismissId = useWorkspaceSpotlightStore((state) => state.dismiss);
  const { teamId, viewerId, workspaceCreatedAt, activities, status } = query;

  const spotlight = useMemo(() => {
    if (!hydrated || status === "loading") return TEAMWORK_SPOTLIGHT;
    const dismissedIds =
      viewerId && teamId
        ? dismissedSpotlightIds(dismissed, viewerId, teamId)
        : new Set<string>();
    return resolveWorkspaceSpotlight({
      source: status,
      now: Date.now(),
      viewerId,
      workspaceCreatedAt,
      activities,
      dismissedIds,
    });
  }, [
    activities,
    dismissed,
    hydrated,
    status,
    teamId,
    viewerId,
    workspaceCreatedAt,
  ]);

  const dismiss = () => {
    if (!spotlight?.eventId || !viewerId || !teamId) return;
    dismissId(viewerId, teamId, spotlight.eventId);
  };

  return { spotlight, dismiss };
}
