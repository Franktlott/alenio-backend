import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "./AppText";

/** Small uppercase label above a group, with an optional action on the right. */
export function SectionHeader({
  label,
  action,
  style,
}: {
  label: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        style,
      ]}
    >
      <AppText variant="sectionLabel">{label}</AppText>
      {action}
    </View>
  );
}

/** Large page title with optional subtitle, for pages without a header band. */
export function PageHeader({
  title,
  subtitle,
  action,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 14 }, style]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="pageTitle">{title}</AppText>
        {subtitle ? (
          <AppText variant="supporting" style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}
