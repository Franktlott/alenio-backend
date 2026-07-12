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

/** Shared enterprise card body: fixed avatar column + dense content stack */
export function ActivityCardBody({ actor, label, LabelIcon, tint, timestamp, children }: Props) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <View style={{ width: ACTIVITY_LAYOUT.avatarColumn, alignItems: "flex-start", paddingTop: 1 }}>
        <UserAvatar
          user={actor}
          size={ACTIVITY_LAYOUT.avatarSize}
          radius={ACTIVITY_LAYOUT.avatarSize / 2}
          backgroundColor={ACTIVITY_COLORS.slate100}
          textColor={ACTIVITY_COLORS.slate500}
        />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              maxWidth: "78%",
            }}
          >
            <LabelIcon size={11} color={tint.icon} strokeWidth={2.25} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: tint.labelText,
                letterSpacing: 0.45,
                textTransform: "uppercase",
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
          <Text style={{ fontSize: 10, color: ACTIVITY_COLORS.slate400, fontWeight: "500", flexShrink: 0 }}>
            {formatRelativeTime(timestamp)}
          </Text>
        </View>
        {children}
      </View>
    </View>
  );
}
