import { Children, Fragment, isValidElement, useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { elevation, palette } from "@/theme";
import { AppText } from "./AppText";

/**
 * The app's table: a raised card of rows with hairline dividers.
 * Mirrors web `AlenioList`. Pass `card={false}` when it already sits in a card.
 */
export function AlenioList({
  children,
  card = true,
  style,
  testID,
}: {
  children: ReactNode;
  card?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      testID={testID}
      style={[card ? { ...elevation.card, borderRadius: 18, paddingHorizontal: 14 } : null, style]}
    >
      {rows.map((row, index) => (
        <Fragment key={row.key ?? index}>
          {index > 0 ? <View style={{ height: 1, backgroundColor: palette.rowDivider }} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** One row: leading avatar/icon, title and subtitle, trailing meta or control. */
export function AlenioListRow({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Shows a chevron when the row is pressable and nothing else is trailing. */
  chevron?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const [pressed, setPressed] = useState(false);
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === "string" ? (
          <AppText variant="rowTitle" numberOfLines={1}>
            {title}
          </AppText>
        ) : (
          title
        )}
        {subtitle == null ? null : typeof subtitle === "string" ? (
          <AppText variant="supporting" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : (
          subtitle
        )}
      </View>
      {trailing}
      {chevron && onPress && !trailing ? (
        <ChevronRight size={16} color={palette.inkMuted} strokeWidth={2.2} />
      ) : null}
    </>
  );
  const rowStyle: ViewStyle = { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 };
  if (!onPress) {
    return (
      <View testID={testID} style={[rowStyle, style]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[rowStyle, pressed ? { opacity: 0.7 } : null, style]}
    >
      {body}
    </Pressable>
  );
}
