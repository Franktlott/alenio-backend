import { StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

type Props = {
  Icon: LucideIcon;
  label: string;
  /** Drives the glyph, the text and the tinted surface behind them. */
  color: string;
  testID?: string;
};

/** The small labelled chip that opens a feed card's body. */
export function FeedEventPill({ Icon, label, color, testID }: Props) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: `${color}14`, borderColor: `${color}3D` },
      ]}
      testID={testID}
    >
      <Icon size={10} color={color} strokeWidth={2.6} />
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});
