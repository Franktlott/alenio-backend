import { Image, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useSenecaSheetStore } from "@/lib/state/seneca-sheet-store";
import { HEADER_BUTTON_HIT_SLOP } from "@/lib/header-brand";

export function HeaderSenecaButton() {
  const open = useSenecaSheetStore((state) => state.open);
  const openSheet = useSenecaSheetStore((state) => state.openSheet);
  const closeSheet = useSenecaSheetStore((state) => state.closeSheet);

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (open) closeSheet();
        else openSheet();
      }}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel="Open Seneca leadership assistant"
      accessibilityState={{ selected: open }}
      testID="header-seneca-button"
      style={({ pressed }) => [
        styles.button,
        open ? styles.buttonOpen : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Image
        source={require("@/assets/seneca-button-icon.png")}
        style={styles.icon}
        resizeMode="cover"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(105, 71, 232, 0.12)",
  },
  buttonOpen: {
    borderColor: "#4361EE",
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pressed: {
    opacity: 0.8,
  },
});
