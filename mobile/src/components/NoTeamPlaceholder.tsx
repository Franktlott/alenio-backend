import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { Users, Plus } from "lucide-react-native";

export function NoTeamPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="no-team-placeholder">
      <Image
        source={require("@/assets/alenio-logo.png")}
        style={{ width: 160, height: 60, marginBottom: 32 }}
        resizeMode="contain"
      />
      <View style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: "#EEF2FF",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
      }}>
        <Users size={36} color="#4361EE" strokeWidth={1.5} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#1E293B", textAlign: "center", marginBottom: 8 }}>
        Welcome to Alenio
      </Text>
      <Text style={{ fontSize: 15, color: "#94A3B8", textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
        Join an existing team or create a new one to get started.
      </Text>
      <Pressable
        onPress={() => router.push("/select-team")}
        style={{
          backgroundColor: "#4361EE",
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 14,
          width: "100%",
          alignItems: "center",
          marginBottom: 12,
        }}
        testID="join-team-button"
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Join a Team</Text>
      </Pressable>
      <Pressable
        onPress={() => router.push("/onboarding")}
        style={{
          backgroundColor: "#EEF2FF",
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 14,
          width: "100%",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
        }}
        testID="create-team-button"
      >
        <Plus size={18} color="#4361EE" />
        <Text style={{ color: "#4361EE", fontWeight: "700", fontSize: 15 }}>Create a Team</Text>
      </Pressable>
    </View>
  );
}
