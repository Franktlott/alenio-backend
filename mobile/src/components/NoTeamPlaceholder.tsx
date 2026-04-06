import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";

export function NoTeamPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="no-team-placeholder">
      <Image
        source={require("@/assets/alenio-logo.png")}
        style={{ width: 160, height: 60, marginBottom: 32 }}
        resizeMode="contain"
      />
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#1E293B", textAlign: "center", marginBottom: 8 }}>
        Welcome to Alenio
      </Text>
      <Text style={{ fontSize: 15, color: "#94A3B8", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
        Join an existing team or create a new one to get started.
      </Text>
      <Pressable
        onPress={() => router.push("/onboarding")}
        style={{
          backgroundColor: "#4361EE",
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 14,
          width: "100%",
          alignItems: "center",
        }}
        testID="setup-team-button"
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Set up your team</Text>
      </Pressable>
    </View>
  );
}
