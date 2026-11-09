import { useState } from "react";
import { View, Text, Modal, Pressable, ScrollView } from "react-native";
import Animated, { FadeIn, FadeOut, ZoomIn } from "react-native-reanimated";
import { Trash2 } from "lucide-react-native";
import { FEED_REACTIONS } from "@/lib/feed-reactions";

const EMOJI_OPTIONS = FEED_REACTIONS.map((reaction) => reaction.emoji);

/** Same spring the chat reaction menu pops its emoji with, staggered down the row. */
function optionEntering(index: number) {
  return ZoomIn.springify()
    .damping(14)
    .stiffness(340)
    .mass(0.5)
    .delay(index * 45);
}

type Props = {
  activityId: string;
  reactions: Record<
    string,
    { count: number; userIds: string[]; users: { id: string; name: string }[] }
  >;
  currentUserId: string | undefined;
  onToggleReaction: (emoji: string) => void;
  showPicker: boolean;
  onClosePicker: () => void;
  /** Use on celebration gradient cards */
  tone?: "default" | "onDark";
  /** Lift the emoji row into a popover so the card keeps its height. */
  floatPicker?: boolean;
  /** Hide the summary pills where the action row already shows the reaction. */
  showPills?: boolean;
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
  floatPicker = false,
  showPills = true,
  canDelete = false,
  onDelete,
}: Props) {
  const existingReactions = Object.entries(reactions ?? {});
  const myReaction = currentUserId
    ? existingReactions.find(([, { userIds }]) =>
        userIds.includes(currentUserId),
      )?.[0]
    : undefined;
  const [whoReacted, setWhoReacted] = useState<{
    emoji: string;
    users: { id: string; name: string }[];
  } | null>(null);
  const onDark = tone === "onDark";

  if (!showPicker && (!showPills || existingReactions.length === 0))
    return null;

  return (
    <View style={{ marginTop: 2, position: "relative" }}>
      <Modal
        visible={!!whoReacted}
        transparent
        animationType="fade"
        onRequestClose={() => setWhoReacted(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setWhoReacted(null)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              padding: 20,
              width: 280,
              maxHeight: 360,
            }}
          >
            <Text
              style={{ fontSize: 22, textAlign: "center", marginBottom: 4 }}
            >
              {whoReacted?.emoji}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: "#64748B",
                textAlign: "center",
                marginBottom: 14,
              }}
            >
              {whoReacted?.users.length}{" "}
              {whoReacted?.users.length === 1 ? "person" : "people"} reacted
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
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "#4361EE",
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "500",
                      color: "#1E293B",
                    }}
                  >
                    {u.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        pointerEvents="box-none"
        style={
          floatPicker
            ? {
                position: "absolute",
                bottom: "100%",
                left: 0,
                right: 0,
                marginBottom: 2,
                zIndex: 30,
              }
            : undefined
        }
      >
        {showPicker ? (
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(120)}
            style={[
              { flexGrow: 0, marginBottom: 6 },
              floatPicker
                ? {
                    alignSelf: "flex-start",
                    marginBottom: 0,
                    maxWidth: "100%",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 999,
                    // The page is white too, so the bar needs its own edge to
                    // read as something floating over the card.
                    borderWidth: 1,
                    borderColor: "#E7ECF4",
                    paddingHorizontal: 3,
                    shadowColor: "#0B1220",
                    shadowOpacity: 0.2,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 10,
                  }
                : null,
            ]}
            contentContainerStyle={{
              flexDirection: "row",
              alignItems: "center",
              gap: floatPicker ? 0 : 6,
              paddingVertical: floatPicker ? 3 : 4,
            }}
            testID={`emoji-picker-${activityId}`}
          >
            {FEED_REACTIONS.map(({ emoji, label, color }, index) => {
              const isMine = emoji === myReaction;
              return (
                <Animated.View key={emoji} entering={optionEntering(index)}>
                  <Pressable
                    testID={`pick-emoji-${activityId}-${emoji}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isMine ? `${label}, selected. Tap to remove.` : label
                    }
                    accessibilityState={{ selected: isMine }}
                    onPress={() => {
                      onToggleReaction(emoji);
                      onClosePicker();
                    }}
                    style={
                      floatPicker
                        ? {
                            // Bare glyphs on one floating bar, the way the
                            // Facebook tray reads. Your pick wears a ring in
                            // its own color so it reads as the undo target.
                            alignItems: "center",
                            justifyContent: "center",
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: isMine
                              ? `${color}24`
                              : "transparent",
                            borderWidth: isMine ? 1.5 : 0,
                            borderColor: isMine ? color : "transparent",
                          }
                        : {
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isMine ? "#EEF2FF" : "#F1F5F9",
                            borderRadius: 20,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderWidth: 1.5,
                            borderColor: isMine ? color : "#E2E8F0",
                          }
                    }
                  >
                    <Text
                      style={
                        // Your pick sits slightly proud of the others. The
                        // transform key has to be absent, not undefined.
                        isMine
                          ? {
                              fontSize: floatPicker ? 21 : 18,
                              transform: [{ scale: 1.1 }],
                            }
                          : { fontSize: floatPicker ? 21 : 18 }
                      }
                    >
                      {emoji}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
            {/* The floating bar stays emoji-only; delete and dismiss live on
                the card itself, and tapping your own emoji removes it. */}
            {!floatPicker && canDelete && onDelete ? (
              <Animated.View entering={optionEntering(EMOJI_OPTIONS.length)}>
                <Pressable
                  testID={`delete-activity-${activityId}`}
                  onPress={onDelete}
                  accessibilityLabel="Delete celebration"
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFF1F2",
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: "#FECDD3",
                  }}
                >
                  <Trash2 size={16} color="#EF4444" strokeWidth={2.25} />
                </Pressable>
              </Animated.View>
            ) : null}
            {floatPicker ? null : myReaction ? (
              <Animated.View
                entering={optionEntering(
                  EMOJI_OPTIONS.length + (canDelete ? 1 : 0),
                )}
              >
                <Pressable
                  testID={`remove-reaction-${activityId}`}
                  onPress={() => {
                    onToggleReaction(myReaction);
                    onClosePicker();
                  }}
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFF1F2",
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: "#FECDD3",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#EF4444",
                      fontWeight: "700",
                    }}
                  >
                    Remove
                  </Text>
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View
                entering={optionEntering(
                  EMOJI_OPTIONS.length + (canDelete ? 1 : 0),
                )}
              >
                <Pressable
                  testID={`close-picker-${activityId}`}
                  onPress={onClosePicker}
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F1F5F9",
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#94A3B8",
                      fontWeight: "600",
                    }}
                  >
                    ✕
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </Animated.ScrollView>
        ) : null}
      </View>

      {showPills ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 2,
          }}
        >
          {existingReactions.map(([emoji, { count, userIds, users = [] }]) => {
            const isActive = !!currentUserId && userIds.includes(currentUserId);
            return (
              <Pressable
                key={emoji}
                onPress={() => setWhoReacted({ emoji, users })}
                onLongPress={() => onToggleReaction(emoji)}
                testID={`reaction-pill-${activityId}-${emoji}`}
                style={{
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
                }}
              >
                <Text style={{ fontSize: 13 }}>{emoji}</Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: onDark
                      ? "#FFFFFF"
                      : isActive
                        ? "#4361EE"
                        : "#64748B",
                  }}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
