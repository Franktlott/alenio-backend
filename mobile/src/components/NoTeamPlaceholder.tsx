import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Clock } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

type JoinRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

export function NoTeamPlaceholder() {
  const { data: pendingRequests = [], isLoading } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<JoinRequest[]>("/api/join-requests/mine"),
    refetchInterval: 10000,
  });

  const hasPending = pendingRequests.length > 0;

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

      {isLoading ? (
        <ActivityIndicator color="#4361EE" />
      ) : hasPending ? (
        <Pressable
          onPress={() => router.push("/(app)/team")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: "#FFF7ED",
            borderWidth: 1.5,
            borderColor: "#FED7AA",
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 14,
            width: "100%",
          }}
          testID="pending-request-button"
        >
          <Clock size={17} color="#F59E0B" />
          <Text style={{ color: "#92400E", fontWeight: "700", fontSize: 15 }}>Pending request</Text>
        </Pressable>
      ) : (
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
      )}
    </View>
  );
}
