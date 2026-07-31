import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Search, X, Check, Users } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { toast } from "burnt";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import type { Conversation, GroupMemberCandidate, Team } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";

export default function CreateGroupScreen() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const params = useLocalSearchParams<{ teamId?: string }>();
  const paramTeamId = typeof params.teamId === "string" ? params.teamId : null;

  const [groupName, setGroupName] = useState("");
  const [groupPhotoUri, setGroupPhotoUri] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<GroupMemberCandidate[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(paramTeamId ?? activeTeamId ?? null);

  useEffect(() => {
    if (paramTeamId) setSelectedTeamId(paramTeamId);
  }, [paramTeamId]);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  // `null` means a personal group, so the default is chosen once rather than
  // continuously re-forced — otherwise picking Personal would snap back to a workspace.
  const [scopeInitialized, setScopeInitialized] = useState(!!paramTeamId || !!activeTeamId);
  useEffect(() => {
    if (scopeInitialized) return;
    if (teams.length > 0 && teams[0]?.id) setSelectedTeamId(teams[0].id);
    setScopeInitialized(true);
  }, [scopeInitialized, teams]);

  const isPersonalGroup = selectedTeamId === null;

  const candidatesQuery = selectedTeamId
    ? `/api/dms/group-member-candidates?teamId=${encodeURIComponent(selectedTeamId)}${
        searchQuery.trim().length >= 2 ? `&q=${encodeURIComponent(searchQuery.trim())}` : ""
      }`
    : `/api/dms/group-member-candidates${
        searchQuery.trim().length >= 2 ? `?q=${encodeURIComponent(searchQuery.trim())}` : ""
      }`;

  const { data: candidates = [], isFetching: candidatesLoading } = useQuery({
    queryKey: ["group-member-candidates", selectedTeamId, searchQuery, candidatesQuery],
    queryFn: () => api.get<GroupMemberCandidate[]>(candidatesQuery),
    enabled: !!session?.user,
  });

  const createGroupMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      participantIds: string[];
      teamId?: string | null;
      imageUri?: string | null;
    }) => {
      let image: string | null = null;
      if (payload.imageUri) {
        const filename = payload.imageUri.split("/").pop() || "group-photo.jpg";
        const uploaded = await uploadFile(
          payload.imageUri,
          filename,
          "image/jpeg",
        );
        image = uploaded.url;
      }
      return api.post<Conversation>("/api/dms/create-group", {
        name: payload.name,
        participantIds: payload.participantIds,
        teamId: payload.teamId,
        image,
      });
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.replace({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.name ?? "Group",
          isGroup: "true",
        },
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not create group", preset: "error" });
    },
  });

  const toggleUser = (user: GroupMemberCandidate) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const isSelected = (userId: string) => selectedUsers.some((u) => u.id === userId);

  const displayUsers = useMemo(() => {
    const currentUserId = session?.user?.id ?? "";
    return candidates.filter((user) => user.id !== currentUserId);
  }, [candidates, session?.user?.id]);

  // Drop selections when workspace context changes (eligibility is workspace-scoped)
  useEffect(() => {
    setSelectedUsers([]);
  }, [selectedTeamId]);

  const canCreate = groupName.trim().length > 0 && selectedUsers.length >= 1;

  const pickGroupPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setGroupPhotoUri(result.assets[0].uri);
  };

  const handleCreate = () => {
    if (!canCreate) return;
    createGroupMutation.mutate({
      name: groupName.trim(),
      participantIds: selectedUsers.map((u) => u.id),
      teamId: selectedTeamId,
      imageUri: groupPhotoUri,
    });
  };

  const selectedTeamName = teams.find((t) => t.id === selectedTeamId)?.name;

  return (
    <SafeAreaView
      testID="create-group-screen"
      className="flex-1 bg-white dark:bg-slate-900"
      edges={["top", "bottom"]}
    >
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
              {selectedUsers.length > 0 ? `Create (${selectedUsers.length})` : "Create"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <Pressable
          onPress={() => void pickGroupPhoto()}
          style={{ alignSelf: "center", alignItems: "center", marginBottom: 14 }}
          accessibilityRole="button"
          accessibilityLabel={groupPhotoUri ? "Change group photo" : "Add group photo"}
          testID="group-photo-picker"
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#EEF2FF",
              borderWidth: 1,
              borderColor: "#DDE4FF",
              overflow: "visible",
            }}
          >
            {groupPhotoUri ? (
              <Image
                source={{ uri: groupPhotoUri }}
                style={{ width: 84, height: 84, borderRadius: 42 }}
                resizeMode="cover"
              />
            ) : (
              <Users size={30} color="#4361EE" strokeWidth={2} />
            )}
            <View
              style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#4361EE",
                borderWidth: 3,
                borderColor: "#FFFFFF",
              }}
            >
              <Camera size={13} color="#FFFFFF" strokeWidth={2.4} />
            </View>
          </View>
          <Text style={{ marginTop: 7, fontSize: 12, fontWeight: "600", color: "#4361EE" }}>
            {groupPhotoUri ? "Change group photo" : "Add group photo"}
          </Text>
        </Pressable>

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

        {teams.length > 0 ? (
          <View className="mt-3">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Group type
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                testID="create-group-workspace-personal"
                onPress={() => setSelectedTeamId(null)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: isPersonalGroup ? "#4361EE" : "#FFFFFF",
                  borderWidth: 1,
                  borderColor: isPersonalGroup ? "#4361EE" : "#E2E8F0",
                }}
              >
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: isPersonalGroup ? "#FFFFFF" : "#475569" }}
                >
                  Personal
                </Text>
              </Pressable>
              {teams.map((team) => {
                const active = selectedTeamId === team.id;
                return (
                  <Pressable
                    key={team.id}
                    testID={`create-group-workspace-${team.id}`}
                    onPress={() => setSelectedTeamId(team.id)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: active ? "#4361EE" : "#FFFFFF",
                      borderWidth: 1,
                      borderColor: active ? "#4361EE" : "#E2E8F0",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: active ? "#FFFFFF" : "#475569" }}>
                      {team.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text className="mt-2 text-xs text-slate-400">
              {isPersonalGroup
                ? "A personal group belongs to you, not a workspace. Add your connections and people you already chat with."
                : `Only people in ${selectedTeamName ?? "this workspace"} can be added. Members are never auto-added.`}
            </Text>
          </View>
        ) : null}

        {selectedUsers.length > 0 ? (
          <Text
            testID="selected-people-summary"
            className="mt-2 text-sm text-slate-600 dark:text-slate-300"
            numberOfLines={2}
          >
            {selectedUsers.length} {selectedUsers.length === 1 ? "person" : "people"}:{" "}
            {selectedUsers.map((u) => u.name ?? (u.username ? `@${u.username}` : "Member")).join(", ")}
          </Text>
        ) : (
          <Text className="mt-2 text-sm text-slate-400">Select people from the list below</Text>
        )}
      </View>

      <View className="px-4 py-3">
        <View
          className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5"
          style={{ gap: 8 }}
        >
          <Search size={16} color="#94A3B8" />
          <TextInput
            testID="user-search-input"
            placeholder={
              selectedTeamName
                ? `Search people in ${selectedTeamName}...`
                : "Search your people..."
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-sm text-slate-900 dark:text-white"
          />
          {candidatesLoading ? <ActivityIndicator size="small" color="#94A3B8" /> : null}
        </View>
      </View>

      {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 ? (
        <Text className="text-center text-slate-400 text-sm py-2">
          Type at least 2 characters to search
        </Text>
      ) : null}

      <FlatList
        testID="user-list"
        data={displayUsers}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          !searchQuery.trim() ? (
            <Text className="px-4 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {selectedTeamName ? `People in ${selectedTeamName}` : "Your people"}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          !candidatesLoading ? (
            <Text className="text-center text-slate-400 text-sm py-8">
              {searchQuery.trim().length >= 2
                ? "No people found"
                : isPersonalGroup
                  ? "Connect with people or start a chat, and they will appear here."
                  : "No teammates available yet"}
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const selected = isSelected(item.id);
          return (
          <Pressable
            testID={`user-item-${item.id}`}
            onPress={() => toggleUser(item)}
            className="flex-row items-center px-4 py-3"
          >
            <UserAvatar
              user={item}
              size={40}
              radius={20}
              backgroundColor="#6366F1"
              textColor="#FFFFFF"
              fontSize={14}
              style={{ marginRight: 12 }}
            />
            <View className="flex-1">
              <Text className="font-semibold text-slate-900 dark:text-white">
                {item.name ?? (item.username ? `@${item.username}` : "Member")}
              </Text>
              {item.workspaceLabel ? (
                <Text className="text-xs text-indigo-600 dark:text-indigo-300" numberOfLines={1}>
                  {item.workspaceLabel}
                </Text>
              ) : null}
              {item.username ? (
                <Text className="text-xs text-slate-500" numberOfLines={1}>
                  @{item.username}
                </Text>
              ) : null}
            </View>
            <View
              className="w-6 h-6 rounded-full border-2 items-center justify-center"
              style={{
                backgroundColor: selected ? "#4361EE" : "transparent",
                borderColor: selected ? "#4361EE" : "#CBD5E1",
              }}
            >
              {selected ? <Check size={14} color="white" /> : null}
            </View>
          </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
