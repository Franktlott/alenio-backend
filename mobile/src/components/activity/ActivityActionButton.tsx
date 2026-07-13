import { Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  label: string;
  onPress: () => void;
  accentColor?: string;
  /** Right-aligned pill for balanced card footers */
  variant?: "link" | "pill";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ActivityActionButton({
  label,
  onPress,
  accentColor = ACTIVITY_COLORS.primary,
  variant = "link",
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
