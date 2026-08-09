import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, radii } from "@/theme";
import { WS } from "./workspace-ui";

type Props = {
  dayLabel?: string;
  onAdd?: () => void;
};

/** Centered actionable empty state for the selected calendar day. */
export function CalendarDayEmptyState({ onAdd }: Props) {
  return (
    <View style={styles.card} testID="calendar-day-empty-state">
      <View style={styles.content}>
        <View style={styles.message}>
          <Text style={styles.title}>Nothing planned</Text>
          <Text style={styles.subtitle}>This day is open.</Text>
        </View>

        <View style={styles.ctaSlot}>
          <Pressable
            onPress={onAdd}
            testID="calendar-day-empty-add"
            hitSlop={8}
            style={styles.cta}
            accessibilityRole="button"
            accessibilityLabel="Schedule something"
          >
            <Text style={styles.ctaText} numberOfLines={1}>
              + Schedule something
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 0,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderCard,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  message: {
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "700",
    color: WS.ink,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: WS.muted,
    textAlign: "center",
  },
  ctaSlot: {
    alignItems: "center",
    marginTop: 6,
  },
  cta: {
    flexShrink: 0,
    minWidth: 134,
    minHeight: 32,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "700",
  },
});
