import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  label: string;
  onPress: () => void;
  accentColor?: string;
  /** link = text only; pill = soft fill; ghost = outlined */
  variant?: "link" | "pill" | "ghost";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ActivityActionButton({
  label,
  onPress,
  accentColor = ACTIVITY_COLORS.primary,
  variant = "ghost",
  style,
  testID,
}: Props) {
  if (variant === "pill") {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        testID={testID}
        style={({ pressed }) => [
          {
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: `${accentColor}12`,
            opacity: pressed ? 0.75 : 1,
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 12, fontWeight: "600", color: accentColor }}>{label}</Text>
      </Pressable>
    );
  }

  if (variant === "ghost") {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={6}
        testID={testID}
        accessibilityRole="button"
        style={({ pressed }) => [
          {
            minHeight: 28,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 7,
            borderWidth: 1,
            borderColor: accentColor,
            backgroundColor: "transparent",
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 12, fontWeight: "600", color: accentColor }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: 28,
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: accentColor }}>{label}</Text>
    </Pressable>
  );
}
