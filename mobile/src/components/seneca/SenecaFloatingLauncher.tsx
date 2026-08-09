import { useEffect } from "react";
import { DeviceEventEmitter, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { hasWorkspaceTaskAccess } from "@/lib/plan-access-copy";
import {
  SENECA_FAB_RIGHT_INSET,
  SENECA_FAB_VISIBLE_SIZE,
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_HEIGHT,
} from "@/lib/tab-bar";

const FAB_ABOVE_NAV_GAP = 12;

export const WORKSPACE_OPEN_ADD_EVENT = "alenio:workspace-open-add";
export const ACTIVITY_OPEN_CELEBRATE_EVENT = "alenio:activity-open-celebrate";

export function openWorkspaceAddSheet() {
  DeviceEventEmitter.emit(WORKSPACE_OPEN_ADD_EVENT);
}

export function openActivityCelebrate() {
  DeviceEventEmitter.emit(ACTIVITY_OPEN_CELEBRATE_EVENT);
}

export function useWorkspaceAddFabListener(onOpen: () => void) {
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WORKSPACE_OPEN_ADD_EVENT, onOpen);
    return () => sub.remove();
  }, [onOpen]);
}

export function useActivityCelebrateFabListener(onOpen: () => void) {
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ACTIVITY_OPEN_CELEBRATE_EVENT, onOpen);
    return () => sub.remove();
  }, [onOpen]);
}

/**
 * Contextual solid-blue action above the tab bar for Activity and Workspace.
 * Seneca itself is a permanent tab-bar option.
 */
export function ContextualActionLauncher() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const persistedPlan = useSubscriptionStore((s) => s.plan);
  const { data: session } = useSession();

  const routePath = segments.join("/");
  const onActivityTab = routePath.includes("activity");
  const onWorkspaceTab = routePath.includes("execute");

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId && !!session?.user,
    staleTime: 1000 * 60 * 5,
  });

  const hasCelebrateAccess = hasWorkspaceTaskAccess(subscription, persistedPlan);

  const primaryAction = !session?.user || !activeTeamId
    ? null
    : onWorkspaceTab
      ? { label: "Add task or event", testID: "workspace-add-fab", onPress: openWorkspaceAddSheet }
      : onActivityTab && hasCelebrateAccess
        ? { label: "Celebrate", testID: "celebrate-button", onPress: openActivityCelebrate }
        : null;

  if (!primaryAction) return null;

  const padBottom = insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + FAB_ABOVE_NAV_GAP;
  const padRight = Math.max(insets.right, SENECA_FAB_RIGHT_INSET);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { paddingBottom: padBottom, paddingRight: padRight }]}
    >
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          primaryAction.onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={primaryAction.label}
        testID={primaryAction.testID}
        style={({ pressed }) => [styles.primaryFab, pressed ? styles.pressed : null]}
      >
        <Plus size={20} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10050,
    elevation: 10050,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  primaryFab: {
    width: SENECA_FAB_VISIBLE_SIZE,
    height: SENECA_FAB_VISIBLE_SIZE,
    borderRadius: SENECA_FAB_VISIBLE_SIZE / 2,
    backgroundColor: "#4361EE",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E293B",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
