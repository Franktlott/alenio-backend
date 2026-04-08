import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft, Clock } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

type JoinResult =
  | { status: "pending"; teamName: string; requestId: string }
  | (Team & { status?: undefined });

type MineRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
};

export default function OnboardingScreen() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{
    requestId: string;
    teamName: string;
  } | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const { data: existingTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<any[]>("/api/teams"),
  });
  const alreadyOwnsTeam = existingTeams.some((t: any) => t.role === "owner");

  useEffect(() => {
    if (alreadyOwnsTeam) setMode("join");
  }, [alreadyOwnsTeam]);

  const createMutation = useMutation({
    mutationFn: () => api.post<Team>("/api/teams", { name: teamName }),
    onSuccess: (team) => {
      setActiveTeamId(team.id);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      router.replace("/(app)");
    },
    onError: () => setError("Failed to create team. Please try again."),
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      api.post<JoinResult>("/api/teams/join", {
        inviteCode: inviteCode.trim().toUpperCase(),
      }),
    onSuccess: (result) => {
      if (result.status === "pending") {
        setPendingRequest({
          requestId: result.requestId,
          teamName: result.teamName,
        });
      } else {
        const team = result as Team;
        setActiveTeamId(team.id);
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        router.replace("/(app)");
      }
    },
    onError: () => setError("Invalid invite code. Please check and try again."),
  });

  // Poll for approval when in pending state
  useEffect(() => {
    if (!pendingRequest) return;

    const checkStatus = async () => {
      try {
        const requests = await api.get<MineRequest[]>("/api/join-requests/mine");
        const approved = requests.find((r) => r.status === "approved");
        if (approved) {
          setActiveTeamId(approved.team.id);
          queryClient.invalidateQueries({ queryKey: ["teams"] });
          router.replace("/(app)");
        }
      } catch {
        // silently ignore polling errors
      }
    };

    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [pendingRequest, setActiveTeamId, queryClient]);

  const handleCheckStatus = async () => {
    if (!pendingRequest) return;
    setIsPolling(true);
    try {
      const requests = await api.get<MineRequest[]>("/api/join-requests/mine");
      const approved = requests.find((r) => r.status === "approved");
      if (approved) {
        setActiveTeamId(approved.team.id);
        queryClient.invalidateQueries({ queryKey: ["teams"] });
        router.replace("/(app)");
      }
    } catch {
      // ignore
    } finally {
      setIsPolling(false);
    }
  };

  const isLoading = createMutation.isPending || joinMutation.isPending;

  const handleSubmit = () => {
    setError(null);
    if (mode === "create") {
      if (!teamName.trim()) {
        setError("Please enter a team name");
        return;
      }
      createMutation.mutate();
    } else {
      if (!inviteCode.trim()) {
        setError("Please enter an invite code");
        return;
      }
      joinMutation.mutate();
    }
  };

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["top"]}
      testID="onboarding-screen"
    >
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View>
            <Text className="text-white text-xl font-bold">Set up your team</Text>
            <Text className="text-white/70 text-sm">Create or join a workspace</Text>
          </View>
        </View>
      </LinearGradient>

      {pendingRequest ? (
        // Pending approval UI
        <View className="flex-1 px-6 justify-center items-center">
          <View
            className="w-20 h-20 rounded-full bg-amber-100 items-center justify-center mb-6"
          >
            <Clock size={40} color="#F59E0B" />
          </View>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-3 text-center">
            Request Sent!
          </Text>
          <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mb-8 leading-5">
            Your request to join{" "}
            <Text className="font-semibold text-slate-700 dark:text-slate-200">
              {pendingRequest.teamName}
            </Text>{" "}
            has been sent. The Team Leader will review it.
          </Text>

          <TouchableOpacity
            className="bg-indigo-600 rounded-xl py-4 px-8 items-center mb-3 w-full"
            onPress={handleCheckStatus}
            disabled={isPolling}
            testID="check-status-button"
          >
            {isPolling ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Check Status</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 items-center w-full"
            onPress={() => {
              setPendingRequest(null);
              setInviteCode("");
              setError(null);
            }}
            testID="cancel-pending-button"
          >
            <Text className="text-slate-400 text-sm">Cancel / Try different code</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // Normal create/join form
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <View className="flex-1 px-6 justify-center">
            {/* Mode toggle — hidden entirely when user already owns a team */}
            {!alreadyOwnsTeam && (
              <View className="flex-row bg-slate-200 dark:bg-slate-700 rounded-xl p-1 mb-6">
                <TouchableOpacity
                  onPress={() => {
                    setMode("create");
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    mode === "create" ? "bg-white dark:bg-slate-800" : ""
                  }`}
                  testID="mode-create"
                >
                  <Text
                    className={`font-semibold text-sm ${
                      mode === "create" ? "text-indigo-600" : "text-slate-500"
                    }`}
                  >
                    Create team
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setMode("join");
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg items-center ${
                    mode === "join" ? "bg-white dark:bg-slate-800" : ""
                  }`}
                  testID="mode-join"
                >
                  <Text
                    className={`font-semibold text-sm ${
                      mode === "join" ? "text-indigo-600" : "text-slate-500"
                    }`}
                  >
                    Join team
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === "create" ? (
              <View>
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Team name
                </Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white"
                  placeholder="e.g. Engineering, Marketing..."
                  placeholderTextColor="#94A3B8"
                  value={teamName}
                  onChangeText={(t) => {
                    setTeamName(t);
                    setError(null);
                  }}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  testID="team-name-input"
                />
              </View>
            ) : (
              <View>
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Invite code
                </Text>
                <TextInput
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-base text-slate-900 dark:text-white tracking-widest"
                  placeholder="e.g. ABC123"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  value={inviteCode}
                  onChangeText={(t) => {
                    setInviteCode(t.toUpperCase());
                    setError(null);
                  }}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  maxLength={6}
                  testID="invite-code-input"
                />
              </View>
            )}

            {error ? (
              <Text className="text-red-500 text-sm mt-2">{error}</Text>
            ) : null}

            <TouchableOpacity
              className="bg-indigo-600 rounded-xl py-4 items-center mt-4"
              onPress={handleSubmit}
              disabled={isLoading}
              testID="submit-button"
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  {mode === "create" ? "Create team" : "Join team"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="mt-3 items-center"
              onPress={() => router.back()}
            >
              <Text className="text-slate-400 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
