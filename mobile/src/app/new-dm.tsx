import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { User, Team } from "@/lib/types";

export default function NewDMScreen() {
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: team } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: () => api.get<User[]>(`/api/users/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.trim().length >= 2,
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string } | null }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.recipient?.name ?? "Direct Message",
          isGroup: "false",
        },
      });
    },
  });

  const currentUserId = session?.user?.id ?? "";
  const teamMembers: User[] = (team?.members ?? [])
    .filter((m) => m.userId !== currentUserId)
    .map((m) => m.user);

  const displayUsers = searchQuery.trim().length >= 2
    ? searchResults.filter((u) => u.id !== currentUserId)
    : teamMembers;

  return (
    <SafeAreaView testID="new-dm-screen" className="flex-1 bg-white dark:bg-slate-900" edges={["top", "bottom"]}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#64748B" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-slate-900 dark:text-white">New Message</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Search bar */}
      <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5" style={{ gap: 8 }}>
          <Search size={16} color="#94A3B8" />
          <TextInput
            testID="dm-user-search-input"
            placeholder="Search by name or email..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-slate-900 dark:text-white"
            autoFocus
          />
          {isSearching ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
        </View>
      </View>

      {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 ? (
        <Text className="text-center text-slate-400 text-sm py-2">Type at least 2 characters to search</Text>
      ) : null}

      <FlatList
        testID="dm-user-list"
        data={displayUsers}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          !searchQuery.trim() ? (
            <Text className="px-4 pt-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Team Members
            </Text>
          ) : null
        }
        ListEmptyComponent={
          searchQuery.trim().length >= 2 && !isSearching ? (
            <Text className="text-center text-slate-400 text-sm py-8">No users found</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`dm-user-item-${item.id}`}
            onPress={() => dmMutation.mutate(item.id)}
            disabled={dmMutation.isPending}
            className="flex-row items-center px-4 py-3"
          >
            <View className="w-10 h-10 rounded-full bg-indigo-500 items-center justify-center mr-3 overflow-hidden">
              {item.image ? (
                <Image source={{ uri: item.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
              ) : (
                <Text className="text-white font-bold text-sm">
                  {item.name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              )}
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-slate-900 dark:text-white">{item.name}</Text>
              <Text className="text-xs text-slate-500">{item.email}</Text>
            </View>
            {dmMutation.isPending ? <ActivityIndicator size="small" color="#4361EE" /> : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
