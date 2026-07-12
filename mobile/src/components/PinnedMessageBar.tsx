import React from "react";
import { Pressable, Text, View } from "react-native";
import { Pin } from "lucide-react-native";
import type { PinnedMessageSummary } from "@/lib/types";

function previewText(pinned: PinnedMessageSummary): string {
  const trimmed = pinned.content?.trim();
  if (trimmed) return trimmed;
  if (pinned.mediaType === "video") return "Video";
  if (pinned.mediaType === "image") return "Photo";
  return "Message";
}

export function PinnedMessageBar({
  pinned,
  onPress,
  onLongPress,
}: {
  pinned: PinnedMessageSummary;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const senderName = pinned.sender.name?.trim() || "Someone";
  const preview = previewText(pinned);

  return (
    <Pressable
      testID="pinned-message-bar"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`Pinned message from ${senderName}. Tap to jump.`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: "#EEF2FF",
        borderBottomWidth: 1,
        borderBottomColor: "#C7D2FE",
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: "#C7D2FE",
        }}
      >
        <Pin size={14} color="#4361EE" fill="#4361EE" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE", marginBottom: 1 }}>
          Pinned message
        </Text>
        <Text style={{ fontSize: 13, color: "#0F172A", fontWeight: "500" }} numberOfLines={1}>
          {senderName}: {preview}
        </Text>
      </View>
    </Pressable>
  );
}
