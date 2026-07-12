import { useState } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import { Trash2 } from "lucide-react-native";

const EMOJI_OPTIONS = ["😊", "❤️", "😂", "😮", "🔥", "🎉"];

type Props = {
  activityId: string;
  reactions: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>;
  currentUserId: string | undefined;
  onToggleReaction: (emoji: string) => void;
  showPicker: boolean;
  onClosePicker: () => void;
  /** Use on celebration gradient cards */
  tone?: "default" | "onDark";
  canDelete?: boolean;
  onDelete?: () => void;
};

export function ActivityReactionRow({
  activityId,
  reactions,
  currentUserId,
  onToggleReaction,
  showPicker,
  onClosePicker,
  tone = "default",
  canDelete = false,
  onDelete,
}: Props) {
  const existingReactions = Object.entries(reactions ?? {});
  const myReaction = currentUserId
    ? existingReactions.find(([, { userIds }]) => userIds.includes(currentUserId))?.[0]
    : undefined;
  const [whoReacted, setWhoReacted] = useState<{ emoji: string; users: { id: string; name: string }[] } | null>(null);
  const onDark = tone === "onDark";

  return (
    <View style={{ marginTop: 2 }}>
      <Modal visible={!!whoReacted} transparent animationType="fade" onRequestClose={() => setWhoReacted(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }}
          onPress={() => setWhoReacted(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: "white", borderRadius: 20, padding: 20, width: 280, maxHeight: 360 }}
          >
            <Text style={{ fontSize: 22, textAlign: "center", marginBottom: 4 }}>{whoReacted?.emoji}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", textAlign: "center", marginBottom: 14 }}>
              {whoReacted?.users.length} {whoReacted?.users.length === 1 ? "person" : "people"} reacted
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {whoReacted?.users.map((u) => (
                <View
                  key={u.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: "#F1F5F9",
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>
                      {u.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>{u.name}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {showPicker ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 6 }}
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          testID={`emoji-picker-${activityId}`}
        >
          {EMOJI_OPTIONS.map((emoji) => {
            const isMine = emoji === myReaction;
            return (
              <Pressable
                key={emoji}
                testID={`pick-emoji-${activityId}-${emoji}`}
                onPress={() => {
                  onToggleReaction(emoji);
                  onClosePicker();
                }}
                style={({ pressed }) => ({
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isMine ? "#EEF2FF" : pressed ? "#E2E8F0" : "#F1F5F9",
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1.5,
                  borderColor: isMine ? "#4361EE" : "#E2E8F0",
                })}
              >
                <Text style={{ fontSize: 18 }}>{emoji}</Text>
              </Pressable>
            );
          })}
          {canDelete && onDelete ? (
            <Pressable
              testID={`delete-activity-${activityId}`}
              onPress={onDelete}
              accessibilityLabel="Delete celebration"
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#FEE2E2" : "#FFF1F2",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#FECDD3",
              })}
            >
              <Trash2 size={16} color="#EF4444" strokeWidth={2.25} />
            </Pressable>
          ) : null}
          {myReaction ? (
            <Pressable
              testID={`remove-reaction-${activityId}`}
              onPress={() => {
                onToggleReaction(myReaction);
                onClosePicker();
              }}
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#FEE2E2" : "#FFF1F2",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#FECDD3",
              })}
            >
              <Text style={{ fontSize: 12, color: "#EF4444", fontWeight: "700" }}>Remove</Text>
            </Pressable>
          ) : (
            <Pressable
              testID={`close-picker-${activityId}`}
              onPress={onClosePicker}
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#E2E8F0" : "#F1F5F9",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              })}
            >
              <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "600" }}>✕</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}
      >
        {existingReactions.map(([emoji, { count, userIds, users = [] }]) => {
          const isActive = !!currentUserId && userIds.includes(currentUserId);
          return (
            <Pressable
              key={emoji}
              onPress={() => setWhoReacted({ emoji, users })}
              onLongPress={() => onToggleReaction(emoji)}
              testID={`reaction-pill-${activityId}-${emoji}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: onDark
                  ? isActive
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(255,255,255,0.14)"
                  : isActive
                    ? "#EEF2FF"
                    : "#F1F5F9",
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: onDark
                  ? isActive
                    ? "rgba(255,255,255,0.45)"
                    : "rgba(255,255,255,0.18)"
                  : isActive
                    ? "#4361EE"
                    : "transparent",
                opacity: pressed && isActive ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: onDark ? "#FFFFFF" : isActive ? "#4361EE" : "#64748B",
                }}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
