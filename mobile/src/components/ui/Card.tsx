import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { elevation } from "@/theme";
import { AppText } from "./AppText";
import { IconTile, type TintName } from "./IconTile";

/** White raised card on the warm page. Mirrors web `Card`. */
export function Card({
  padded = true,
  style,
  ...rest
}: ViewProps & { padded?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[elevation.card, padded ? { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 } : null, style]}
      {...rest}
    />
  );
}

/**
 * Card header: tinted icon tile, title, optional subtitle and a right-side
 * action (usually a `Button variant="link"`). Mirrors web `PanelHeader`.
 */
export function PanelHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  tint = "lavender",
  action,
  style,
}: {
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tint?: TintName;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, style]}>
      {icon ? <IconTile tint={tint}>{icon}</IconTile> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <AppText variant="sectionLabel">{eyebrow}</AppText> : null}
        <AppText variant="sectionTitle" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="supporting" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** A `Card` with a `PanelHeader` on top. Mirrors web `Panel`. */
export function Panel({
  title,
  subtitle,
  icon,
  tint,
  action,
  children,
  style,
  testID,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  tint?: TintName;
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Card style={style} testID={testID}>
      <PanelHeader title={title} subtitle={subtitle} icon={icon} tint={tint} action={action} />
      {children}
    </Card>
  );
}
