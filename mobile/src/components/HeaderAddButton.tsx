import { Pressable, StyleSheet } from "react-native";
import { Plus } from "lucide-react-native";

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

/** Compact circular + for AppTabHeader rightAction (Chat / Team / Workspace). */
export function HeaderAddButton({ onPress, accessibilityLabel, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Plus size={18} color="white" strokeWidth={2.25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  pressed: {
    backgroundColor: "rgba(255,255,255,0.32)",
  },
});
