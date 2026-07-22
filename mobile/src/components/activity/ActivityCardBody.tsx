import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import { ACTIVITY_COLORS, ACTIVITY_LAYOUT, type ActivityTintTokens } from "./activity-ui";
import { formatRelativeTime } from "./types";

type Actor = { name: string; image?: string | null };

type Props = {
  actor: Actor;
  label: string;
  LabelIcon: LucideIcon;
  tint: ActivityTintTokens;
  timestamp: string;
  /** Bold primary name line */
  memberName?: string;
  /** Action / description under the name */
  description?: string;
  /** Grey metadata under description */
  metadata?: string;
  /** Bottom-right action (ghost button, etc.) */
  action?: ReactNode;
  children?: ReactNode;
};

export function ActivityCardBody({
  actor,
  label,
  LabelIcon,
  tint,
  timestamp,
  memberName,
  description,
  metadata,
  action,
  children,
}: Props) {
  const displayName = memberName ?? actor.name;

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View
        style={{
          width: ACTIVITY_LAYOUT.badgeSize,
          height: ACTIVITY_LAYOUT.badgeSize,
          borderRadius: 7,
          backgroundColor: tint.badgeBg,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <LabelIcon size={14} color={tint.icon} strokeWidth={2.25} />
      </View>

      <UserAvatar
        user={actor}
        size={ACTIVITY_LAYOUT.avatarSize}
        radius={ACTIVITY_LAYOUT.avatarSize / 2}
        backgroundColor={ACTIVITY_COLORS.slate100}
        textColor={ACTIVITY_COLORS.slate500}
      />

      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 9,
              fontWeight: "700",
              color: tint.labelText,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              lineHeight: 12,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: ACTIVITY_COLORS.slate400,
              fontWeight: "500",
              flexShrink: 0,
              lineHeight: 12,
            }}
          >
            {formatRelativeTime(timestamp)}
          </Text>
        </View>

        <Text
          style={{ fontSize: 13, fontWeight: "700", color: ACTIVITY_COLORS.slate900, lineHeight: 16 }}
          numberOfLines={1}
        >
          {displayName}
        </Text>

        {description ? (
          <Text
            style={{ fontSize: 12, fontWeight: "500", color: ACTIVITY_COLORS.slate700, lineHeight: 15 }}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}

        {metadata ? (
          <Text style={{ fontSize: 11, color: ACTIVITY_COLORS.slate500, lineHeight: 14 }} numberOfLines={1}>
            {metadata}
          </Text>
        ) : null}

        {children}

        {action ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 2 }}>{action}</View>
        ) : null}
      </View>
    </View>
  );
}
