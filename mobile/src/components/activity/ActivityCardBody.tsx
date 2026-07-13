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
  children: ReactNode;
};

/** Shared enterprise card body: avatar + balanced full-width content */
export function ActivityCardBody({ actor, label, LabelIcon, tint, timestamp, children }: Props) {
  return (
    <View style={{ flexDirection: "row", alignItems: "stretch", gap: 10 }}>
      <View style={{ paddingTop: 2 }}>
        <UserAvatar
          user={actor}
          size={ACTIVITY_LAYOUT.avatarSize}
          radius={ACTIVITY_LAYOUT.avatarSize / 2}
          backgroundColor={ACTIVITY_COLORS.slate100}
          textColor={ACTIVITY_COLORS.slate500}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1, minWidth: 0 }}>
            <LabelIcon size={12} color={tint.icon} strokeWidth={2.25} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: tint.labelText,
                letterSpacing: 0.4,
                textTransform: "uppercase",
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 11,
              color: ACTIVITY_COLORS.slate400,
              fontWeight: "500",
              flexShrink: 0,
            }}
          >
            {formatRelativeTime(timestamp)}
          </Text>
        </View>

        <View style={{ gap: 6, width: "100%" }}>{children}</View>
      </View>
    </View>
  );
}
