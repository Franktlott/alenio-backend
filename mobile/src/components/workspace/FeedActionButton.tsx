import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import type { LucideIcon } from "lucide-react-native";

const ACTIVE = "#6d28d9";
const INACTIVE = "#8A94A6";
const POP_SPRING = { damping: 14, stiffness: 340, mass: 0.5 };

type Props = {
  Icon: LucideIcon;
  label: string;
  active?: boolean;
  filled?: boolean;
  /** Reaction emoji shown in place of the icon once someone has reacted. */
  glyph?: string | null;
  /** Accent for the reaction a person picked; defaults to Alenio indigo. */
  activeColor?: string;
  /** Facebook-style action bar: fill the slot and center the control. */
  block?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
};

/** Compact feed action with a 44pt touch target. */
export function FeedActionButton({
  Icon,
  label,
  active = false,
  filled = false,
  glyph,
  activeColor = ACTIVE,
  block = false,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: Props) {
  const color = active ? activeColor : INACTIVE;
  const scale = useSharedValue(1);

  // The icon pops the moment a reaction lands, matching the chat menu.
  useEffect(() => {
    if (!active) return;
    scale.value = withSequence(
      withSpring(1.35, POP_SPRING),
      withSpring(1, POP_SPRING),
    );
  }, [active, glyph, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      onPressIn={() => {
        scale.value = withSpring(0.9, POP_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, POP_SPRING);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      // Narrow horizontal slop so neighbouring buttons sitting close together
      // never overlap each other's touch area; vertical slop covers the 44pt.
      hitSlop={block ? undefined : { top: 8, bottom: 8, left: 4, right: 4 }}
      // Plain style: css-interop ignores the function form on Pressable, and the
      // icon already springs on press, so nothing is lost.
      style={[styles.button, block ? styles.buttonBlock : null]}
    >
      <View style={[styles.content, block ? styles.contentBlock : null]}>
        <Animated.View
          style={[styles.iconSlot, glyph ? styles.iconSlotGlyph : null, iconStyle]}
        >
          {glyph ? (
            <Text style={styles.glyph} allowFontScaling={false}>
              {glyph}
            </Text>
          ) : (
            <Icon
              size={block ? 18 : 17}
              color={color}
              fill={active && filled ? activeColor : "transparent"}
              strokeWidth={2.1}
            />
          )}
        </Animated.View>
        {label ? (
          <Text style={[styles.label, block ? styles.labelBlock : null, { color }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Visually tight; hitSlop keeps the tappable area at 44pt.
    minHeight: 24,
    justifyContent: "center",
    paddingRight: 14,
  },
  buttonBlock: {
    flex: 1,
    minHeight: 40,
    paddingRight: 0,
    paddingHorizontal: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  contentBlock: {
    justifyContent: "center",
    width: "100%",
  },
  iconSlot: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSlotGlyph: {
    // An iOS emoji is wider than it is tall, so it needs more room than a
    // Lucide glyph or its right edge gets shaved off.
    width: 22,
  },
  glyph: {
    fontSize: 15,
    lineHeight: 19,
    textAlign: "center",
  },
  label: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  labelBlock: {
    fontSize: 13,
    fontWeight: "700",
  },
});
