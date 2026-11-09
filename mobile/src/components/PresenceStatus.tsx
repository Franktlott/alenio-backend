import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

type Props = {
  activeNow?: boolean;
  label?: string;
  color?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function PresenceStatus({
  activeNow = false,
  label = "Active now",
  color = "#64748B",
  style,
  textStyle,
  testID,
}: Props) {
  if (!activeNow) return null;

  return (
    <View
      accessible
      accessibilityLabel={label}
      testID={testID}
      style={[styles.row, style]}
    >
      <View style={styles.dot} />
      <Text style={[styles.label, { color }, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#34C759",
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
});
