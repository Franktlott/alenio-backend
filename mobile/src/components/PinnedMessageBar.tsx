import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Pin } from "lucide-react-native";
import type { PinnedMessageSummary } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";

function previewText(pinned: PinnedMessageSummary): string {
  const trimmed = pinned.content?.trim().replace(/\s+/g, " ");
  if (trimmed) {
    // Prefer a clean host for bare URLs
    const urlMatch = trimmed.match(/^https?:\/\/([^/\s]+)(\/\S*)?$/i);
    if (urlMatch) return urlMatch[1]!;
    return trimmed;
  }
  if (pinned.mediaType === "video") return "Video";
  if (pinned.mediaType === "image") return "Photo";
  return "Message";
}

function PinPill({
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
  const showThumb = pinned.mediaType === "image" && !!pinned.mediaUrl;

  return (
    <Pressable
      testID={`pinned-message-row-${pinned.messageId}`}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`Pinned message from ${senderName}. Tap to jump.`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        maxWidth: 220,
        paddingLeft: 6,
        paddingRight: 12,
        paddingVertical: 6,
        backgroundColor: "#FFFFFF",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        opacity: pressed ? 0.88 : 1,
        shadowColor: "#0F172A",
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      })}
    >
      <View style={{ width: 28, height: 28 }}>
        <UserAvatar
          user={pinned.sender}
          size={28}
          radius={14}
          fontSize={11}
          backgroundColor="#4361EE"
        />
        <View
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: "#0F172A",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1.5,
            borderColor: "#FFFFFF",
          }}
        >
          <Pin size={8} color="#FFFFFF" fill="#FFFFFF" strokeWidth={2} />
        </View>
      </View>

      {showThumb ? (
        <Image
          source={{ uri: pinned.mediaUrl! }}
          style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#E2E8F0" }}
        />
      ) : null}

      <Text
        style={{ flexShrink: 1, fontSize: 13, fontWeight: "600", color: "#0F172A" }}
        numberOfLines={1}
      >
        {preview}
      </Text>
    </Pressable>
  );
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
        backgroundColor: "#F8FAFC",
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        paddingVertical: 8,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          gap: 8,
          alignItems: "center",
        }}
      >
        {pins.map((pinned) => (
          <PinPill
            key={pinned.messageId}
            pinned={pinned}
            onPress={() => onPressPin(pinned)}
            onLongPress={onLongPressPin ? () => onLongPressPin(pinned) : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}
