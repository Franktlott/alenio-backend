import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, ChevronRight, Plus } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Conversation } from "@/lib/types";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatScreen() {
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const [fabOpen, setFabOpen] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<any[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const { data: conversations = [], isLoading: dmsLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!session?.user,
    refetchInterval: 5000,
  });

  const currentTeam = teams?.find((t: any) => t.id === activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  return (
    <SafeAreaView
      testID="chat-screen"
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["top"]}
    >
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View className="px-4 pt-2 pb-4">
          <Text className="text-white text-xl font-bold">Messages</Text>
          <Text className="text-white/70 text-sm">Team chat & direct messages</Text>
        </View>
      </LinearGradient>

      <FlatList
        data={[]}
        ListHeaderComponent={
          <View>
            {/* Team Chat section */}
            <Text className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Team Chat
            </Text>
            <TouchableOpacity
              testID="team-chat-button"
              onPress={() =>
                router.push({
                  pathname: "/team-chat",
                  params: { teamId: activeTeamId ?? "", teamName: currentTeam?.name ?? "" },
                })
              }
              className="mx-4 mb-1 bg-white dark:bg-slate-800 rounded-2xl p-4 flex-row items-center"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center mr-3 overflow-hidden">
                {currentTeam?.image ? (
                  <Image source={{ uri: currentTeam.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <Users size={22} color="#4361EE" />
                )}
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900 dark:text-white">
                  {currentTeam?.name ?? "Team Chat"}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  Team channel
                </Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* DMs section */}
            <View className="flex-row items-center px-4 pt-5 pb-2">
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Direct Messages
              </Text>
            </View>

            {dmsLoading ? (
              <View className="py-8 items-center" testID="dms-loading">
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : null}

            {!dmsLoading && conversations.length === 0 && (
              <View className="mx-4 bg-white dark:bg-slate-800 rounded-2xl p-5 items-center" testID="dms-empty">
                <MessageCircle size={32} color="#94A3B8" />
                <Text className="text-slate-500 text-sm mt-2 text-center">
                  {"No direct messages yet.\nGo to the Team tab to message a member."}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={null}
        ListFooterComponent={
          <View>
            {conversations.map((conv) => (
              <TouchableOpacity
                key={conv.id}
                testID={`dm-conversation-${conv.id}`}
                onPress={() =>
                  router.push({
                    pathname: "/dm-chat",
                    params: {
                      conversationId: conv.id,
                      recipientName: conv.isGroup
                        ? (conv.name ?? "Group")
                        : (conv.recipient?.name ?? "Direct Message"),
                      recipientImage: conv.isGroup ? "" : (conv.recipient?.image ?? ""),
                      isGroup: conv.isGroup ? "true" : "false",
                    },
                  })
                }
                className="mx-4 mb-2 bg-white dark:bg-slate-800 rounded-2xl p-4 flex-row items-center"
                style={{
                  shadowColor: "#000",
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 1,
                }}
              >
                <View className="w-12 h-12 rounded-full bg-indigo-500 items-center justify-center mr-3 overflow-hidden">
                  {conv.isGroup ? (
                    <Users size={22} color="white" />
                  ) : conv.recipient?.image ? (
                    <Image source={{ uri: conv.recipient.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                  ) : (
                    <Text className="text-white font-bold text-lg">
                      {conv.recipient?.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-slate-900 dark:text-white">
                    {conv.isGroup ? (conv.name ?? "Group") : (conv.recipient?.name ?? "Unknown")}
                  </Text>
                  {conv.lastMessage ? (
                    <Text
                      className="text-sm text-slate-500 dark:text-slate-400"
                      numberOfLines={1}
                    >
                      {conv.lastMessage.sender.id === session?.user?.id ? "You: " : null}
                      {conv.lastMessage.content}
                    </Text>
                  ) : (
                    <Text className="text-sm text-slate-400 italic">No messages yet</Text>
                  )}
                </View>
                <View className="items-end" style={{ gap: 4 }}>
                  {conv.lastMessage ? (
                    <Text className="text-xs text-slate-400">
                      {formatTime(conv.lastMessage.createdAt)}
                    </Text>
                  ) : null}
                  {conv.lastMessage &&
                   conv.lastMessage.sender.id !== session?.user?.id &&
                   lastReadIds[conv.id] !== conv.lastMessage.id ? (
                    <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                      <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>1</Text>
                    </View>
                  ) : (
                    <ChevronRight size={16} color="#94A3B8" />
                  )}
                </View>
              </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        testID="fab-new-conversation"
        onPress={() => setFabOpen(true)}
        className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-indigo-600 items-center justify-center"
        style={{
          shadowColor: "#4361EE",
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        <Plus size={26} color="white" />
      </TouchableOpacity>

      {/* FAB popup menu */}
      <Modal
        visible={fabOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFabOpen(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/30"
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        >
          <View className="absolute bottom-24 right-5" style={{ gap: 10 }}>
            {/* New Group option */}
            <TouchableOpacity
              testID="fab-new-group"
              onPress={() => { setFabOpen(false); router.push("/create-group"); }}
              className="flex-row items-center self-end bg-white dark:bg-slate-800 rounded-2xl px-4 py-3"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
                gap: 10,
              }}
            >
              <Text className="text-slate-900 dark:text-white font-semibold text-sm">New Group</Text>
              <View className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center">
                <Users size={18} color="white" />
              </View>
            </TouchableOpacity>

            {/* New Direct Message option */}
            <TouchableOpacity
              testID="fab-new-dm"
              onPress={() => { setFabOpen(false); router.push("/new-dm"); }}
              className="flex-row items-center self-end bg-white dark:bg-slate-800 rounded-2xl px-4 py-3"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
                gap: 10,
              }}
            >
              <Text className="text-slate-900 dark:text-white font-semibold text-sm">Direct Message</Text>
              <View className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center">
                <MessageCircle size={18} color="white" />
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
