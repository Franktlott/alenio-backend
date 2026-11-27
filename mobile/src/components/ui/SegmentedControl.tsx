import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors } from "@/theme";

export type SegmentOption<K extends string> = {
  key: K;
  label: string;
  Icon?: LucideIcon;
  /** Red count shown while the segment is not selected. */
  badge?: number;
};

/**
 * View switcher.
 * - quiet: soft gray track, white selected pill, ink label
 * - brand: floating white track, solid brand selected pill (My Network mock)
 */
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  style,
  testID,
  testIDPrefix,
  variant = "quiet",
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Each segment gets `${testIDPrefix}-${key}`. */
  testIDPrefix?: string;
  variant?: "quiet" | "brand";
}) {
  const brand = variant === "brand";
  return (
    <View
      style={[styles.track, brand ? styles.trackBrand : null, style]}
      testID={testID}
      accessibilityRole="tablist"
    >
      {options.map(({ key, label, Icon, badge = 0 }) => {
        const selected = value === key;
        const showBadge = badge > 0 && !selected;
        const ink = brand
          ? selected
            ? "#FFFFFF"
            : colors.brand
          : selected
            ? colors.textPrimary
            : colors.textMuted;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[
              styles.tab,
              selected
                ? brand
                  ? styles.tabSelectedBrand
                  : styles.tabSelected
                : null,
            ]}
            testID={testIDPrefix ? `${testIDPrefix}-${key}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={showBadge ? `${label}, ${badge} new` : label}
          >
            {Icon ? (
              <Icon size={14} color={ink} strokeWidth={selected ? 2.4 : 2.1} />
            ) : null}
            <Text
              style={[
                styles.label,
                brand ? styles.labelBrand : null,
                selected
                  ? brand
                    ? styles.labelSelectedBrand
                    : styles.labelSelected
                  : null,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {showBadge ? (
              <View
                style={styles.badge}
                testID={
                  testIDPrefix ? `${testIDPrefix}-${key}-badge` : undefined
                }
              >
                <Text style={styles.badgeText}>
                  {badge > 9 ? "9+" : String(badge)}
                </Text>
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
    height: 40,
    padding: 3,
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 12,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  trackBrand: {
    height: 48,
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderColor: "rgba(15, 23, 42, 0.06)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 9,
  },
  tabSelected: {
    backgroundColor: colors.surface,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabSelectedBrand: {
    borderRadius: 999,
    backgroundColor: colors.brand,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: colors.textMuted,
  },
  labelBrand: {
    color: colors.brand,
    fontWeight: "700",
  },
  labelSelected: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  labelSelectedBrand: {
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
