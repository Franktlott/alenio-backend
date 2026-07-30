import React from "react";
import { View, Text, Pressable, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, space, surfaces, typography } from "@/theme";

/** Compact Chat-density language for Profile and Team settings surfaces. */
export const PROFILE_UI = {
  pageBg: colors.pageBg,
  card: surfaces.groupedCard,
  sectionGap: space.section,
  sectionLabel: typography.sectionLabel,
  sectionSubtitle: typography.sectionSubtitle,
  rowTitle: typography.rowTitle,
  rowSubtitle: typography.rowSubtitle,
  divider: surfaces.divider,
  iconBox: {
    ...surfaces.iconBox,
    backgroundColor: colors.brandSoft,
  },
  /** Inset past icon + gap so dividers align under titles. */
  dividerInset: space.cardPadH + space.avatar + 10,
};

export function ProfileContent({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: space.pagePad, paddingTop: space.sm, gap: PROFILE_UI.sectionGap }}>
      {children}
    </View>
  );
}

export function ProfileSection({
  title,
  subtitle,
  action,
  titleAccessory,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  titleAccessory?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const fillsHeight = style != null && (style.flex === 1 || style.flexGrow === 1 || style.minHeight === 0);
  return (
    <View style={style}>
      <View style={{ marginBottom: 6, flexShrink: 0, paddingHorizontal: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={PROFILE_UI.sectionLabel}>{title}</Text>
            {titleAccessory}
          </View>
          {action ? <View style={{ flexShrink: 0, justifyContent: "center" }}>{action}</View> : null}
        </View>
        {subtitle ? (
          <Text style={[PROFILE_UI.sectionSubtitle, { marginTop: 2, alignSelf: "stretch" }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {fillsHeight ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : children}
    </View>
  );
}

export function ProfileCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[PROFILE_UI.card, style]}>{children}</View>;
}

export function ProfileDivider({ inset = false }: { inset?: boolean }) {
  return <View style={[PROFILE_UI.divider, inset ? { marginLeft: PROFILE_UI.dividerInset } : undefined]} />;
}

export function ProfileMenuRow({
  icon: Icon,
  leading,
  iconColor = colors.brandAccent,
  title,
  subtitle,
  value,
  onPress,
  testID,
  destructive,
  showChevron = true,
  trailing,
}: {
  icon?: LucideIcon;
  /** Custom leading element (e.g. workspace avatar). Takes precedence over `icon` when both set. */
  leading?: React.ReactNode;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned meta (e.g. timezone) before the chevron. */
  value?: string;
  onPress?: () => void;
  testID?: string;
  destructive?: boolean;
  showChevron?: boolean;
  trailing?: React.ReactNode;
}) {
  const hasLeading = Boolean(leading || Icon);
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: space.cardPadH,
        paddingVertical: subtitle ? 8 : hasLeading ? space.cardPadV : 6,
        minHeight: hasLeading ? space.rowMinHeight : 36,
      }}
    >
      {leading}
      {Icon && !leading ? (
        <View
          style={[
            PROFILE_UI.iconBox,
            {
              marginRight: 10,
              backgroundColor: destructive ? "#FEF2F2" : colors.brandSoft,
            },
          ]}
        >
          <Icon size={14} color={destructive ? "#DC2626" : iconColor} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[PROFILE_UI.rowTitle, destructive ? { color: "#DC2626" } : undefined]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={PROFILE_UI.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          style={{
            fontSize: 11,
            color: colors.textMuted,
            marginRight: 4,
            maxWidth: hasLeading ? 120 : 168,
            textAlign: "right",
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {trailing}
      {showChevron && !trailing ? (
        <ChevronRight size={14} color={destructive ? "#F87171" : "#C0C7D1"} style={{ marginLeft: 2 }} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.pressOverlay } : undefined)}
    >
      {content}
    </Pressable>
  );
}

export function ProfileToolbarButton({
  label,
  onPress,
  testID,
  primary,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 2,
        paddingHorizontal: 2,
        gap: 1,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: primary ? "#4338CA" : "#4361EE" }}>{label}</Text>
      <ChevronRight size={12} color={primary ? "#4338CA" : "#4361EE"} />
    </Pressable>
  );
}

/** Blue “Add Workspace” row under the workspace card (settings mockup). */
export function ProfileAddRow({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 4,
        opacity: pressed ? 0.7 : 1,
      })}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.brandSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.brand, fontSize: 16, fontWeight: "600", lineHeight: 18 }}>+</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.brand }}>{label}</Text>
    </Pressable>
  );
}
