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
import { Search, X, Check, Users } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { User, Team, Conversation } from "@/lib/types";

export default function CreateGroupScreen() {
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();

  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  // Fetch team members as suggestions
  const { data: team } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  // Search users when query is entered
  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ["user-search", searchQuery],
    queryFn: () => api.get<User[]>(`/api/users/search?q=${encodeURIComponent(searchQuery)}`),
    enabled: searchQuery.trim().length >= 2,
  });

  const createGroupMutation = useMutation({
    mutationFn: (payload: { name: string; participantIds: string[] }) =>
      api.post<Conversation>("/api/dms/create-group", payload),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.name ?? "Group",
          isGroup: "true",
        },
      });
    },
  });

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  };

  const isSelected = (userId: string) => selectedUsers.some((u) => u.id === userId);

  // Build user list: search results if query is active, else team members (excluding self)
  const currentUserId = session?.user?.id ?? "";
  const teamMembers: User[] = (team?.members ?? [])
    .filter((m) => m.userId !== currentUserId)
    .map((m) => m.user);

  const displayUsers =
    searchQuery.trim().length >= 2
      ? searchResults.filter((u) => u.id !== currentUserId)
      : teamMembers;

  const canCreate = groupName.trim().length > 0 && selectedUsers.length >= 1;

  const handleCreate = () => {
    if (!canCreate) return;
    createGroupMutation.mutate({
      name: groupName.trim(),
      participantIds: selectedUsers.map((u) => u.id),
    });
  };

  return (
    <SafeAreaView
      testID="create-group-screen"
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#64748B" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-slate-900 dark:text-white">New Group</Text>
        <TouchableOpacity
          testID="create-group-submit"
          onPress={handleCreate}
          disabled={!canCreate || createGroupMutation.isPending}
        >
          {createGroupMutation.isPending ? (
            <ActivityIndicator size="small" color="#4361EE" />
          ) : (
            <Text
              className="text-base font-semibold"
              style={{ color: canCreate ? "#4361EE" : "#94A3B8" }}
            >
              Create
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Group name input */}
      <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <View
          className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3"
          style={{ gap: 10 }}
        >
          <Users size={18} color="#94A3B8" />
          <TextInput
            testID="group-name-input"
            placeholder="Group name..."
            placeholderTextColor="#94A3B8"
            value={groupName}
            onChangeText={setGroupName}
            className="flex-1 text-base text-slate-900 dark:text-white"
            autoFocus
          />
        </View>
      </View>

      {/* Selected users chips */}
      {selectedUsers.length > 0 ? (
        <View
          className="px-4 py-2 flex-row flex-wrap border-b border-slate-100 dark:border-slate-800"
          style={{ gap: 8 }}
        >
          {selectedUsers.map((u) => (
            <TouchableOpacity
              key={u.id}
              onPress={() => toggleUser(u)}
              className="flex-row items-center bg-indigo-100 dark:bg-indigo-900 rounded-full px-3 py-1"
              style={{ gap: 6 }}
            >
              <Text className="text-indigo-700 dark:text-indigo-300 text-sm font-medium">
                {u.name}
              </Text>
              <X size={12} color="#6366F1" />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Search bar */}
      <View className="px-4 py-3">
        <View
          className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5"
          style={{ gap: 8 }}
        >
          <Search size={16} color="#94A3B8" />
          <TextInput
            testID="user-search-input"
            placeholder="Search by name or email..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-slate-900 dark:text-white"
          />
          {isSearching ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
        </View>
      </View>

      {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 ? (
        <Text className="text-center text-slate-400 text-sm py-2">
          Type at least 2 characters to search
        </Text>
      ) : null}

      {/* User list */}
      <FlatList
        testID="user-list"
        data={displayUsers}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          !searchQuery.trim() ? (
            <Text className="px-4 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
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
            testID={`user-item-${item.id}`}
            onPress={() => toggleUser(item)}
            className="flex-row items-center px-4 py-3"
          >
            <View className="w-10 h-10 rounded-full bg-indigo-500 items-center justify-center mr-3 overflow-hidden">
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={{ width: 40, height: 40 }}
                  resizeMode="cover"
                />
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
            <View
              className="w-6 h-6 rounded-full border-2 items-center justify-center"
              style={{
                backgroundColor: isSelected(item.id) ? "#4361EE" : "transparent",
                borderColor: isSelected(item.id) ? "#4361EE" : "#CBD5E1",
              }}
            >
              {isSelected(item.id) ? <Check size={14} color="white" /> : null}
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}
