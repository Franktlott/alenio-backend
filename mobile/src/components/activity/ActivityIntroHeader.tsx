import { Pressable, StyleSheet, Text, View } from "react-native";
import { SlidersHorizontal } from "lucide-react-native";
import type { ActivityFilter } from "./types";
import { ACTIVITY_FILTER_OPTIONS } from "./types";

type Props = {
  filter: ActivityFilter;
  onSelectFilter: (filter: ActivityFilter) => void;
  onPressFilterIcon?: () => void;
  testID?: string;
};

const CHIP_ACTIVE = "#4361EE";
const CHIP_BORDER = "#D8DEE6";
const CHIP_TEXT = "#1E293B";
const EDGE_PAD = 14;

export function ActivityIntroHeader({
  filter,
  onSelectFilter,
  onPressFilterIcon,
  testID = "activity-intro-header",
}: Props) {
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.chipsRow}>
        {ACTIVITY_FILTER_OPTIONS.map((option) => {
          const selected = filter === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => onSelectFilter(option.key)}
              testID={`${testID}-chip-${option.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              hitSlop={4}
              style={styles.chipPressable}
            >
              <View style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}>
                <Text
                  style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextIdle]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.9}
                >
                  {option.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={onPressFilterIcon}
        disabled={!onPressFilterIcon}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Filters"
        testID={`${testID}-sliders`}
        style={({ pressed }) => [styles.slidersBtn, pressed ? { opacity: 0.55 } : null]}
      >
        <SlidersHorizontal size={15} color="#64748B" strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: EDGE_PAD,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  chipPressable: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    minHeight: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: CHIP_ACTIVE,
    borderColor: CHIP_ACTIVE,
  },
  chipIdle: {
    backgroundColor: "#FFFFFF",
    borderColor: CHIP_BORDER,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  chipTextIdle: {
    color: CHIP_TEXT,
  },
  slidersBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
