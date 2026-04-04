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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Camera, LogOut, Users, Pencil, Check, X, ChevronRight, Plus } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession, useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

export default function ProfileScreen() {
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const user = session?.user;

  const [localImage, setLocalImage] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!user,
  });

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
      if (err.message !== "cancelled") alert("Could not update your profile photo. Please try again.");
    },
  });

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.patch("/api/profile", { name }),
    onSuccess: async () => {
      await invalidateSession();
      setEditingName(false);
    },
  });

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
      // Android fallback
      uploadMutation.mutate("library");
    }
  };

  const handleSaveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user?.name) { setEditingName(false); return; }
    nameMutation.mutate(trimmed);
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
              className="mb-4 relative"
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
                <Users size={32} color="#CBD5E1" />
                <Text className="text-slate-400 text-sm mt-2 text-center">You're not part of any teams yet</Text>
              </View>
            ) : (
              teams.map((team, index) => (
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
                  <ChevronRight size={16} color="#CBD5E1" />
                </Pressable>
              ))
            )}
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
    </SafeAreaView>
  );
}
