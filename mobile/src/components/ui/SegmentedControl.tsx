import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, elevation, palette } from "@/theme";

export type SegmentOption<K extends string> = {
  key: K;
  label: string;
  Icon?: LucideIcon;
  /** Red count shown while the segment is not selected. */
  badge?: number;
};

/** Raised track with a violet selected pill. Mirrors web `SegmentedControl`. */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  style,
  testID,
  testIDPrefix,
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Each segment gets `${testIDPrefix}-${key}`. */
  testIDPrefix?: string;
}) {
  return (
    <View style={[styles.track, style]} testID={testID} accessibilityRole="tablist">
      {options.map(({ key, label, Icon, badge = 0 }) => {
        const selected = value === key;
        const showBadge = badge > 0 && !selected;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.tab, selected ? styles.tabSelected : null]}
            testID={testIDPrefix ? `${testIDPrefix}-${key}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={showBadge ? `${label}, ${badge} new` : label}
          >
            {Icon ? (
              <Icon
                size={13}
                color={selected ? "#FFFFFF" : colors.textMuted}
                strokeWidth={selected ? 2.4 : 2.1}
              />
            ) : null}
            <Text style={[styles.label, selected ? styles.labelSelected : null]} numberOfLines={1}>
              {label}
            </Text>
            {showBadge ? (
              <View
                style={styles.badge}
                testID={testIDPrefix ? `${testIDPrefix}-${key}-badge` : undefined}
              >
                <Text style={styles.badgeText}>{badge > 9 ? "9+" : String(badge)}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    ...elevation.card,
    height: 34,
    padding: 2,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 10,
    shadowOpacity: 0.05,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 8,
  },
  tabSelected: {
    backgroundColor: palette.violet,
    shadowColor: palette.violetBright,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  labelSelected: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
});
