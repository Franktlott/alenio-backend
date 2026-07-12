import { Pressable, Text, View } from "react-native";
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
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        justifyContent: "space-between",
      }}
      testID={testID}
    >
      {CELEBRATION_TYPE_KEYS.map((key) => {
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
            style={({ pressed }) => ({
              width: "31.5%",
              borderRadius: 12,
              overflow: "hidden",
              opacity: pressed ? 0.9 : 1,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? theme.chip : "#E2E8F0",
            })}
          >
            <LinearGradient
              colors={theme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 12,
                paddingBottom: 10,
                paddingHorizontal: 6,
                minHeight: 78,
              }}
            >
              {isSelected ? (
                <View
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={10} color={theme.chip} strokeWidth={3} />
                </View>
              ) : null}

              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: "rgba(255,255,255,0.22)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 6,
                }}
              >
                <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
              </View>

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  color: "#FFFFFF",
                  textAlign: "center",
                  lineHeight: 13,
                }}
                numberOfLines={2}
              >
                {theme.label}
              </Text>
            </LinearGradient>
          </Pressable>
        );
      })}
    </View>
  );
}
