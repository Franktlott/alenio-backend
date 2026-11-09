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
  /** Secondary detail shown beneath the primary activity line. */
  detail?: string;
  /** Bottom-right action (ghost button, etc.) */
  action?: ReactNode;
  children?: ReactNode;
  /** Activity row id — keeps FlatList recycled avatars from sticking on initials */
  avatarResetKey?: string | number | null;
  /** Use an icon tile when the activity has no real actor. */
  showAvatar?: boolean;
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
  detail,
  action,
  children,
  avatarResetKey,
  showAvatar = true,
}: Props) {
  const displayName = memberName ?? actor.name;
  const headline = description ?? displayName;
  const metaLine = [label, metadata].filter(Boolean).join(" · ");

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
      <View
        style={{
          width: ACTIVITY_LAYOUT.avatarSize,
          height: ACTIVITY_LAYOUT.avatarSize,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {showAvatar ? (
          <>
            <UserAvatar
              user={actor}
              size={ACTIVITY_LAYOUT.avatarSize}
              radius={ACTIVITY_LAYOUT.avatarSize / 2}
              backgroundColor={ACTIVITY_COLORS.slate100}
              textColor={ACTIVITY_COLORS.slate500}
              resetKey={avatarResetKey}
            />
            <View
              style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 15,
                height: 15,
                borderRadius: 7.5,
                backgroundColor: tint.badgeBg,
                borderWidth: 2,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LabelIcon size={8} color={tint.icon} strokeWidth={2.4} />
            </View>
          </>
        ) : (
          <View
            style={{
              width: ACTIVITY_LAYOUT.badgeSize,
              height: ACTIVITY_LAYOUT.badgeSize,
              borderRadius: 10,
              backgroundColor: tint.badgeBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LabelIcon size={18} color={tint.icon} strokeWidth={2.1} />
          </View>
        )}
      </View>

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
              fontSize: 11,
              fontWeight: "700",
              color: ACTIVITY_COLORS.slate900,
              lineHeight: 14,
            }}
            numberOfLines={2}
          >
            {headline}
          </Text>
          <Text
            style={{
              fontSize: 8.5,
              color: ACTIVITY_COLORS.slate400,
              fontWeight: "500",
              flexShrink: 0,
              lineHeight: 11,
            }}
          >
            {formatRelativeTime(timestamp)}
          </Text>
        </View>

        {detail ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: 9.5,
              lineHeight: 12,
              color: ACTIVITY_COLORS.slate500,
            }}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}

        {metaLine ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: 9,
              color: tint.labelText,
              fontWeight: "600",
              lineHeight: 11,
            }}
            numberOfLines={1}
          >
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
