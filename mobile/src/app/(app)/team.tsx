import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, UserPlus, MessageCircle, Pencil, X, Camera } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import { toast } from "burnt";
import type { Team, TeamMember } from "@/lib/types";

function MemberRow({
  member,
  isCurrentUser,
  onMessage,
  stats,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  onMessage: () => void;
  stats?: { activeTasks: number; overdueTasks: number; onTimeCompletions: number };
}) {
  return (
    <View
      className="flex-row items-center px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700"
      testID="member-row"
    >
      <View className="w-10 h-10 rounded-full bg-indigo-600 items-center justify-center mr-3 overflow-hidden">
        {member.user.image ? (
          <Image source={{ uri: member.user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Text className="text-white font-bold text-sm">{member.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-white font-semibold">
          {member.user.name} {isCurrentUser ? "(you)" : ""}
        </Text>
        <Text className="text-slate-500 text-xs mb-1">{member.user.email}</Text>
        <View className="flex-row" style={{ gap: 6 }}>
          <View className="flex-row items-center bg-indigo-50 dark:bg-indigo-900/40 rounded-full px-2 py-0.5">
            <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">{stats?.activeTasks ?? 0} active</Text>
          </View>
          {(stats?.overdueTasks ?? 0) > 0 ? (
            <View className="flex-row items-center bg-red-50 dark:bg-red-900/40 rounded-full px-2 py-0.5">
              <Text className="text-red-600 dark:text-red-400 text-xs font-medium">{stats?.overdueTasks} overdue</Text>
            </View>
          ) : null}
          <View className="flex-row items-center bg-emerald-50 dark:bg-emerald-900/40 rounded-full px-2 py-0.5">
            <Text className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">{stats?.onTimeCompletions ?? 0} on time</Text>
          </View>
        </View>
      </View>
      {!isCurrentUser ? (
        <TouchableOpacity
          testID={`message-member-${member.userId}`}
          onPress={onMessage}
          className="w-8 h-8 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: "#4361EE15" }}
        >
          <MessageCircle size={16} color="#4361EE" />
        </TouchableOpacity>
      ) : null}
      <View className={`px-2 py-0.5 rounded-full ${member.role === "owner" ? "bg-amber-100" : "bg-slate-100 dark:bg-slate-700"}`}>
        <Text className={`text-xs font-medium capitalize ${member.role === "owner" ? "text-amber-700" : "text-slate-600 dark:text-slate-400"}`}>
          {member.role}
        </Text>
      </View>
    </View>
  );
}

export default function TeamScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: memberStats } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<Record<string, { activeTasks: number; overdueTasks: number; onTimeCompletions: number }>>(
        `/api/teams/${activeTeamId}/tasks/member-stats`
      ),
    enabled: !!activeTeamId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; image?: string | null }) =>
      api.patch<Team>(`/api/teams/${activeTeamId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setShowEditModal(false);
      toast({ title: "Team updated", preset: "done" });
    },
    onError: () => toast({ title: "Failed to update team", preset: "error" }),
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string } | null }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push({ pathname: "/dm-chat", params: { conversationId: conv.id, recipientName: conv.recipient?.name ?? "Direct Message" } });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${activeTeamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setShowEditModal(false);
      router.replace("/onboarding");
    },
    onError: () => toast({ title: "Failed to delete team", preset: "error" }),
  });

  const currentMember = team?.members?.find((m) => m.userId === session?.user?.id);
  const canEdit = currentMember?.role === "owner" || currentMember?.role === "admin";

  const openEditModal = () => {
    setEditName(team?.name ?? "");
    setEditImage(team?.image ?? null);
    setShowEditModal(true);
  };

  const pickTeamPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const uploaded = await uploadFile(asset.uri, "team-photo.jpg", "image/jpeg");
      setEditImage(uploaded.url);
    } catch {
      toast({ title: "Failed to upload photo", preset: "error" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = () => {
    if (!editName.trim()) return;
    updateMutation.mutate({ name: editName.trim(), image: editImage });
  };

  const handleCopyCode = async () => {
    if (team?.inviteCode) await Clipboard.setStringAsync(team.inviteCode);
  };

  const handleShareCode = () => {
    if (team?.inviteCode) {
      Share.share({ message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}` });
    }
  };

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center">
        <Text className="text-slate-500">No team selected</Text>
        <TouchableOpacity className="mt-4 bg-indigo-600 rounded-xl px-6 py-3" onPress={() => router.push("/onboarding")}>
          <Text className="text-white font-semibold">Create or join a team</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center" testID="loading-indicator">
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]} testID="team-screen">
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center" style={{ gap: 12 }}>
          {/* Team photo */}
          <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center overflow-hidden">
            {team?.image ? (
              <Image source={{ uri: team.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
            ) : (
              <Text className="text-white font-bold text-xl">{team?.name?.[0]?.toUpperCase() ?? "T"}</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white text-xl font-bold">{team?.name}</Text>
            <Text className="text-white/70 text-sm">{team?.members?.length ?? 0} members</Text>
          </View>
          {canEdit ? (
            <TouchableOpacity
              onPress={openEditModal}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
              testID="edit-team-button"
            >
              <Pencil size={16} color="white" />
            </TouchableOpacity>
          ) : null}
        </View>
      </LinearGradient>

      {/* Invite code card */}
      <View className="mx-4 mb-4 mt-4 rounded-2xl p-4" style={{ backgroundColor: "#4361EE15" }}>
        <Text className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Invite Code</Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-indigo-600 tracking-widest">{team?.inviteCode}</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={handleCopyCode}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "#4361EE20" }}
              testID="copy-invite-code"
            >
              <Copy size={16} color="#4361EE" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareCode}
              className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center"
              testID="share-invite-code"
            >
              <UserPlus size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-xs mt-1" style={{ color: "#4361EEb3" }}>Share this code to invite team members</Text>
      </View>

      {/* Members list */}
      <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Members</Text>
      <FlatList
        data={team?.members ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberRow
            member={item}
            isCurrentUser={item.userId === session?.user?.id}
            onMessage={() => dmMutation.mutate(item.userId)}
            stats={memberStats?.[item.userId]}
          />
        )}
        showsVerticalScrollIndicator={false}
        testID="members-list"
      />

      {/* Edit team modal */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowEditModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">
                {/* Header */}
                <View className="flex-row items-center justify-between mb-6">
                  <Text className="text-lg font-bold text-slate-900 dark:text-white">Edit Team</Text>
                  <TouchableOpacity onPress={() => setShowEditModal(false)} testID="close-edit-modal">
                    <X size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Team photo */}
                <View className="items-center mb-6">
                  <TouchableOpacity onPress={pickTeamPhoto} disabled={uploadingImage} testID="pick-team-photo">
                    <View className="w-24 h-24 rounded-full bg-indigo-100 items-center justify-center overflow-hidden">
                      {uploadingImage ? (
                        <ActivityIndicator color="#4361EE" />
                      ) : editImage ? (
                        <Image source={{ uri: editImage }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                      ) : (
                        <Text className="text-indigo-600 font-bold text-3xl">{editName?.[0]?.toUpperCase() ?? "T"}</Text>
                      )}
                    </View>
                    <View
                      className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 items-center justify-center"
                      style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}
                    >
                      <Camera size={14} color="white" />
                    </View>
                  </TouchableOpacity>
                  <Text className="text-xs text-slate-400 mt-2">Tap to change photo</Text>
                </View>

                {/* Team name */}
                <View className="mb-6">
                  <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Team Name</Text>
                  <TextInput
                    className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base"
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Enter team name"
                    placeholderTextColor="#94A3B8"
                    testID="team-name-input"
                    returnKeyType="done"
                  />
                </View>

                {/* Save button */}
                <TouchableOpacity
                  onPress={handleSave}
                  disabled={updateMutation.isPending || !editName.trim()}
                  className="rounded-2xl py-4 items-center"
                  style={{ backgroundColor: editName.trim() ? "#4361EE" : "#CBD5E1" }}
                  testID="save-team-button"
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">Save Changes</Text>
                  )}
                </TouchableOpacity>

                {/* Delete team (owner only) */}
                {currentMember?.role === "owner" ? (
                  <TouchableOpacity
                    onPress={() => setShowDeleteConfirm(true)}
                    className="mt-3 rounded-2xl py-4 items-center border border-red-200"
                    testID="delete-team-button"
                  >
                    <Text className="text-red-500 font-semibold text-base">Delete Team</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}>
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full">
            <Text className="text-lg font-bold text-slate-900 dark:text-white mb-2">Delete Team?</Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              This will permanently delete <Text className="font-semibold text-slate-700 dark:text-slate-200">{team?.name}</Text> and all its tasks, messages, and members. This cannot be undone.
            </Text>
            <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Type <Text className="text-slate-800 dark:text-slate-200">{team?.name}</Text> to confirm
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base mb-4 border border-slate-200 dark:border-slate-600"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={team?.name ?? ""}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              testID="delete-confirm-input"
            />
            <TouchableOpacity
              onPress={() => { deleteMutation.mutate(); setDeleteConfirmText(""); }}
              disabled={deleteMutation.isPending || deleteConfirmText !== team?.name}
              className="rounded-2xl py-4 items-center mb-3"
              style={{ backgroundColor: deleteConfirmText === team?.name ? "#EF4444" : "#CBD5E1" }}
              testID="confirm-delete-team"
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Delete Forever</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
              className="rounded-2xl py-4 items-center bg-slate-100 dark:bg-slate-700"
              testID="cancel-delete-team"
            >
              <Text className="text-slate-700 dark:text-slate-200 font-semibold text-base">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
