import React, { useState } from "react";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

export default function OnboardingScreen() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [teamName, setTeamName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

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
      api.post<Team>("/api/teams/join", {
        inviteCode: inviteCode.trim().toUpperCase(),
      }),
    onSuccess: (team) => {
      setActiveTeamId(team.id);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      router.replace("/(app)");
    },
    onError: () => setError("Invalid invite code. Please check and try again."),
  });

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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="flex-1 px-6 justify-center">
          {/* Mode toggle */}
          <View className="flex-row bg-slate-200 dark:bg-slate-700 rounded-xl p-1 mb-6">
            {(["create", "join"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 py-2 rounded-lg items-center ${
                  mode === m ? "bg-white dark:bg-slate-800" : ""
                }`}
                testID={`mode-${m}`}
              >
                <Text
                  className={`font-semibold text-sm ${
                    mode === m ? "text-indigo-600" : "text-slate-500"
                  }`}
                >
                  {m === "create" ? "Create team" : "Join team"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

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
    </SafeAreaView>
  );
}
