import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Share,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Copy, UserPlus } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";

function MemberRow({
  member,
  isCurrentUser,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
}) {
  return (
    <View
      className="flex-row items-center px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700"
      testID="member-row"
    >
      <View className="w-10 h-10 rounded-full bg-primary items-center justify-center mr-3">
        <Text className="text-white font-bold text-sm">
          {member.user.name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-white font-semibold">
          {member.user.name} {isCurrentUser ? "(you)" : ""}
        </Text>
        <Text className="text-slate-500 text-xs">{member.user.email}</Text>
      </View>
      <View
        className={`px-2 py-0.5 rounded-full ${
          member.role === "owner"
            ? "bg-amber-100"
            : "bg-slate-100 dark:bg-slate-700"
        }`}
      >
        <Text
          className={`text-xs font-medium capitalize ${
            member.role === "owner"
              ? "text-amber-700"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {member.role}
        </Text>
      </View>
    </View>
  );
}

export default function TeamScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const handleCopyCode = async () => {
    if (team?.inviteCode) {
      await Clipboard.setStringAsync(team.inviteCode);
    }
  };

  const handleShareCode = () => {
    if (team?.inviteCode) {
      Share.share({
        message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}`,
      });
    }
  };

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center">
        <Text className="text-slate-500">No team selected</Text>
        <TouchableOpacity
          className="mt-4 bg-primary rounded-xl px-6 py-3"
          onPress={() => router.push("/onboarding")}
        >
          <Text className="text-white font-semibold">Create or join a team</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center"
        testID="loading-indicator"
      >
        <ActivityIndicator color="#0F766E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      testID="team-screen"
    >
      <View className="px-4 pt-2 pb-4">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          {team?.name}
        </Text>
        <Text className="text-slate-500 text-sm">
          {team?.members?.length ?? 0} members
        </Text>
      </View>

      {/* Invite code card */}
      <View className="mx-4 mb-4 rounded-2xl p-4" style={{ backgroundColor: "#0F766E20" }}>
        <Text className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
          Invite Code
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-primary tracking-widest">
            {team?.inviteCode}
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={handleCopyCode}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "#0F766E20" }}
              testID="copy-invite-code"
            >
              <Copy size={16} color="#0F766E" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareCode}
              className="w-9 h-9 rounded-full bg-primary items-center justify-center"
              testID="share-invite-code"
            >
              <UserPlus size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-xs mt-1" style={{ color: "#0F766Eb3" }}>
          Share this code to invite team members
        </Text>
      </View>

      {/* Members list */}
      <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Members
      </Text>
      <FlatList
        data={team?.members ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberRow
            member={item}
            isCurrentUser={item.userId === session?.user?.id}
          />
        )}
        showsVerticalScrollIndicator={false}
        testID="members-list"
      />
    </SafeAreaView>
  );
}
