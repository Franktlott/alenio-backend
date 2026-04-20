import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, Hash, ChevronLeft, Plus } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Team } from "@/lib/types";

const TOPIC_COLORS = ["#4361EE", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

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

export default function TeamChannelsScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName: string }>();
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelColor, setNewChannelColor] = useState("#4361EE");
  const [actionTopic, setActionTopic] = useState<Topic | null>(null);
  const [editTopic, setEditTopic] = useState<Topic | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteTopic, setDeleteTopic] = useState<Topic | null>(null);

  const { data: teamDetail } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { data: topics = [], isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ["topics", teamId],
    queryFn: () => api.get<Topic[]>(`/api/teams/${teamId}/topics`),
    enabled: !!teamId,
    refetchInterval: 10000,
  });

  const { data: teamGeneralMessages = [] } = useQuery({
    queryKey: ["messages", teamId, "general", "preview"],
    queryFn: () => api.get<any[]>(`/api/teams/${teamId}/messages?topicId=general&limit=1`),
    enabled: !!teamId,
    refetchInterval: 10000,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const teamChannelLastReadIds: Record<string, string> = {
    [`team:${teamId}`]: lastReadIds[`team:${teamId}`] ?? "",
    ...Object.fromEntries(topics.map((t) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])),
  };
  const { data: teamUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", teamId, teamChannelLastReadIds],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${teamId}/messages/unread-counts`, { lastReadIds: teamChannelLastReadIds }),
    enabled: !!teamId && !!session?.user,
    refetchInterval: 10000,
  });
  const teamChatUnreadCount = teamUnreadCounts[`team:${teamId}`] ?? 0;

  const members = teamDetail?.members ?? [];
  const memberCount = members.length;
  const topThreeMembers = members.slice(0, 3).map((m) => ({ image: m.user.image ?? null, name: m.user.name ?? null }));
  const lastGeneralMessage = teamGeneralMessages[0];

  // Determine if the current user is owner/admin of the team
  const currentMember = members.find((m) => m.user.id === session?.user?.id);
  const canManageChannels = currentMember?.role === "owner" || currentMember?.role === "admin";

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
    await queryClient.invalidateQueries({ queryKey: ["team", teamId] });
    setRefreshing(false);
  };

  const createChannelMutation = useMutation({
    mutationFn: ({ name, description, color }: { name: string; description: string; color: string }) =>
      api.post(`/api/teams/${teamId}/topics`, { name, description, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setShowCreateChannel(false);
      setNewChannelName("");
      setNewChannelDescription("");
      setNewChannelColor("#4361EE");
      toast({ title: "Channel created", preset: "done" });
    },
  });

  const updateChannelMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      api.patch(`/api/teams/${teamId}/topics/${id}`, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setEditTopic(null);
      toast({ title: "Channel updated", preset: "done" });
    },
  });

  const deleteChannelMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/teams/${teamId}/topics/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setDeleteTopic(null);
      toast({ title: "Channel deleted", preset: "done" });
    },
  });

  return (
    <SafeAreaView testID="team-channels-screen" style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={[]}>
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
            testID="team-channels-back-button"
          >
            <ChevronLeft size={20} color="white" />
          </Pressable>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "800", flex: 1 }}>{teamName || "Team"}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" />}
      >
        {/* Team Chat card */}
        <Pressable
          testID="team-channels-team-chat-button"
          onPress={() => router.push({ pathname: "/team-chat", params: { teamId, teamName: teamName ?? "" } })}
          style={{ marginHorizontal: 16, marginTop: 20, backgroundColor: "white", borderRadius: 20, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
        >
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
              {teamChatUnreadCount > 0 ? (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{teamChatUnreadCount}</Text>
                </View>
              ) : null}
              {topThreeMembers.length > 0 ? <AvatarStack members={topThreeMembers} /> : null}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 16 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 10 }}>
            <Text style={{ fontSize: 12, color: "#6B7280" }}>
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </Text>
            <Text style={{ fontSize: 12, color: "#6B7280" }}>
              {lastGeneralMessage
                ? `Last: ${formatTime(lastGeneralMessage.createdAt)}`
                : "No activity yet"}
            </Text>
          </View>
        </Pressable>

        {/* Channels section header */}
        <View style={{ marginHorizontal: 16, marginTop: 28, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>Channels</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
              {topics.length} {topics.length === 1 ? "active space" : "active spaces"}
            </Text>
          </View>
          {canManageChannels ? (
            <Pressable
              testID="create-channel-button"
              onPress={() => setShowCreateChannel(true)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}
            >
              <Plus size={18} color="#4361EE" />
            </Pressable>
          ) : null}
        </View>

        {/* Channel list */}
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
                onPress={() => router.push({ pathname: "/team-chat", params: { teamId, topicId: topic.id, topicName: topic.name, teamName: teamName ?? "" } })}
                onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setActionTopic(topic); }}
                style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "white", borderRadius: 20, padding: 16, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: topic.color + "22", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isHash ? (
                      <Hash size={20} color={topic.color} />
                    ) : (
                      <Text style={{ fontSize: 18, fontWeight: "700", color: topic.color }}>{firstLetter}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>{topic.name}</Text>
                      {topic.description ? (
                        <View style={{ backgroundColor: "#F1F5F9", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>{topic.description}</Text>
                        </View>
                      ) : unread > 0 ? (
                        <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }} numberOfLines={1}>
                      {topic.lastMessage
                        ? `${topic.lastMessage.sender.name ?? "Someone"}: ${topic.lastMessage.content ?? "Attachment"}`
                        : "No posts yet"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Channel action sheet */}
      <Modal visible={!!actionTopic} transparent animationType="slide" onRequestClose={() => setActionTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setActionTopic(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>#{actionTopic?.name}</Text>
              <Pressable
                testID="action-edit-channel"
                onPress={() => {
                  if (actionTopic) {
                    setEditName(actionTopic.name);
                    setEditDescription(actionTopic.description ?? "");
                    setEditTopic(actionTopic);
                  }
                  setActionTopic(null);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  <Hash size={18} color="#4361EE" />
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Edit channel</Text>
              </Pressable>
              <Pressable
                testID="action-delete-channel"
                onPress={() => { setDeleteTopic(actionTopic); setActionTopic(null); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 18 }}>🗑</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#EF4444" }}>Delete channel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit channel modal */}
      <Modal visible={!!editTopic} transparent animationType="slide" onRequestClose={() => setEditTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setEditTopic(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>Edit Channel</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Channel name..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14 }}
                  testID="edit-channel-name-input"
                />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Description</Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="Short description (optional)..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 20 }}
                  testID="edit-channel-description-input"
                />
                <Pressable
                  onPress={() => { if (editTopic && editName.trim()) updateChannelMutation.mutate({ id: editTopic.id, name: editName.trim(), description: editDescription.trim() }); }}
                  disabled={!editName.trim() || updateChannelMutation.isPending}
                  style={{ height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", opacity: !editName.trim() ? 0.5 : 1 }}
                  testID="edit-channel-submit"
                >
                  {updateChannelMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Save Changes</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Delete channel confirm modal */}
      <Modal visible={!!deleteTopic} transparent animationType="fade" onRequestClose={() => setDeleteTopic(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} onPress={() => setDeleteTopic(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", backgroundColor: "white", borderRadius: 20, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 20 }}>🗑</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Delete channel?</Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                Delete <Text style={{ fontWeight: "700" }}>#{deleteTopic?.name}</Text>? All messages will be permanently removed.
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <Pressable onPress={() => setDeleteTopic(null)} style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }} testID="cancel-delete-channel">
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (deleteTopic) deleteChannelMutation.mutate(deleteTopic.id); }}
                disabled={deleteChannelMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
                testID="confirm-delete-channel"
              >
                {deleteChannelMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#EF4444" }}>Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create Channel modal */}
      <Modal visible={showCreateChannel} transparent animationType="slide" onRequestClose={() => setShowCreateChannel(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowCreateChannel(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 16 }} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>New Channel</Text>
                <TextInput
                  value={newChannelName}
                  onChangeText={setNewChannelName}
                  placeholder="Channel name..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 16 }}
                  testID="channel-name-input"
                  autoFocus
                />
                <TextInput
                  value={newChannelDescription}
                  onChangeText={setNewChannelDescription}
                  placeholder="Short description (optional)..."
                  placeholderTextColor="#94A3B8"
                  style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 16 }}
                  testID="channel-description-input"
                />
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                  {TOPIC_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setNewChannelColor(color)}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, borderWidth: newChannelColor === color ? 3 : 0, borderColor: "white", elevation: newChannelColor === color ? 4 : 0 }}
                      testID={`channel-color-${color}`}
                    />
                  ))}
                </View>
                <Pressable
                  onPress={() => { if (newChannelName.trim()) createChannelMutation.mutate({ name: newChannelName.trim(), description: newChannelDescription.trim(), color: newChannelColor }); }}
                  disabled={!newChannelName.trim() || createChannelMutation.isPending}
                  style={{ height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", opacity: !newChannelName.trim() ? 0.5 : 1 }}
                  testID="create-channel-submit"
                >
                  {createChannelMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Create Channel</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
