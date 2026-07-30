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
  const headline = description ?? displayName;
  const metaLine = [label, metadata].filter(Boolean).join(" · ");

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7 }}>
      <View
        style={{
          width: ACTIVITY_LAYOUT.badgeSize,
          height: ACTIVITY_LAYOUT.badgeSize,
          borderRadius: 6,
          backgroundColor: tint.badgeBg,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <LabelIcon size={12} color={tint.icon} strokeWidth={2.25} />
      </View>

      <UserAvatar
        user={actor}
        size={ACTIVITY_LAYOUT.avatarSize}
        radius={ACTIVITY_LAYOUT.avatarSize / 2}
        backgroundColor={ACTIVITY_COLORS.slate100}
        textColor={ACTIVITY_COLORS.slate500}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
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
              fontSize: 13,
              fontWeight: "600",
              color: ACTIVITY_COLORS.slate900,
              lineHeight: 17,
            }}
            numberOfLines={2}
          >
            {headline}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: ACTIVITY_COLORS.slate400,
              fontWeight: "500",
              flexShrink: 0,
              lineHeight: 11,
            }}
          >
            {formatRelativeTime(timestamp)}
          </Text>
        </View>

        {metaLine ? (
          <Text style={{ marginTop: 2, fontSize: 10, color: ACTIVITY_COLORS.slate500, lineHeight: 13 }} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}

        {children}

        {action ? (
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 1 }}>{action}</View>
        ) : null}
      </View>
    </View>
  );
}
