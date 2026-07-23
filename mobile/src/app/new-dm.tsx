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
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { User, Team } from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";

export default function NewDMScreen() {
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: team,
    isError: teamError,
    error: teamLoadError,
    refetch: refetchTeam,
    isLoading: teamLoading,
  } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const {
    data: searchResults = [],
    isFetching: isSearching,
    isError: searchError,
    error: searchLoadError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: () => api.get<User[]>(`/api/users/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.trim().length >= 2,
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string; image?: string | null } | null }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.replace({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.recipient?.name ?? "Direct Message",
          recipientImage: resolveUserImageUrl(conv.recipient?.image) ?? "",
          isGroup: "false",
        },
      });
    },
    onError: (err) => {
      toast({
        title: err instanceof Error ? err.message : "Couldn't start conversation",
        preset: "error",
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

      {!searchQuery.trim() && teamError ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }}
          testID="new-dm-team-error"
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
            Couldn&apos;t load teammates
          </Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 8, textAlign: "center" }}>
            {teamLoadError instanceof Error ? teamLoadError.message : "Please try again."}
          </Text>
          <TouchableOpacity
            onPress={() => void refetchTeam()}
            testID="new-dm-team-error-retry"
            style={{
              marginTop: 16,
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!searchQuery.trim() && !teamError && teamLoading ? (
        <View style={{ paddingVertical: 32, alignItems: "center" }} testID="new-dm-team-loading">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : null}

      {searchQuery.trim().length >= 2 && searchError ? (
        <View
          style={{ paddingHorizontal: 40, paddingVertical: 24, alignItems: "center" }}
          testID="new-dm-search-error"
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
            Couldn&apos;t search users
          </Text>
          <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>
            {searchLoadError instanceof Error ? searchLoadError.message : "Please try again."}
          </Text>
          <TouchableOpacity
            onPress={() => void refetchSearch()}
            testID="new-dm-search-error-retry"
            style={{
              marginTop: 12,
              backgroundColor: "#4361EE",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {((!teamError && !teamLoading) || searchQuery.trim().length >= 2) && !searchError ? (
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
            ) : !searchQuery.trim() && !teamLoading ? (
              <Text className="text-center text-slate-400 text-sm py-8">No teammates to message</Text>
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
      ) : null}
    </SafeAreaView>
  );
}
