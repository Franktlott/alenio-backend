import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";
import { WS } from "./workspace-ui";

type Props = {
  dayLabel?: string;
  onAdd?: () => void;
};

/** Calm empty state for the selected calendar day. */
export function CalendarDayEmptyState({ onAdd }: Props) {
  return (
    <View style={styles.wrap} testID="calendar-day-empty-state">
      <Text style={styles.title}>Nothing scheduled</Text>
      <Text style={styles.subtitle}>
        No events, tasks, or holidays for this day.
      </Text>
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          testID="calendar-day-empty-add"
          style={({ pressed }) => [
            styles.cta,
            pressed ? styles.ctaPressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Add event"
        >
          <Text style={styles.ctaText}>+ Add event</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: WS.ink,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: WS.muted,
    textAlign: "center",
    maxWidth: 260,
  },
  cta: {
    minHeight: 32,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: {
    opacity: 0.7,
  },
  ctaText: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: "700",
  },
});
