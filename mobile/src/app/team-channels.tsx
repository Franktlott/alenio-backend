import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, MessageCircle } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Message, Team } from "@/lib/types";

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

const TOPIC_COLORS = ["#4361EE", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

export default function TeamChannelsScreen() {
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicColor, setNewTopicColor] = useState("#4361EE");
  const [deleteTarget, setDeleteTarget] = useState<Topic | null>(null);

  const { data: topics = [], isLoading: topicsLoading } = useQuery({
    queryKey: ["topics", teamId],
    queryFn: () => api.get<Topic[]>(`/api/teams/${teamId}/topics`),
    enabled: !!teamId,
    refetchInterval: 5000,
  });

  const { data: generalMessages = [] } = useQuery({
    queryKey: ["messages", teamId, "general", "preview"],
    queryFn: () => api.get<Message[]>(`/api/teams/${teamId}/messages?topicId=general&limit=1`),
    enabled: !!teamId,
    refetchInterval: 5000,
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const currentUserId = session?.user?.id ?? "";
  const currentUserRole = team?.members?.find((m: any) => m.userId === currentUserId)?.role;
  const isOwnerOrAdmin = currentUserRole === "owner" || currentUserRole === "admin";
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  const channelLastReadIds: Record<string, string> = {
    [`team:${teamId}`]: lastReadIds[`team:${teamId}`] ?? "",
    ...Object.fromEntries(topics.map((t) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])),
  };
  const { data: channelUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", teamId, channelLastReadIds],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${teamId}/messages/unread-counts`, { lastReadIds: channelLastReadIds }),
    enabled: !!teamId && topics.length >= 0,
    refetchInterval: 5000,
  });

  const createTopicMutation = useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      api.post<Topic>(`/api/teams/${teamId}/topics`, { name, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setShowCreateModal(false);
      setNewTopicName("");
      setNewTopicColor("#4361EE");
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: (topicId: string) =>
      api.delete(`/api/teams/${teamId}/topics/${topicId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topics", teamId] });
      setDeleteTarget(null);
    },
  });

  const teamNameStr = Array.isArray(teamName) ? teamName[0] : (teamName ?? "Team");

  return (
    <SafeAreaView testID="team-channels-screen" style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            testID="back-button"
            onPress={() => router.back()}
            style={{ marginRight: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
          >
            <ArrowLeft size={20} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{teamNameStr}</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 1 }}>Channels</Text>
          </View>
          {team?.image ? (
            <View style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)" }}>
              <Image source={{ uri: team.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
            </View>
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>{teamNameStr[0]?.toUpperCase() ?? "T"}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Main chat row */}
        <TouchableOpacity
          testID="main-chat-row"
          onPress={() => router.push({ pathname: "/team-chat", params: { teamId, teamName } })}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "white", borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}
        >
          <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: "#6B7280", alignItems: "center", justifyContent: "center", marginRight: 14 }}>
            <MessageCircle size={24} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Main chat</Text>
            {generalMessages[0] ? (
            <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }} numberOfLines={1}>
              {generalMessages[0].sender.name}: {generalMessages[0].content ?? "Sent a photo"}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>No messages yet</Text>
          )}
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            {generalMessages[0] ? (
              <Text style={{ fontSize: 12, color: "#94A3B8" }}>{formatTime(generalMessages[0].createdAt)}</Text>
            ) : null}
            {(channelUnreadCounts[`team:${teamId}`] ?? 0) > 0 ? (
              <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{channelUnreadCounts[`team:${teamId}`]}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        {/* Topics section */}
        {(topics.length > 0 || isOwnerOrAdmin) ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5 }}>Channels</Text>
          </View>
        ) : null}

        {topicsLoading ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : null}

        {topics.map((topic) => (
          <TouchableOpacity
            key={topic.id}
            testID={`topic-row-${topic.id}`}
            onPress={() => router.push({ pathname: "/team-chat", params: { teamId, teamName, topicId: topic.id, topicName: topic.name } })}
            onLongPress={() => { if (isOwnerOrAdmin) setDeleteTarget(topic); }}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "white", borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}
          >
            <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: topic.color, alignItems: "center", justifyContent: "center", marginRight: 14 }}>
              <Text style={{ color: "white", fontSize: 22, fontWeight: "700" }}>#</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>{topic.name}</Text>
              {topic.lastMessage ? (
                <Text style={{ fontSize: 13, color: "#64748B", marginTop: 2 }} numberOfLines={1}>
                  {topic.lastMessage.sender.name}: {topic.lastMessage.content ?? (topic.lastMessage.mediaType ? "Sent a photo" : "")}
                </Text>
              ) : (
                <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>No messages yet</Text>
              )}
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              {topic.lastMessage ? (
                <Text style={{ fontSize: 12, color: "#94A3B8" }}>{formatTime(topic.lastMessage.createdAt)}</Text>
              ) : null}
              {(channelUnreadCounts[`topic:${topic.id}`] ?? 0) > 0 ? (
                <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{channelUnreadCounts[`topic:${topic.id}`]}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        ))}

        {/* New topic button */}
        {isOwnerOrAdmin ? (
          <TouchableOpacity
            testID="new-topic-button"
            onPress={() => setShowCreateModal(true)}
            style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: "#F8FAFC", borderWidth: 1.5, borderColor: "#E2E8F0", borderStyle: "dashed", alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            <Text style={{ fontSize: 16, color: "#64748B" }}>+</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#64748B" }}>New channel</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Create Topic modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setShowCreateModal(false)}>
          <TouchableOpacity activeOpacity={1}>
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>New Channel</Text>
              <TextInput
                value={newTopicName}
                onChangeText={setNewTopicName}
                placeholder="Channel name..."
                placeholderTextColor="#94A3B8"
                style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 16 }}
                testID="topic-name-input"
              />
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                {TOPIC_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setNewTopicColor(color)}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, borderWidth: newTopicColor === color ? 3 : 0, borderColor: "white", elevation: newTopicColor === color ? 4 : 0 }}
                    testID={`topic-color-${color}`}
                  />
                ))}
              </View>
              <TouchableOpacity
                onPress={() => { if (newTopicName.trim()) createTopicMutation.mutate({ name: newTopicName.trim(), color: newTopicColor }); }}
                disabled={!newTopicName.trim() || createTopicMutation.isPending}
                style={{ height: 48, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }}
                testID="create-topic-button"
              >
                {createTopicMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Create Channel</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete Topic confirm modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          activeOpacity={1}
          onPress={() => setDeleteTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} style={{ width: "100%", backgroundColor: "white", borderRadius: 20, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Text style={{ fontSize: 20 }}>🗑</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>Delete channel?</Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                Delete <Text style={{ fontWeight: "700" }}>#{deleteTarget?.name}</Text>? All messages in this channel will also be deleted.
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <TouchableOpacity
                onPress={() => setDeleteTarget(null)}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }}
                testID="cancel-delete-topic-button"
              >
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (deleteTarget) deleteTopicMutation.mutate(deleteTarget.id); }}
                disabled={deleteTopicMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
                testID="confirm-delete-topic-button"
              >
                {deleteTopicMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#EF4444" }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
