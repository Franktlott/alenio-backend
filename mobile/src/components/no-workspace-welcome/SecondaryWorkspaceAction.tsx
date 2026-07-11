import { Pressable, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { WELCOME_UI } from "./welcome-ui";

type Props = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

export function SecondaryWorkspaceAction({ label, icon: Icon, onPress, accessibilityLabel, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => ({
        height: WELCOME_UI.buttonHeight,
        borderRadius: WELCOME_UI.buttonRadius,
        borderWidth: 1,
        borderColor: WELCOME_UI.primary,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        opacity: pressed ? 0.92 : 1,
        alignSelf: "stretch",
        width: "100%",
      })}
    >
      <Icon size={18} color={WELCOME_UI.primary} strokeWidth={2.2} />
      <Text style={{ fontSize: 17, fontWeight: "700", color: WELCOME_UI.primary }}>{label}</Text>
    </Pressable>
  );
}
