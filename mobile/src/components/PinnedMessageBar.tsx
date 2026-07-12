import React from "react";
import { Pressable, Text, View } from "react-native";
import type { PinnedMessageSummary } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";

function previewText(pinned: PinnedMessageSummary): string {
  const trimmed = pinned.content?.trim();
  if (trimmed) return trimmed;
  if (pinned.mediaType === "video") return "Video";
  if (pinned.mediaType === "image") return "Photo";
  return "Message";
}

export function PinnedMessageBar({
  pins,
  onPressPin,
  onLongPressPin,
}: {
  pins: PinnedMessageSummary[];
  onPressPin: (pin: PinnedMessageSummary) => void;
  onLongPressPin?: (pin: PinnedMessageSummary) => void;
}) {
  if (!pins.length) return null;

  return (
    <View
      testID="pinned-message-bar"
      style={{
        backgroundColor: "#EEF2FF",
        borderBottomWidth: 1,
        borderBottomColor: "#C7D2FE",
      }}
    >
      {pins.map((pinned, index) => {
        const senderName = pinned.sender.name?.trim() || "Someone";
        const preview = previewText(pinned);
        return (
          <Pressable
            key={pinned.messageId}
            testID={`pinned-message-row-${pinned.messageId}`}
            onPress={() => onPressPin(pinned)}
            onLongPress={onLongPressPin ? () => onLongPressPin(pinned) : undefined}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={`Pinned message from ${senderName}. Tap to jump.`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: "#E0E7FF",
            }}
          >
            <UserAvatar
              user={pinned.sender}
              size={28}
              radius={14}
              fontSize={11}
              backgroundColor="#4361EE"
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE", marginBottom: 1 }}>
                {pins.length > 1 ? `Pinned · ${index + 1} of ${pins.length}` : "Pinned message"}
              </Text>
              <Text style={{ fontSize: 13, color: "#0F172A", fontWeight: "500" }} numberOfLines={1}>
                {senderName}: {preview}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
