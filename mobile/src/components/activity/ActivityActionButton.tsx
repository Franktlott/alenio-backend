import { Pressable, Text } from "react-native";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  label: string;
  onPress: () => void;
  accentColor?: string;
  testID?: string;
};

export function ActivityActionButton({
  label,
  onPress,
  accentColor = ACTIVITY_COLORS.primary,
  testID,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      testID={testID}
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        minHeight: 28,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: accentColor }}>{label}</Text>
    </Pressable>
  );
}
