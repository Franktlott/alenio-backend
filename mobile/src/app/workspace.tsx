import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, MoreHorizontal, Users } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";

export default function WorkspaceScreen() {
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName?: string }>();
  const insets = useSafeAreaInsets();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  useEffect(() => {
    if (teamId) setActiveTeamId(teamId);
  }, [teamId, setActiveTeamId]);

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const headerName = teamName ?? team?.name ?? "Workspace";
  const memberCount = team?.members?.length ?? team?._count?.members;
  const visibleMembers = team?.members?.slice(0, 5) ?? [];
  const extraMembers = Math.max(0, (memberCount ?? 0) - visibleMembers.length);

  return (
    <SafeAreaView testID="workspace-screen" style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingTop: 4,
          paddingBottom: 2,
        }}
      >
        <Pressable
          testID="workspace-back"
          onPress={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={17} color="#334155" />
        </Pressable>
        <Pressable
          testID="workspace-menu"
          onPress={() => router.push("/(app)/team")}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#F1F5F9",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel="Workspace details"
        >
          <MoreHorizontal size={17} color="#64748B" />
        </Pressable>
      </View>

      <View style={{ alignItems: "center", paddingTop: 2, paddingBottom: 12, paddingHorizontal: 24 }}>
        <WorkspaceTeamAvatar
          team={{ name: headerName, image: team?.image ?? null }}
          size={58}
          radius={16}
          backgroundColor="#6D42D8"
          textColor="#FFFFFF"
          borderColor="#DDD6FE"
        />
        <Text
          style={{
            marginTop: 8,
            fontSize: 19,
            fontWeight: "800",
            color: "#0F172A",
            letterSpacing: -0.4,
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {headerName}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
          <Users size={11} color="#94A3B8" />
          <Text style={{ fontSize: 11, color: "#64748B" }}>
            {memberCount ?? 0} member{memberCount === 1 ? "" : "s"}
          </Text>
        </View>
        {visibleMembers.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
            {visibleMembers.map((member, index) => (
              <UserAvatar
                key={member.userId}
                user={member.user}
                size={29}
                radius={15}
                backgroundColor="#EEF2FF"
                textColor="#4361EE"
                fontSize={10}
                style={{
                  marginLeft: index === 0 ? 0 : -6,
                  borderWidth: 2,
                  borderColor: "#F8F9FC",
                }}
              />
            ))}
            {extraMembers > 0 ? (
              <View
                style={{
                  width: 29,
                  height: 29,
                  borderRadius: 15,
                  marginLeft: -6,
                  backgroundColor: "#EEF2FF",
                  borderWidth: 2,
                  borderColor: "#F8F9FC",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: "700", color: "#6366F1" }}>+{extraMembers}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View
        style={{
          flex: 1,
          minHeight: 0,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 16),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <MessageCircle size={24} color="#4361EE" />
        </View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>
          Chat lives in your inbox
        </Text>
        <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, maxWidth: 280, marginBottom: 16 }}>
          Message teammates and create groups from the Chat tab. Alenio does not auto-create team chats.
        </Text>
        <Pressable
          testID="workspace-open-chat"
          onPress={() => router.replace("/(app)/chat")}
          style={{
            backgroundColor: "#4361EE",
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Open Chat</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
