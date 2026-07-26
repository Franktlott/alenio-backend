import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SenecaAssistantSheet } from "./SenecaAssistantSheet";
import { SenecaIcon } from "./SenecaIcon";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import {
  SENECA_FAB_RIGHT_INSET,
  SENECA_FAB_SIZE,
  TAB_BAR_HEIGHT,
} from "@/lib/tab-bar";

const FAB_ABOVE_NAV_GAP = 12;

function canUseSeneca(role?: string | null): boolean {
  return role === "owner" || role === "team_leader";
}

export function SenecaFloatingLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const activeRole = teams?.find((t) => t.id === activeTeamId)?.role;
  const showSeneca = !!session?.user && !!activeTeamId && canUseSeneca(activeRole);

  if (!showSeneca) return null;

  const padBottom = insets.bottom + TAB_BAR_HEIGHT + FAB_ABOVE_NAV_GAP;
  const padRight = Math.max(insets.right, SENECA_FAB_RIGHT_INSET);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.overlay,
          { paddingBottom: padBottom, paddingRight: padRight },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Seneca leadership assistant"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setOpen(true);
          }}
          style={({ pressed }) => [styles.shadowWrap, pressed && styles.buttonPressed]}
          testID="seneca-floating-launcher"
        >
          <SenecaIcon size={SENECA_FAB_SIZE} style={styles.icon} />
        </Pressable>
      </View>
      <SenecaAssistantSheet
        open={open}
        onClose={() => setOpen(false)}
        teamId={activeTeamId}
      />
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
  shadowWrap: {
    width: SENECA_FAB_SIZE,
    height: SENECA_FAB_SIZE,
    borderRadius: SENECA_FAB_SIZE / 2,
    shadowColor: "#312E81",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    borderRadius: SENECA_FAB_SIZE / 2,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },
});
