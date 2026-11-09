import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Check } from "lucide-react-native";
import {
  CELEBRATION_TYPE_KEYS,
  getCelebrationCardTheme,
  type CelebrationTypeKey,
} from "./celebration-themes";

type Props = {
  selected: string;
  onSelect: (key: CelebrationTypeKey) => void;
  testID?: string;
};

/** Compact celebration chooser: icon + celebration name only (no tags). */
export function CelebrationTypePickerCards({ selected, onSelect, testID = "celebration-type-picker" }: Props) {
  const rows = [
    CELEBRATION_TYPE_KEYS.slice(0, 5),
    CELEBRATION_TYPE_KEYS.slice(5, 10),
  ];

  return (
    <View style={styles.grid} testID={testID}>
      {rows.map((row, rowIndex) => (
        <View key={`recognition-row-${rowIndex}`} style={styles.row}>
          {row.map((key) => {
            const theme = getCelebrationCardTheme(key);
            const Icon = theme.Icon;
            const isSelected = selected === key;

            return (
              <Pressable
                key={key}
                testID={`celebrate-type-${key}`}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={theme.label}
                style={({ pressed }) => [
                  styles.option,
                  pressed ? styles.optionPressed : null,
                ]}
              >
                <View style={styles.iconWrap}>
                  <LinearGradient
                    colors={theme.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.icon,
                      isSelected
                        ? { borderColor: theme.chip, borderWidth: 2 }
                        : null,
                    ]}
                  >
                    <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
                  </LinearGradient>
                  {isSelected ? (
                    <View style={[styles.check, { backgroundColor: theme.chip }]}>
                      <Check size={9} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.label,
                    isSelected ? { color: theme.chip } : null,
                  ]}
                  numberOfLines={2}
                >
                  {theme.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: "stretch",
    rowGap: 9,
  },
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 4,
  },
  optionPressed: {
    opacity: 0.72,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignSelf: "center",
    alignItems: "center",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#FFFFFF",
  },
  check: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  label: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 18,
    paddingHorizontal: 1,
    fontSize: 7.75,
    lineHeight: 9,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
  },
});
