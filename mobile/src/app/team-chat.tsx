import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import type { Message } from "@/lib/types";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MessageItem = Message | { type: "date"; label: string; id: string };

function buildMessageList(messages: Message[]): MessageItem[] {
  const items: MessageItem[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const dateLabel = formatDateLabel(msg.createdAt);
    if (dateLabel !== lastDate) {
      items.push({ type: "date", label: dateLabel, id: `date-${msg.id}` });
      lastDate = dateLabel;
    }
    items.push(msg);
  }
  return items;
}

export default function TeamChatScreen() {
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = session?.user?.id;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", teamId],
    queryFn: () => api.get<Message[]>(`/api/teams/${teamId}/messages`),
    enabled: !!teamId,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.post<Message>(`/api/teams/${teamId}/messages`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", teamId] });
    },
  });

  const handleSend = () => {
    const content = input.trim();
    if (!content || !teamId) return;
    setInput("");
    sendMutation.mutate(content);
  };

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const items = buildMessageList(messages);

  return (
    <SafeAreaView
      testID="team-chat-screen"
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      edges={["top"]}
    >
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{teamName ?? "Team Chat"}</Text>
            <Text className="text-white/70 text-xs">Team channel</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View testID="team-chat-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messages.length === 0 ? (
          <View testID="team-chat-empty" className="flex-1 items-center justify-center px-6">
            <Text className="text-4xl mb-3">💬</Text>
            <Text className="text-lg font-semibold text-slate-500">No messages yet</Text>
            <Text className="text-slate-400 text-sm mt-1 text-center">Be the first to say something!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            testID="team-chat-message-list"
            data={items}
            keyExtractor={(item) => ("type" in item ? item.id : item.id)}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              if ("type" in item && item.type === "date") {
                return (
                  <View className="items-center my-3">
                    <View className="bg-slate-200 dark:bg-slate-700 rounded-full px-3 py-0.5">
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{item.label}</Text>
                    </View>
                  </View>
                );
              }
              const msg = item as Message;
              const isOwn = msg.senderId === currentUserId;
              return (
                <View
                  testID={`team-chat-message-${msg.id}`}
                  className={`flex-row mb-3 ${isOwn ? "justify-end" : "justify-start"}`}
                >
                  {!isOwn ? (
                    <View className="w-8 h-8 rounded-full bg-indigo-500 items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <Text className="text-white text-xs font-bold">{msg.sender.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  ) : null}
                  <View className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
                    {!isOwn ? (
                      <Text className="text-xs text-slate-500 dark:text-slate-400 mb-1 ml-1">{msg.sender.name}</Text>
                    ) : null}
                    <View
                      className={`rounded-2xl px-4 py-2.5 ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                      style={{
                        backgroundColor: isOwn ? "#4361EE" : "white",
                        shadowColor: "#000",
                        shadowOpacity: 0.06,
                        shadowRadius: 3,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 1,
                      }}
                    >
                      <Text className={`text-sm leading-5 ${isOwn ? "text-white" : "text-slate-900 dark:text-slate-100"}`}>
                        {msg.content}
                      </Text>
                    </View>
                    <Text className="text-xs text-slate-400 mt-1 mx-1">{formatTime(msg.createdAt)}</Text>
                  </View>
                  {isOwn ? (
                    <View className="w-8 h-8 rounded-full bg-indigo-500 items-center justify-center ml-2 mt-1 flex-shrink-0">
                      <Text className="text-white text-xs font-bold">{session?.user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        )}
        <View
          testID="team-chat-input-bar"
          className="flex-row items-end px-3 py-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700"
        >
          <TextInput
            testID="team-chat-text-input"
            className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-2.5 text-base text-slate-900 dark:text-white mr-2"
            placeholder="Message..."
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            style={{ maxHeight: 120 }}
          />
          <TouchableOpacity
            testID="team-chat-send-button"
            onPress={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: input.trim() ? "#4361EE" : "#E2E8F0" }}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color={input.trim() ? "white" : "#94A3B8"} />
            ) : (
              <Send size={18} color={input.trim() ? "white" : "#94A3B8"} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
