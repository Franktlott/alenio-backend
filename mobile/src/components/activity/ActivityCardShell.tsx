import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { ActivityFeedType } from "./types";
import {
  ACTIVITY_COLORS,
  ACTIVITY_LAYOUT,
  getActivityTintTokens,
} from "./activity-ui";

type Props = {
  type: ActivityFeedType;
  children: ReactNode;
  footer?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
  contained?: boolean;
};

export function ActivityCardShell({
  type,
  children,
  footer,
  onPress,
  onLongPress,
  testID,
  contained = false,
}: Props) {
  const tint = getActivityTintTokens(type);

  return (
    <View
      style={{
        marginHorizontal: contained ? 14 : 18,
        marginVertical: contained ? 4 : 0,
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          contained
            ? [styles.contained, { shadowColor: tint.accent }]
            : styles.standard,
          { opacity: pressed && onPress ? 0.94 : 1 },
        ]}
      >
        <View
          style={{
            width: "100%",
            paddingHorizontal: contained ? 12 : 0,
            paddingVertical: contained ? 10 : 7,
            gap: ACTIVITY_LAYOUT.cardGap,
          }}
        >
          {children}
          {footer ? <View>{footer}</View> : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: "100%", backgroundColor: "#FFFFFF" },
  standard: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ACTIVITY_COLORS.slate100,
  },
  contained: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E4E9F3",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.055,
    shadowRadius: 10,
    elevation: 2,
  },
});
