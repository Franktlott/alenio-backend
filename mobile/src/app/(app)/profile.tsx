import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ActionSheetIOS,
  Platform,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Camera, LogOut, Pencil, Check, X, ChevronRight, Plus, Trash2, Bell } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession, useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import * as ImagePicker from "expo-image-picker";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";
import type { Team } from "@/lib/types";

export default function ProfileScreen() {
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const user = session?.user;

  // Profile state
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Team edit state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamImage, setEditTeamImage] = useState<string | null>(null);
  const [uploadingTeamImage, setUploadingTeamImage] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!user,
  });

  type NotifPrefs = { notifMessages: boolean; notifTaskAssigned: boolean; notifTaskDue: boolean };

  const { data: notifPrefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotifPrefs>("/api/notification-preferences"),
    enabled: !!user,
  });

  const notifMutation = useMutation({
    mutationFn: (patch: Partial<NotifPrefs>) => api.patch<NotifPrefs>("/api/notification-preferences", patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["notification-preferences"] });
      const prev = queryClient.getQueryData<NotifPrefs>(["notification-preferences"]);
      queryClient.setQueryData<NotifPrefs>(["notification-preferences"], (old) => old ? { ...old, ...patch } : old);
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["notification-preferences"], ctx.prev);
    },
  });

  // ── Profile mutations ──────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");
      setLocalImage(file.uri);
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType);
      await api.patch("/api/profile", { image: uploaded.url });
      return uploaded.url;
    },
    onSuccess: () => invalidateSession(),
    onError: (err: Error) => {
      setLocalImage(null);
      if (err.message !== "cancelled") toast({ title: "Could not update photo", preset: "error" });
    },
  });

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.patch("/api/profile", { name }),
    onSuccess: async () => { await invalidateSession(); setEditingName(false); },
  });

  // ── Team mutations ─────────────────────────────────────────────
  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; image?: string | null } }) =>
      api.patch<Team>(`/api/teams/${id}`, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      closeEditModal();
      toast({ title: "Team updated", preset: "done" });
    },
    onError: () => toast({ title: "Failed to update team", preset: "error" }),
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${id}`),
    onSuccess: async () => {
      const freshTeams = await queryClient.fetchQuery({
        queryKey: ["teams"],
        queryFn: () => api.get<Team[]>("/api/teams"),
      });
      closeEditModal();
      const remaining = freshTeams.filter((t) => t.id !== editingTeam?.id);
      if (remaining.length > 0) {
        setActiveTeamId(remaining[0].id);
      } else {
        setActiveTeamId(null);
        router.replace("/onboarding");
      }
    },
    onError: () => toast({ title: "Failed to delete team", preset: "error" }),
  });

  // ── Handlers ───────────────────────────────────────────────────
  const handlePhotoPress = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "Choose from library", "Take photo"], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) uploadMutation.mutate("library");
          if (index === 2) uploadMutation.mutate("camera");
        }
      );
    } else {
      uploadMutation.mutate("library");
    }
  };

  const handleSaveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user?.name) { setEditingName(false); return; }
    nameMutation.mutate(trimmed);
  };

  const openEditModal = (team: Team) => {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setEditTeamImage(team.image ?? null);
    setConfirmingDelete(false);
    setDeleteConfirmText("");
  };

  const closeEditModal = () => {
    setEditingTeam(null);
    setEditTeamName("");
    setEditTeamImage(null);
    setConfirmingDelete(false);
    setDeleteConfirmText("");
  };

  const pickTeamPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingTeamImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg");
      setEditTeamImage(uploaded.url);
    } catch {
      toast({ title: "Failed to upload photo", preset: "error" });
    } finally {
      setUploadingTeamImage(false);
    }
  };

  const handleSaveTeam = () => {
    if (!editingTeam || !editTeamName.trim()) return;
    updateTeamMutation.mutate({ id: editingTeam.id, data: { name: editTeamName.trim(), image: editTeamImage } });
  };

  const handleDeleteTeam = () => {
    if (!editingTeam || deleteConfirmText !== editingTeam.name) return;
    deleteTeamMutation.mutate(editingTeam.id);
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    await invalidateSession();
    queryClient.clear();
    setActiveTeamId(null);
  };

  const avatarUri = localImage ?? user?.image ?? null;

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]} testID="profile-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-lg font-bold">Profile</Text>
          <View style={{ width: 22 }} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Avatar + name card */}
        <View className="mx-4 mt-5 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="items-center pt-8 pb-6 px-4">
            {/* Avatar */}
            <TouchableOpacity
              onPress={handlePhotoPress}
              disabled={uploadMutation.isPending}
              className="mb-4"
              testID="avatar-upload-button"
            >
              <View className="w-24 h-24 rounded-full overflow-hidden bg-indigo-100 items-center justify-center">
                {uploadMutation.isPending ? (
                  <ActivityIndicator color="#4361EE" testID="upload-loading-indicator" />
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                ) : (
                  <Text className="text-indigo-600 text-4xl font-bold">
                    {user?.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-indigo-600 items-center justify-center border-2 border-white">
                <Camera size={13} color="white" />
              </View>
            </TouchableOpacity>

            {/* Name */}
            {editingName ? (
              <View className="flex-row items-center border-b-2 border-indigo-500 mb-1" style={{ gap: 8 }}>
                <TextInput
                  value={nameValue}
                  onChangeText={setNameValue}
                  autoFocus
                  className="text-xl font-bold text-slate-900 dark:text-white text-center"
                  style={{ minWidth: 120 }}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  testID="name-input"
                />
                {nameMutation.isPending ? (
                  <ActivityIndicator size="small" color="#4361EE" />
                ) : (
                  <>
                    <TouchableOpacity onPress={handleSaveName} testID="save-name-button">
                      <Check size={18} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(user?.name ?? ""); }} testID="cancel-name-button">
                      <X size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : (
              <TouchableOpacity
                className="flex-row items-center mb-1"
                style={{ gap: 6 }}
                onPress={() => { setNameValue(user?.name ?? ""); setEditingName(true); }}
                testID="edit-name-button"
              >
                <Text className="text-xl font-bold text-slate-900 dark:text-white">{user?.name}</Text>
                <Pencil size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}

            <Text className="text-sm text-slate-400">{user?.email}</Text>
          </View>
        </View>

        {/* Teams */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">My Teams</Text>
            <TouchableOpacity
              className="flex-row items-center"
              style={{ gap: 4 }}
              onPress={() => router.push("/onboarding")}
              testID="create-join-team-button"
            >
              <Plus size={14} color="#4361EE" />
              <Text className="text-xs font-semibold text-indigo-600">Add team</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
            style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {teamsLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : teams.length === 0 ? (
              <View className="py-8 items-center px-4">
                <Text className="text-slate-400 text-sm mt-2 text-center">You're not part of any teams yet</Text>
              </View>
            ) : (
              teams.map((team, index) => {
                const isActive = team.id === activeTeamId;
                const isOwner = (team as Team & { role?: string }).role === "owner";
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => { setActiveTeamId(team.id); router.back(); }}
                    className="flex-row items-center px-4 py-3.5"
                    style={index < teams.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" } : undefined}
                    testID={`team-row-${team.id}`}
                  >
                    <View className="w-10 h-10 rounded-xl overflow-hidden bg-indigo-100 items-center justify-center mr-3">
                      {team.image ? (
                        <Image source={{ uri: team.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                      ) : (
                        <Text className="text-indigo-600 text-base font-bold">{team.name?.[0]?.toUpperCase() ?? "?"}</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="font-semibold text-slate-900 dark:text-white">{team.name}</Text>
                      <Text className="text-xs text-slate-400 capitalize">{(team as Team & { role?: string }).role ?? "member"}</Text>
                    </View>
                    {isActive ? (
                      <View className="w-2 h-2 rounded-full bg-indigo-500 mr-3" />
                    ) : null}
                    {isOwner ? (
                      <TouchableOpacity
                        onPress={() => openEditModal(team)}
                        className="w-8 h-8 rounded-full items-center justify-center"
                        style={{ backgroundColor: "#4361EE12" }}
                        testID={`edit-team-${team.id}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Pencil size={14} color="#4361EE" />
                      </TouchableOpacity>
                    ) : (
                      <ChevronRight size={16} color="#CBD5E1" />
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        {/* Notifications */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
            <Bell size={13} color="#94A3B8" />
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</Text>
          </View>
          <View className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
            style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {[
              { key: "notifMessages" as const, label: "New messages", description: "Team and direct messages" },
              { key: "notifTaskAssigned" as const, label: "Task assigned", description: "When a task is assigned to you" },
              { key: "notifTaskDue" as const, label: "Task due reminders", description: "Reminders for upcoming due dates" },
            ].map((item, index, arr) => (
              <View
                key={item.key}
                className="flex-row items-center px-4 py-3.5"
                style={index < arr.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" } : undefined}
              >
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</Text>
                  <Text className="text-xs text-slate-400 mt-0.5">{item.description}</Text>
                </View>
                <Switch
                  value={notifPrefs?.[item.key] ?? true}
                  onValueChange={(val) => notifMutation.mutate({ [item.key]: val })}
                  trackColor={{ false: "#E2E8F0", true: "#6B8EF6" }}
                  thumbColor="white"
                  testID={`notif-toggle-${item.key}`}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Sign out */}
        {showSignOutConfirm ? (
          <View className="mx-4 mt-5 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden p-4"
            style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <Text className="text-sm font-semibold text-slate-700 dark:text-white text-center mb-4">Sign out of your account?</Text>
            <View className="flex-row" style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowSignOutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 items-center"
              >
                <Text className="font-semibold text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSignOut}
                className="flex-1 py-2.5 rounded-xl bg-red-500 items-center"
                testID="confirm-sign-out-button"
              >
                <Text className="font-semibold text-white">Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="mx-4 mt-5 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
            style={{ shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <TouchableOpacity
              className="flex-row items-center px-4 py-4"
              onPress={() => setShowSignOutConfirm(true)}
              testID="sign-out-button"
            >
              <LogOut size={20} color="#EF4444" />
              <Text className="flex-1 ml-3 text-red-500 font-medium">Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Team edit / delete modal */}
      <Modal visible={!!editingTeam} transparent animationType="slide" onRequestClose={closeEditModal}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={closeEditModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-white dark:bg-slate-800 rounded-t-3xl px-4 pt-4 pb-10">

                {!confirmingDelete ? (
                  <>
                    <View className="flex-row items-center justify-between mb-6">
                      <Text className="text-lg font-bold text-slate-900 dark:text-white">Edit Team</Text>
                      <TouchableOpacity onPress={closeEditModal} testID="close-edit-modal">
                        <X size={20} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>

                    {/* Team photo */}
                    <View className="items-center mb-6">
                      <TouchableOpacity onPress={pickTeamPhoto} disabled={uploadingTeamImage} testID="pick-team-photo">
                        <View className="w-24 h-24 rounded-full bg-indigo-100 items-center justify-center overflow-hidden">
                          {uploadingTeamImage ? (
                            <ActivityIndicator color="#4361EE" />
                          ) : editTeamImage ? (
                            <Image source={{ uri: editTeamImage }} style={{ width: 96, height: 96 }} resizeMode="cover" />
                          ) : (
                            <Text className="text-indigo-600 font-bold text-3xl">{editTeamName?.[0]?.toUpperCase() ?? "T"}</Text>
                          )}
                        </View>
                        <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 items-center justify-center"
                          style={{ shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
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
                        value={editTeamName}
                        onChangeText={setEditTeamName}
                        placeholder="Enter team name"
                        placeholderTextColor="#94A3B8"
                        testID="team-name-input"
                        returnKeyType="done"
                      />
                    </View>

                    <TouchableOpacity
                      onPress={handleSaveTeam}
                      disabled={updateTeamMutation.isPending || !editTeamName.trim()}
                      className="rounded-2xl py-4 items-center mb-3"
                      style={{ backgroundColor: editTeamName.trim() ? "#4361EE" : "#CBD5E1" }}
                      testID="save-team-button"
                    >
                      {updateTeamMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-bold text-base">Save Changes</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setConfirmingDelete(true)}
                      className="rounded-2xl py-4 items-center border border-red-200"
                      testID="delete-team-button"
                    >
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        <Trash2 size={16} color="#EF4444" />
                        <Text className="text-red-500 font-semibold text-base">Delete Team</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View className="flex-row items-center justify-between mb-4">
                      <Text className="text-lg font-bold text-slate-900 dark:text-white">Delete Team?</Text>
                      <TouchableOpacity onPress={() => { setConfirmingDelete(false); setDeleteConfirmText(""); }} testID="back-from-delete">
                        <X size={20} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      This will permanently delete{" "}
                      <Text className="font-semibold text-slate-700 dark:text-slate-200">{editingTeam?.name}</Text>
                      {" "}and all its tasks and messages. Members will keep their accounts.
                    </Text>
                    <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Type <Text className="text-slate-800 dark:text-slate-200">{editingTeam?.name}</Text> to confirm
                    </Text>
                    <TextInput
                      className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base mb-4 border border-slate-200 dark:border-slate-600"
                      value={deleteConfirmText}
                      onChangeText={setDeleteConfirmText}
                      placeholder={editingTeam?.name ?? ""}
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="delete-confirm-input"
                    />
                    <TouchableOpacity
                      onPress={handleDeleteTeam}
                      disabled={deleteTeamMutation.isPending || deleteConfirmText !== editingTeam?.name}
                      className="rounded-2xl py-4 items-center mb-3"
                      style={{ backgroundColor: deleteConfirmText === editingTeam?.name ? "#EF4444" : "#CBD5E1" }}
                      testID="confirm-delete-team"
                    >
                      {deleteTeamMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-bold text-base">Delete Forever</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setConfirmingDelete(false); setDeleteConfirmText(""); }}
                      className="rounded-2xl py-4 items-center bg-slate-100 dark:bg-slate-700"
                      testID="cancel-delete-team"
                    >
                      <Text className="text-slate-700 dark:text-slate-200 font-semibold text-base">Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
