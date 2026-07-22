import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
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
/** Extra lift on Chat so Seneca clears the pin hint / empty-state copy. */
const CHAT_FAB_EXTRA_LIFT = 28;
/** Snug white ring around the mark — not flush to the edge. */
const ICON_SIZE = Math.round(SENECA_FAB_SIZE * 0.78);

function canUseSeneca(role?: string | null): boolean {
  return role === "owner" || role === "team_leader";
}

function isChatRoute(pathname: string): boolean {
  return pathname === "/chat" || pathname.endsWith("/chat");
}

export function SenecaFloatingLauncher() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
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

  const chatLift = isChatRoute(pathname) ? CHAT_FAB_EXTRA_LIFT : 0;
  const padBottom = insets.bottom + TAB_BAR_HEIGHT + FAB_ABOVE_NAV_GAP + chatLift;
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
          <View style={styles.circle}>
            <Image
              source={senecaIcon}
              style={styles.icon}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </View>
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  circle: {
    width: SENECA_FAB_SIZE,
    height: SENECA_FAB_SIZE,
    borderRadius: SENECA_FAB_SIZE / 2,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
  },
});
