import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: "transparent" }} testID="notifications-screen">
      <View
        style={{
          paddingTop: insets.top + 4,
          paddingHorizontal: 16,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -6,
              marginRight: 4,
            }}
            testID="notifications-back-button"
          >
            <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
          </Pressable>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", letterSpacing: -0.2 }}>
            Notification settings
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <NotificationPreferencesPanel />
      </ScrollView>
    </View>
  );
}
