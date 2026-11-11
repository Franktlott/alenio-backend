import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { elevation } from "@/theme";
import { AppText } from "./AppText";
import { Button } from "./Button";
import { IconTile, type TintName } from "./IconTile";

/**
 * "Nothing here yet" block: icon, title, one line of help and an action.
 * `card` wraps it in a raised card; leave it off when it sits inside one.
 */
export function EmptyState({
  icon,
  tint = "lavender",
  title,
  body,
  actionLabel,
  actionIcon,
  onAction,
  card = false,
  style,
  testID,
}: {
  icon?: ReactNode;
  tint?: TintName;
  title: string;
  body?: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onAction?: () => void;
  card?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        { alignItems: "center", paddingVertical: 22, paddingHorizontal: 16 },
        card ? { ...elevation.card, borderRadius: 18 } : null,
        style,
      ]}
    >
      {icon ? (
        <IconTile tint={tint} size={40} style={{ borderRadius: 20, marginBottom: 8 }}>
          {icon}
        </IconTile>
      ) : null}
      <AppText variant="rowTitle" style={{ fontSize: 14, textAlign: "center", letterSpacing: -0.2 }}>
        {title}
      </AppText>
      {body ? (
        <AppText
          variant="supporting"
          style={{ fontSize: 12, lineHeight: 16, marginTop: 4, textAlign: "center", maxWidth: 260 }}
        >
          {body}
        </AppText>
      ) : null}
      {onAction && actionLabel ? (
        <Button
          variant="soft"
          size="sm"
          label={actionLabel}
          icon={actionIcon}
          onPress={onAction}
          testID={testID ? `${testID}-action` : undefined}
          style={{ alignSelf: "center", marginTop: 12 }}
        />
      ) : null}
    </View>
  );
}
