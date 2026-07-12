import type { ReactNode } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import type { ActivityFeedItem } from "./types";
import { formatRelativeTime } from "./types";
import { ACTIVITY_LAYOUT } from "./activity-ui";
import { ActivityActionButton } from "./ActivityActionButton";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  onCelebrate?: (item: ActivityFeedItem) => void;
  testID?: string;
};

export function MilestoneActivityCard({ item, footer, onLongPress, onCelebrate, testID }: Props) {
  const actorName = item.actor?.name ?? "Someone";
  const count = item.metadata.count ?? (item.type === "task_milestone" ? 10 : 0);
  const isPersonalBest = item.type === "personal_best";

  const gradient: [string, string] = isPersonalBest ? ["#EA580C", "#EF4444"] : ["#F59E0B", "#EF4444"];
  const surface = isPersonalBest ? "#FFF7ED" : "#FEF3C7";
  const accent = isPersonalBest ? "#EA580C" : "#D97706";
  const ink = isPersonalBest ? "#9A3412" : "#92400E";
  const label = isPersonalBest ? "Personal Best" : "Milestone Reached";

  return (
    <Pressable
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        marginHorizontal: ACTIVITY_LAYOUT.cardMarginHorizontal,
        marginVertical: ACTIVITY_LAYOUT.cardMarginVertical,
        opacity: pressed ? 0.96 : 1,
      })}
      testID={testID ?? `milestone-activity-card-${item.id}`}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, padding: 2 }}
      >
        <View style={{ backgroundColor: surface, borderRadius: 12, padding: 11, gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderWidth: 1,
                borderColor: `${accent}33`,
              }}
            >
              <Text style={{ fontSize: 18 }}>{isPersonalBest ? "🔥" : "🏆"}</Text>
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: accent,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                {label}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: accent, lineHeight: 26 }}>{count}</Text>
                <Text style={{ fontSize: 11, fontWeight: "600", color: ink }}>
                  {isPersonalBest ? "on-time in a row" : "tasks on time"}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: ink }} numberOfLines={1}>
                {actorName} · Keep it up
              </Text>
            </View>

            <Image
              source={require("@/assets/alenio-icon.png")}
              style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0 }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: `${accent}33`,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: "#FFFFFF",
                  overflow: "hidden",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.actor?.image ? (
                  <ExpoImage source={{ uri: item.actor.image }} style={{ width: 22, height: 22 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 10, fontWeight: "700", color: accent }}>
                    {actorName[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 11, color: ink, fontWeight: "600" }}>{actorName}</Text>
            </View>
            <Text style={{ fontSize: 11, color: ink }}>{formatRelativeTime(item.timestamp)}</Text>
          </View>

          {onCelebrate ? (
            <ActivityActionButton
              label="Celebrate"
              onPress={() => onCelebrate(item)}
              accentColor={accent}
              testID={`${testID ?? item.id}-celebrate`}
            />
          ) : null}

          {footer ? <View>{footer}</View> : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
