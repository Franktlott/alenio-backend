import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { ActivityFeedType } from "./types";
import { ACTIVITY_LAYOUT, getActivityTintTokens } from "./activity-ui";

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
        borderRadius: ACTIVITY_LAYOUT.cardRadius,
        backgroundColor: tint.background,
        borderWidth: 1,
        borderColor: tint.border,
        overflow: "hidden",
        opacity: pressed && onPress ? 0.94 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <View style={{ width: 2, backgroundColor: tint.rail }} />
        <View style={{ flex: 1, padding: ACTIVITY_LAYOUT.cardPadding, gap: ACTIVITY_LAYOUT.cardGap }}>
          {children}
          {footer ? <View style={{ marginTop: 1 }}>{footer}</View> : null}
        </View>
      </View>
    </Pressable>
  );
}
