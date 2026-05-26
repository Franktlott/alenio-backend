import { useCallback, useEffect, useRef } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { useIsFetching } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { AlenioWorkspaceLoading } from "@/components/AlenioWorkspaceLoading";
import { useTeamStore } from "@/lib/state/team-store";
import { useWorkspaceSwitchStore } from "@/lib/state/workspace-switch-store";
import {
  WORKSPACE_OVERLAY_MIN_MS,
  isWorkspaceSwitchFetch,
} from "@/lib/workspace-switch";

export function WorkspaceSwitchOverlay() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const showOverlay = useWorkspaceSwitchStore((s) => s.showOverlay);
  const sessionActive = useWorkspaceSwitchStore((s) => s.sessionActive);
  const overlayStartedAt = useWorkspaceSwitchStore((s) => s.overlayStartedAt);
  const endSession = useWorkspaceSwitchStore((s) => s.endSession);
  const switchingToName = useWorkspaceSwitchStore((s) => s.switchingToName);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const isFetchingWorkspace = useIsFetching({
    predicate: (query) =>
      !!activeTeamId && sessionActive && isWorkspaceSwitchFetch(query, activeTeamId),
  });

  useEffect(() => {
    if (!sessionActive) {
      clearHideTimer();
      return;
    }

    if (isFetchingWorkspace > 0) {
      clearHideTimer();
      return;
    }

    const started = overlayStartedAt;
    if (started == null) {
      endSession();
      return;
    }

    const elapsed = Date.now() - started;
    const remaining = WORKSPACE_OVERLAY_MIN_MS - elapsed;

    if (remaining <= 0) {
      endSession();
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      endSession();
    }, remaining);

    return () => clearHideTimer();
  }, [
    sessionActive,
    isFetchingWorkspace,
    overlayStartedAt,
    endSession,
    clearHideTimer,
  ]);

  if (!showOverlay) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.dim} />
        <AlenioWorkspaceLoading
          label={switchingToName ? `Switching to ${switchingToName}` : "Switching workspace"}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
});
