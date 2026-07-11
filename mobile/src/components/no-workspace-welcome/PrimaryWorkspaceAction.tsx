import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { WELCOME_UI } from "./welcome-ui";

type Props = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
};

export function PrimaryWorkspaceAction({ label, icon: Icon, onPress, accessibilityLabel, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1, alignSelf: "stretch" })}
    >
      <View
        style={{
          height: WELCOME_UI.buttonHeight,
          borderRadius: WELCOME_UI.buttonRadius,
          backgroundColor: WELCOME_UI.primary,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <Icon size={18} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#FFFFFF" }}>{label}</Text>
      </View>
    </Pressable>
  );
}
