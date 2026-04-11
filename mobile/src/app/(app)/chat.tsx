import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, Lock, Plus, Hash } from "lucide-react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Conversation, Team } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { useDemoMode } from "@/lib/useDemo";
import { useSubscriptionStore } from "@/lib/state/subscription-store";

const PINNED_DMS_KEY = "pinned_dms";

type Topic = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  lastMessage?: {
    id: string;
    content: string | null;
    mediaType?: string | null;
    createdAt: string;
    sender: { id: string; name: string | null };
  } | null;
  _count?: { messages: number };
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AvatarStack({ members }: { members: { image: string | null; name: string | null }[] }) {
  const shown = members.slice(0, 3);
  return (
    <View style={{ flexDirection: "row" }}>
      {shown.map((m, i) => (
        <View
          key={i}
          style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: "#4361EE",
            borderWidth: 2, borderColor: "white",
            marginLeft: i === 0 ? 0 : -8,
            alignItems: "center", justifyContent: "center",
            overflow: "hidden", zIndex: shown.length - i,
          }}
        >
          {m.image ? (
            <Image source={{ uri: m.image }} style={{ width: 28, height: 28 }} />
          ) : (
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>
              {m.name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();
  const [showGroupPaywall, setShowGroupPaywall] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedDmIds, setPinnedDmIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(PINNED_DMS_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setPinnedDmIds(parsed);
        } catch (_) {}
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PINNED_DMS_KEY, JSON.stringify(pinnedDmIds));
  }, [pinnedDmIds]);

  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const { data: teamDetail } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: topics = [], isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ["topics", activeTeamId],
    queryFn: () => api.get<Topic[]>(`/api/teams/${activeTeamId}/topics`),
    enabled: !!activeTeamId,
    refetchInterval: 10000,
  });

  const { data: teamGeneralMessages = [] } = useQuery({
    queryKey: ["messages", activeTeamId, "general", "preview"],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/messages?topicId=general&limit=1`),
    enabled: !!activeTeamId,
    refetchInterval: 10000,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const teamChannelLastReadIds: Record<string, string> = {
    [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "",
    ...Object.fromEntries(topics.map((t) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])),
  };
  const { data: teamUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", activeTeamId, teamChannelLastReadIds],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${activeTeamId}/messages/unread-counts`, { lastReadIds: teamChannelLastReadIds }),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 10000,
  });
  const teamUnreadCount = Object.values(teamUnreadCounts).reduce((a, b) => a + b, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["topics", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    setRefreshing(false);
  };

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  const members = teamDetail?.members ?? [];
  const memberCount = members.length;
  const topThreeMembers = members.slice(0, 3).map((m) => ({ image: m.user.image ?? null, name: m.user.name ?? null }));
  const lastGeneralMessage = teamGeneralMessages[0];

  return (
    <SafeAreaView testID="chat-screen" style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={[]}>
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "800", flex: 1 }}>Chat</Text>
          <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 26, width: 90, resizeMode: "contain" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {activeTeamId && !isDemo ? (
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}
                testID="chat-header-add-button"
              >
                <Plus size={13} color="white" />
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" />}
      >
        {/* ── Team profile card ── */}
        <View style={{ marginHorizontal: 16, marginTop: 20, backgroundColor: "white", borderRadius: 20, paddingVertical: 20, paddingHorizontal: 16, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EEF2FF", overflow: "hidden", marginBottom: 10, borderWidth: 3, borderColor: "white" }}>
            {teamDetail?.image ? (
              <Image source={{ uri: teamDetail.image }} style={{ width: 64, height: 64 }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Users size={28} color="#4361EE" />
              </View>
            )}
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>{teamDetail?.name ?? "Your Team"}</Text>
          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>
            {topics.length} {topics.length === 1 ? "channel" : "channels"} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </Text>
        </View>

        {/* ── Team Chat card ── */}
        <Pressable
          testID="team-chat-button"
          onPress={() => router.push({ pathname: "/team-channels", params: { teamId: activeTeamId, teamName: teamDetail?.name ?? "" } })}
          style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: "white", borderRadius: 20, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
        >
          {/* Purple accent top border */}
          <View style={{ height: 3, backgroundColor: "#4361EE" }} />
          <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
              <MessageCircle size={22} color="#4361EE" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Team Chat</Text>
              <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 1 }}>Primary team space</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {teamUnreadCount > 0 ? (
                <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{teamUnreadCount}</Text>
                </View>
              ) : null}
              {topThreeMembers.length > 0 ? <AvatarStack members={topThreeMembers} /> : null}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 16 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: "#6B7280" }}>
              👥 {memberCount} {memberCount === 1 ? "member" : "members"}
            </Text>
            <Text style={{ fontSize: 12, color: "#6B7280" }}>
              {lastGeneralMessage
                ? `⏰ ${formatTime(lastGeneralMessage.createdAt)}`
                : "⏰ No activity yet"}
            </Text>
          </View>
        </Pressable>

        {/* ── Channels section ── */}
        <View style={{ marginHorizontal: 16, marginTop: 24, marginBottom: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>Channels</Text>
          <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            {topics.length} {topics.length === 1 ? "active space" : "active spaces"}
          </Text>
        </View>

        {topicsLoading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : topics.length === 0 ? (
          <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 20, padding: 24, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontSize: 14 }}>No channels yet</Text>
          </View>
        ) : (
          topics.map((topic) => {
            const firstLetter = topic.name[0]?.toUpperCase() ?? "#";
            const isHash = /^[^a-zA-Z]/.test(topic.name);
            const unreadKey = `topic:${topic.id}`;
            const unread = teamUnreadCounts[unreadKey] ?? 0;
            return (
              <Pressable
                key={topic.id}
                testID={`channel-card-${topic.id}`}
                onPress={() => router.push({ pathname: "/team-chat", params: { teamId: activeTeamId, topicId: topic.id, topicName: topic.name, teamName: teamDetail?.name ?? "" } })}
                style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "white", borderRadius: 20, padding: 16, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  {/* Icon */}
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: topic.color + "22", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isHash ? (
                      <Hash size={20} color={topic.color} />
                    ) : (
                      <Text style={{ fontSize: 18, fontWeight: "700", color: topic.color }}>{firstLetter}</Text>
                    )}
                  </View>
                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>{topic.name}</Text>
                      {topic.description ? (
                        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>{topic.description}</Text>
                        </View>
                      ) : unread > 0 ? (
                        <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }} numberOfLines={1}>
                      {topic.lastMessage
                        ? `${topic.lastMessage.sender.name ?? "Someone"}: ${topic.lastMessage.content ?? "📎 Attachment"}`
                        : "No posts yet"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        {/* ── Create channel button ── */}
        {!isDemo ? (
          <View style={{ marginHorizontal: 16, marginTop: 8 }}>
            <Pressable
              testID="create-channel-button"
              onPress={() => router.push({ pathname: "/team-channels", params: { teamId: activeTeamId, teamName: teamDetail?.name ?? "", openCreate: "true" } })}
              style={{ backgroundColor: "#4361EE", borderRadius: 30, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              <Plus size={18} color="white" />
              <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Create channel</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Add / New Conversation modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAddModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 8 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>New Conversation</Text>
            </View>
            <Pressable
              testID="add-modal-new-dm"
              onPress={() => { setShowAddModal(false); router.push("/new-dm"); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#EEF2FF", borderRadius: 16, padding: 16 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={22} color="white" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Direct Message</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Send a private message to a teammate</Text>
              </View>
            </Pressable>
            <Pressable
              testID="add-modal-new-group"
              onPress={() => {
                setShowAddModal(false);
                if (!isPaid) { setShowGroupPaywall(true); } else { router.push("/create-group"); }
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#F5F3FF", borderRadius: 16, padding: 16 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" }}>
                <Users size={22} color="white" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>New Group</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Create a group conversation</Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Group chat paywall modal */}
      <Modal visible={showGroupPaywall} transparent animationType="fade" onRequestClose={() => setShowGroupPaywall(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }} onPress={() => setShowGroupPaywall(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" }} testID="group-paywall-modal">
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Lock size={28} color="#4361EE" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>Group Chats</Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                Upgrade to Alenio Team to create group conversations with your team
              </Text>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/subscription"); }}
                testID="group-paywall-upgrade-button"
                style={{ borderRadius: 14, overflow: "hidden", width: "100%", shadowColor: "#4361EE", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5, marginBottom: 10 }}
              >
                <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Upgrade to Team Plan</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGroupPaywall(false)} style={{ paddingVertical: 10, width: "100%", alignItems: "center" }} testID="group-paywall-dismiss">
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 14 }}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowGroupPaywall(false); router.push("/subscription"); }} style={{ paddingVertical: 8, width: "100%", alignItems: "center" }} testID="group-paywall-restore">
                <Text style={{ color: "#CBD5E1", fontSize: 12 }}>Restore Purchases</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
