import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SenecaAssistantSheet } from "./SenecaAssistantSheet";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import {
  SENECA_FAB_RIGHT_INSET,
  SENECA_FAB_SIZE,
  TAB_BAR_HEIGHT,
} from "@/lib/tab-bar";

const senecaIcon = require("@/assets/seneca-icon.png");

const FAB_ABOVE_NAV_GAP = 12;
/** Fill most of the white circle; contain keeps the tall mark from clipping. */
const ICON_SIZE = Math.round(SENECA_FAB_SIZE * 0.82);

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
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          testID="seneca-floating-launcher"
        >
          <Image
            source={senecaIcon}
            style={styles.icon}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
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
  button: {
    width: SENECA_FAB_SIZE,
    height: SENECA_FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: SENECA_FAB_SIZE / 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
});
