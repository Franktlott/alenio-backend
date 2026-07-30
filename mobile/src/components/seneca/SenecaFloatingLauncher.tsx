import { useEffect, useState } from "react";
import { DeviceEventEmitter, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { Plus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { SenecaAssistantSheet } from "./SenecaAssistantSheet";
import { SenecaIcon } from "./SenecaIcon";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { hasTeamPlan, hasWorkspaceTaskAccess, isPersistedPaidPlan } from "@/lib/plan-access-copy";
import {
  SENECA_FAB_RIGHT_INSET,
  SENECA_FAB_SIZE,
  SENECA_FAB_VISIBLE_SIZE,
  TAB_BAR_BOTTOM_GAP,
  TAB_BAR_HEIGHT,
} from "@/lib/tab-bar";

const FAB_ABOVE_NAV_GAP = 12;
const FAB_STACK_GAP = 10;

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

function canUseSeneca(role?: string | null): boolean {
  return role === "owner" || role === "team_leader";
}

/**
 * One floating cluster above the tab bar:
 * optional solid-blue + (Activity / Workspace) stacked over Seneca.
 * Kept in the app shell so FABs stay visible and the tab bar doesn’t jump.
 */
export function SenecaFloatingLauncher() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const [open, setOpen] = useState(false);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const persistedPlan = useSubscriptionStore((s) => s.plan);
  const { data: session } = useSession();

  const onActivityTab = segments.includes("activity");
  const onWorkspaceTab = segments.includes("execute");

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId && !!session?.user,
    staleTime: 1000 * 60 * 5,
  });

  const activeRole = teams?.find((t) => t.id === activeTeamId)?.role;
  const hasProAccess = subscription ? hasTeamPlan(subscription) : isPersistedPaidPlan(persistedPlan);
  const hasCelebrateAccess = hasWorkspaceTaskAccess(subscription, persistedPlan);
  const showSeneca =
    !!session?.user && !!activeTeamId && canUseSeneca(activeRole) && hasProAccess;

  const primaryAction = !session?.user || !activeTeamId
    ? null
    : onWorkspaceTab
      ? { label: "Add task or event", testID: "workspace-add-fab", onPress: openWorkspaceAddSheet }
      : onActivityTab && hasCelebrateAccess
        ? { label: "Celebrate", testID: "celebrate-button", onPress: openActivityCelebrate }
        : null;

  if (!showSeneca && !primaryAction) return null;

  const padBottom = insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + FAB_ABOVE_NAV_GAP;
  const padRight = Math.max(insets.right, SENECA_FAB_RIGHT_INSET);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.overlay, { paddingBottom: padBottom, paddingRight: padRight }]}
      >
        <View pointerEvents="box-none" style={styles.stack}>
          {primaryAction ? (
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
          ) : null}

          {showSeneca ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Seneca leadership assistant"
              accessibilityState={{ expanded: open }}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setOpen(true);
              }}
              style={({ pressed }) => [styles.senecaWrap, pressed ? styles.pressed : null]}
              testID="seneca-floating-launcher"
            >
              <SenecaIcon size={SENECA_FAB_SIZE} style={styles.senecaIcon} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showSeneca && activeTeamId ? (
        <SenecaAssistantSheet open={open} onClose={() => setOpen(false)} teamId={activeTeamId} />
      ) : null}
    </>
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
  stack: {
    alignItems: "center",
    gap: FAB_STACK_GAP,
  },
  primaryFab: {
    width: SENECA_FAB_VISIBLE_SIZE,
    height: SENECA_FAB_VISIBLE_SIZE,
    borderRadius: SENECA_FAB_VISIBLE_SIZE / 2,
    backgroundColor: "#4361EE",
    alignItems: "center",
    justifyContent: "center",
    // Center over Seneca’s visible disc (Seneca asset has transparent padding)
    marginRight: (SENECA_FAB_SIZE - SENECA_FAB_VISIBLE_SIZE) / 2,
    shadowColor: "#1E293B",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  senecaWrap: {
    width: SENECA_FAB_SIZE,
    height: SENECA_FAB_SIZE,
    borderRadius: SENECA_FAB_SIZE / 2,
    shadowColor: "#312E81",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  senecaIcon: {
    borderRadius: SENECA_FAB_SIZE / 2,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
