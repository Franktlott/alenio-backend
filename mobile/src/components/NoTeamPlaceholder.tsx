import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Users } from "lucide-react-native";

export function NoTeamPlaceholder() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="no-team-placeholder">
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
      <Text style={{ fontSize: 15, color: "#94A3B8", textAlign: "center", lineHeight: 22, marginBottom: 28 }}>
        Join or create a team to get started with task management and collaboration.
      </Text>
      <Pressable
        onPress={() => router.push("/select-team")}
        style={{
          backgroundColor: "#4361EE",
          paddingHorizontal: 28,
          paddingVertical: 14,
          borderRadius: 14,
        }}
        testID="select-team-button"
      >
        <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Select a Team</Text>
      </Pressable>
    </View>
  );
}
