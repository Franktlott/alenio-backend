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
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      testID={testID}
      style={({ pressed }) => ({
        marginHorizontal: ACTIVITY_LAYOUT.cardMarginHorizontal,
        marginVertical: ACTIVITY_LAYOUT.cardMarginVertical,
        backgroundColor: tint.background,
        borderBottomWidth: 1,
        borderBottomColor: ACTIVITY_COLORS.slate100,
        opacity: pressed && onPress ? 0.94 : 1,
      })}
    >
      <View style={{ paddingHorizontal: 14, paddingVertical: ACTIVITY_LAYOUT.cardPadding, gap: ACTIVITY_LAYOUT.cardGap }}>
        {children}
        {footer ? <View>{footer}</View> : null}
      </View>
    </Pressable>
  );
}
