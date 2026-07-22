import React from "react";
import { View, Text, Pressable, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";

export const PROFILE_UI = {
  pageBg: "#F1F5F9",
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden" as const,
  },
  sectionGap: 20,
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 1.2,
    color: "#64748B",
    textTransform: "uppercase" as const,
  },
  rowTitle: { fontSize: 14, fontWeight: "600" as const, color: "#0F172A" },
  rowSubtitle: { fontSize: 12, color: "#64748B", marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: "#F1F5F9" },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};

export function ProfileContent({ children }: { children: React.ReactNode }) {
  return <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: PROFILE_UI.sectionGap }}>{children}</View>;
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
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 12, flexShrink: 0 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={PROFILE_UI.sectionLabel}>{title}</Text>
            {titleAccessory}
          </View>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 17 }}>{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {fillsHeight ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : children}
    </View>
  );
}

export function ProfileCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[PROFILE_UI.card, style]}>{children}</View>;
}

export function ProfileDivider({ inset = false }: { inset?: boolean }) {
  return <View style={[PROFILE_UI.divider, inset ? { marginLeft: 52 } : undefined]} />;
}

export function ProfileMenuRow({
  icon: Icon,
  iconColor = "#475569",
  title,
  subtitle,
  onPress,
  testID,
  destructive,
  showChevron = true,
  trailing,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  testID?: string;
  destructive?: boolean;
  showChevron?: boolean;
  trailing?: React.ReactNode;
}) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, minHeight: 52 }}>
      {Icon ? (
        <View style={[PROFILE_UI.iconBox, { marginRight: 12 }]}>
          <Icon size={18} color={destructive ? "#DC2626" : iconColor} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[PROFILE_UI.rowTitle, destructive ? { color: "#DC2626" } : undefined]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={PROFILE_UI.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {showChevron && !trailing ? (
        <ChevronRight size={18} color={destructive ? "#F87171" : "#94A3B8"} style={{ marginLeft: 4 }} />
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} testID={testID} style={({ pressed }) => (pressed ? { backgroundColor: "#F8FAFC" } : undefined)}>
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
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: primary ? "#EEF2FF" : "#F8FAFC",
        borderWidth: 1,
        borderColor: primary ? "#C7D2FE" : "#E2E8F0",
        gap: 2,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: primary ? "#4338CA" : "#475569" }}>{label}</Text>
      <ChevronRight size={12} color={primary ? "#4338CA" : "#94A3B8"} />
    </Pressable>
  );
}
