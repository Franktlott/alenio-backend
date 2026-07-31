import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { LucideIcon } from "lucide-react-native";

const BRAND = "#4361EE";

/**
 * Shared empty state for tabs that genuinely need a workspace. It explains what
 * a workspace adds instead of ejecting the user out of the app shell.
 */
export function NoWorkspaceTabState({
  icon: Icon,
  title,
  description,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  testID?: string;
}) {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
      testID={testID}
    >
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 20,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={26} color={BRAND} strokeWidth={2} />
      </View>
      <Text
        style={{
          marginTop: 16,
          fontSize: 17,
          fontWeight: "700",
          color: "#172033",
          textAlign: "center",
          letterSpacing: -0.2,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 13,
          lineHeight: 19,
          color: "#69758C",
          textAlign: "center",
        }}
      >
        {description}
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 22, alignSelf: "stretch" }}>
        <Pressable
          onPress={() => router.push("/onboarding?mode=join")}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: BRAND,
          }}
          testID="no-workspace-join-button"
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>Join a workspace</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/onboarding?mode=create")}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#DDE4FF",
          }}
          testID="no-workspace-create-button"
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: BRAND }}>Create one</Text>
        </Pressable>
      </View>
    </View>
  );
}
