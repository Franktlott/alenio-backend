import { Text, View } from "react-native";
import type { ReactNode } from "react";
import { ACTIVITY_COLORS, ACTIVITY_LAYOUT } from "./activity-ui";

type Props = {
  label: string;
  children: ReactNode;
  testID?: string;
};

export function ActivitySection({ label, children, testID }: Props) {
  return (
    <View style={{ gap: ACTIVITY_LAYOUT.sectionGap }} testID={testID}>
      <View style={{ paddingHorizontal: ACTIVITY_LAYOUT.cardMarginHorizontal }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: ACTIVITY_COLORS.sectionPillText,
            letterSpacing: 0.8,
          }}
        >
          {label}
        </Text>
      </View>
      <View style={{ gap: ACTIVITY_LAYOUT.cardGap }}>{children}</View>
    </View>
  );
}
