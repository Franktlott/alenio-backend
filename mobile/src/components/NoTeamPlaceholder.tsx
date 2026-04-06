import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Clock, X } from "lucide-react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

type JoinRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

export function NoTeamPlaceholder() {
  const queryClient = useQueryClient();

  const { data: pendingRequests = [], isLoading } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<JoinRequest[]>("/api/join-requests/mine"),
    refetchInterval: 10000,
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
  });

  const pending = pendingRequests[0] ?? null;

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

      {isLoading ? (
        <ActivityIndicator color="#4361EE" style={{ marginTop: 16 }} />
      ) : pending ? (
        <>
          <Text style={{ fontSize: 15, color: "#94A3B8", textAlign: "center", lineHeight: 22, marginBottom: 28 }}>
            Your request to join a team is pending approval.
          </Text>

          <View style={{
            backgroundColor: "#FFF7ED",
            borderWidth: 1.5,
            borderColor: "#FED7AA",
            borderRadius: 16,
            padding: 18,
            width: "100%",
            marginBottom: 16,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Clock size={18} color="#F59E0B" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400E" }}>Request Pending</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 2 }}>
              {pending.team.name}
            </Text>
            <Text style={{ fontSize: 13, color: "#78716C" }}>
              Waiting for a team owner to approve your request.
            </Text>
          </View>

          <Pressable
            onPress={() => cancelMutation.mutate(pending.id)}
            disabled={cancelMutation.isPending}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderWidth: 1.5,
              borderColor: "#EF4444",
              paddingHorizontal: 28,
              paddingVertical: 13,
              borderRadius: 14,
              width: "100%",
            }}
            testID="cancel-request-button"
          >
            {cancelMutation.isPending ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <>
                <X size={16} color="#EF4444" />
                <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 15 }}>Cancel Request</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
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
        </>
      )}
    </View>
  );
}
