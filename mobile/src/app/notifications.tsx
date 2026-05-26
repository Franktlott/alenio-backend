import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: "#F1F5F9" }} testID="notifications-screen">
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 16,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -8,
              marginRight: 4,
            }}
            testID="notifications-back-button"
          >
            <ArrowLeft size={22} color="#0F172A" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1.2, color: "#64748B", textTransform: "uppercase" }}>
              Preferences
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "#0F172A", marginTop: 2 }}>Notifications</Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, paddingLeft: 44 }}>
          Configure workspace alerts, delivery categories, and notification tone for this device.
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 32,
        }}
      >
        <NotificationPreferencesPanel />
      </ScrollView>
    </View>
  );
}
