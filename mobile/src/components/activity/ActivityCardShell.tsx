import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { ActivityFeedType } from "./types";
import { ACTIVITY_COLORS, ACTIVITY_LAYOUT, getActivityTintTokens } from "./activity-ui";

type Props = {
  type: ActivityFeedType;
  children: ReactNode;
  footer?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
};

export function ActivityCardShell({
  type,
  children,
  footer,
  onPress,
  onLongPress,
  testID,
}: Props) {
  const tint = getActivityTintTokens(type);

  return (
    <View style={{ marginHorizontal: 14 }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        testID={testID}
        style={({ pressed }) => ({
          width: "100%",
          backgroundColor: tint.background,
          borderBottomWidth: 0.75,
          borderBottomColor: ACTIVITY_COLORS.slate100,
          opacity: pressed && onPress ? 0.94 : 1,
        })}
      >
        <View style={{ width: "100%", paddingVertical: 8, gap: ACTIVITY_LAYOUT.cardGap }}>
          {children}
          {footer ? <View>{footer}</View> : null}
        </View>
      </Pressable>
    </View>
  );
}
