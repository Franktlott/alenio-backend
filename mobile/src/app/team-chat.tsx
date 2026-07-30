import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageCircle } from "lucide-react-native";
import { router } from "expo-router";

/**
 * Legacy Main Chat / Spaces route.
 * Chat V1 hides team streams from product UI; deep links soft-redirect to the DM+Group inbox.
 * Message/Topic APIs and data remain intact for a later migration.
 */
export default function TeamChatScreen() {
  useEffect(() => {
    router.replace("/(app)/chat");
  }, []);

  return (
    <SafeAreaView
      testID="team-chat-unavailable"
      style={{ flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <MessageCircle size={24} color="#4361EE" />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>
        Team chat unavailable
      </Text>
      <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, marginBottom: 16 }}>
        Conversations now live in Chat as direct messages and groups.
      </Text>
      <Pressable
        testID="team-chat-open-inbox"
        onPress={() => router.replace("/(app)/chat")}
        style={{
          backgroundColor: "#4361EE",
          borderRadius: 10,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Open Chat</Text>
      </Pressable>
    </SafeAreaView>
  );
}
