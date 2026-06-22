import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { SenecaIcon } from "./SenecaIcon";
import { SenecaAssistantSheet } from "./SenecaAssistantSheet";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";

const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = 12;
const FAB_ABOVE_NAV_GAP = 10;
const FAB_SIZE = 52;
const FAB_RIGHT = 20;

export function SenecaFloatingLauncher() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();

  if (!session?.user) return null;

  const bottom = insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + FAB_ABOVE_NAV_GAP;

  return (
    <>
      <View pointerEvents="box-none" style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Seneca leadership assistant"
          accessibilityState={{ expanded: open }}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setOpen(true);
          }}
          style={[styles.button, { bottom, right: FAB_RIGHT }]}
          testID="seneca-floating-launcher"
        >
          <SenecaIcon size={FAB_SIZE - 4} />
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
    ...StyleSheet.absoluteFill,
    zIndex: 9998,
    elevation: 9998,
  },
  button: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderRadius: FAB_SIZE / 2,
    shadowColor: "#4361EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
});
