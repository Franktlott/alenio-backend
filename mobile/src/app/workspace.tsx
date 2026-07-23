import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, MessageSquare, MoreHorizontal, Users } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { isLeaderRole, resolveMyTeamRole } from "@/lib/member-identity";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Message, Team } from "@/lib/types";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { SpacesSection } from "@/components/SpacesSection";
import { UserAvatar } from "@/components/UserAvatar";

const cardStyle = {
  marginHorizontal: 14,
  marginBottom: 6,
  backgroundColor: "white",
  borderRadius: 14,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: "#E8ECF1",
  shadowColor: "#0F172A",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

function previewText(msg: Message | null | undefined): string {
  if (!msg) return "No messages yet";
  const name = msg.sender?.name?.trim().split(/\s+/)[0] || "Someone";
  if (msg.content?.trim()) return `${name}: ${msg.content.trim()}`;
  if (msg.mediaType === "video") return `${name} posted a video`;
  if (msg.mediaType === "image" || msg.mediaUrl) return `${name} posted a photo`;
  return `${name}: Attachment`;
}

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function WorkspaceScreen() {
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName?: string }>();
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const sessionUserId = typeof session?.user?.id === "string" ? session.user.id : "";

  useEffect(() => {
    if (teamId) setActiveTeamId(teamId);
  }, [teamId, setActiveTeamId]);

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { myRole } = resolveMyTeamRole({
    teamRole: team?.role,
    members: team?.members,
    sessionUserId,
    meEmail: typeof session?.user?.email === "string" ? session.user.email : undefined,
  });
  const canManage = isLeaderRole(myRole);

  const { data: generalPreview } = useQuery({
    queryKey: ["messages", teamId, "general", "preview"],
    queryFn: () =>
      api.get<{ messages: Message[]; hasMore: boolean; nextCursor: string | null }>(
        `/api/teams/${teamId}/messages?topicId=general&limit=1`,
      ),
    enabled: !!teamId,
    refetchInterval: 15000,
  });
  const generalLast = generalPreview?.messages?.[0] ?? null;

  const teamKey = `team:${teamId}`;
  const { data: teamUnread = {} } = useQuery({
    queryKey: ["team-unread-counts", teamId, "workspace-hub", lastReadIds[teamKey] ?? ""],
    queryFn: () =>
      api.post<Record<string, number>>(`/api/teams/${teamId}/messages/unread-counts`, {
        lastReadIds: { [teamKey]: lastReadIds[teamKey] ?? "" },
      }),
    enabled: !!teamId && !!session?.user,
    refetchInterval: 5000,
    staleTime: 0,
  });
  const mainChatUnread = teamUnread[teamKey] ?? 0;

  const headerName = teamName ?? team?.name ?? "Workspace";
  const memberCount = team?.members?.length ?? team?._count?.members;
  const visibleMembers = team?.members?.slice(0, 5) ?? [];
  const extraMembers = Math.max(0, (memberCount ?? 0) - visibleMembers.length);

  const openMainChat = () =>
    router.push({ pathname: "/team-chat", params: { teamId, teamName: headerName } });

  return (
    <SafeAreaView testID="workspace-screen" style={{ flex: 1, backgroundColor: "transparent" }} edges={["top"]}>
      {/* Top bar */}
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
            borderColor: "#E8ECF1",
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
            borderColor: "#E8ECF1",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel="Workspace details"
        >
          <MoreHorizontal size={17} color="#64748B" />
        </Pressable>
      </View>

      {/* Workspace identity */}
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
        <Text style={{ marginTop: 6, fontSize: 10, color: "#94A3B8", textAlign: "center" }}>
          Main communication hub for the team.
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 0 }}>
        {/* Main chat */}
        <Pressable
          testID="workspace-main-chat"
          onPress={openMainChat}
          style={[cardStyle, { paddingVertical: 11 }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                backgroundColor: "#F3F0FF",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MessageSquare size={17} color="#7C3AED" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>
                  Main Chat
                </Text>
                <Text style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>
                  {relativeTime(generalLast?.createdAt)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 11, color: "#64748B", flex: 1 }} numberOfLines={1}>
                  {previewText(generalLast)}
                </Text>
                {mainChatUnread > 0 ? (
                  <View
                    style={{
                      backgroundColor: "#EF4444",
                      borderRadius: 9,
                      minWidth: 18,
                      height: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 5,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>
                      {mainChatUnread > 99 ? "99+" : mainChatUnread}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <ChevronRight size={16} color="#A78BFA" />
          </View>
        </Pressable>

        {/* Topics (channels) — fill remaining height so empty state covers bottom space */}
        <View style={{ flex: 1, minHeight: 0, marginTop: 4, paddingBottom: Math.max(insets.bottom, 8) }}>
          {teamId ? (
            <SpacesSection
              teamId={teamId}
              teamName={headerName}
              canManage={canManage}
              cardStyle={cardStyle}
              title="Spaces"
              fillHeight
              workspaceHub
            />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
