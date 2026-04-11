import React, { useState, useEffect } from "react";
import { Audio } from "expo-av";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ImageBackground,
  ActionSheetIOS,
  Platform,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Switch,
  Share,
  RefreshControl,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, Camera, LogOut, Pencil, X, Plus, Trash2, Bell, Check, LogOut as LeaveIcon, Crown, Copy, Volume2, ChevronRight, BarChart2 } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession, useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import * as ImagePicker from "expo-image-picker";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";
import type { Team } from "@/lib/types";

const DEMO_EMAIL = "demo@alenio.app";

const TONES = [
  // System
  { id: "none",        label: "None",          url: null,   section: "system" },
  { id: "system",      label: "System Default", url: null,   section: "system" },
  // Custom
  { id: "bell",        label: "Bell",           url: "https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3", section: "custom" },
  { id: "tritone",     label: "Tri-tone",       url: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3", section: "custom" },
  { id: "chime",       label: "Chime",          url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", section: "custom" },
  { id: "glass",       label: "Glass",          url: "https://assets.mixkit.co/active_storage/sfx/2308/2308-preview.mp3", section: "custom" },
  { id: "aurora",      label: "Aurora",         url: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3", section: "custom" },
  { id: "chord",       label: "Chord",          url: "https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3", section: "custom" },
  { id: "circles",     label: "Circles",        url: "https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3", section: "custom" },
  { id: "complete",    label: "Complete",       url: "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3", section: "custom" },
  { id: "note",        label: "Note",           url: "https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3", section: "custom" },
  { id: "popcorn",     label: "Popcorn",        url: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3", section: "custom" },
  { id: "pulse",       label: "Pulse",          url: "https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3", section: "custom" },
  { id: "synth",       label: "Synth",          url: "https://assets.mixkit.co/active_storage/sfx/2574/2574-preview.mp3", section: "custom" },
  { id: "ding",        label: "Ding",           url: "https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3", section: "custom" },
  { id: "achievement", label: "Achievement",    url: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3", section: "custom" },
  { id: "beep",        label: "Beep",           url: "https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3", section: "custom" },
  { id: "quickwin",    label: "Quick Win",      url: "https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3", section: "custom" },
  { id: "digital",     label: "Digital",        url: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3", section: "custom" },
  { id: "pop",         label: "Pop",            url: "https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3", section: "custom" },
  { id: "clarity",     label: "Clarity",        url: "https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3", section: "custom" },
  { id: "alert",       label: "Alert",          url: "https://assets.mixkit.co/active_storage/sfx/2575/2575-preview.mp3", section: "custom" },
  { id: "softbell",    label: "Soft Bell",      url: "https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3", section: "custom" },
  { id: "cheer",       label: "Cheer",          url: "https://assets.mixkit.co/active_storage/sfx/2867/2867-preview.mp3", section: "custom" },
];

export { TONES };
export const MSG_TONE_KEY = "msg_tone";
export const DM_TONE_KEY  = "dm_tone";

async function playTonePreview(url: string | null) {
  if (!url) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, volume: 1 });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
    });
  } catch {}
}

type JoinRequestItem = {
  id: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string; email: string; image: string | null };
};

// Glass card component using BlurView
function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <BlurView
      intensity={60}
      tint="light"
      style={[
        {
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.6)",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        },
        style,
      ]}
    >
      <View style={{ backgroundColor: "rgba(255,255,255,0.45)" }}>
        {children}
      </View>
    </BlurView>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const user = session?.user;
  const isDemo = user?.email === DEMO_EMAIL;

  const overlayColor = "rgba(240,242,255,0.85)";
  const nameColor = "#1E1B4B";
  const emailColor = "#4361EE";

  // Profile state
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Delete account state
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2 | 3>(0);
  const [deletePassword, setDeletePassword] = useState<string>("");
  const [deletePasswordVisible, setDeletePasswordVisible] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDeleteModal = () => {
    setDeleteStep(0);
    setDeletePassword("");
    setDeleteError(null);
    setDeletePasswordVisible(false);
  };

  // Tone state
  const [msgToneId, setMsgToneId] = useState<string>("synth");
  const [dmToneId,  setDmToneId]  = useState<string>("synth");
  const [showTonePicker, setShowTonePicker] = useState<"msg" | "dm" | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(MSG_TONE_KEY).then(v => { if (v) setMsgToneId(v); });
    AsyncStorage.getItem(DM_TONE_KEY).then(v  => { if (v) setDmToneId(v);  });
  }, []);

  // Team edit state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamImage, setEditTeamImage] = useState<string | null>(null);
  const [uploadingTeamImage, setUploadingTeamImage] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [leavingTeam, setLeavingTeam] = useState<Team | null>(null);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!user,
  });

  type NotifPrefs = { notifMessages: boolean; notifTaskAssigned: boolean; notifTaskDue: boolean; notifMeetings: boolean };

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

  // Join requests for the team being edited (owner only)
  const { data: joinRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["join-requests", editingTeam?.id],
    queryFn: () => api.get<JoinRequestItem[]>(`/api/teams/${editingTeam!.id}/join-requests`),
    enabled: !!editingTeam && ["owner", "team_leader"].includes((editingTeam as Team & { role?: string }).role ?? ""),
  });

  // Fetch join request counts for all owned teams (for badges)
  const ownedTeamIds = teams
    .filter((t) => ["owner", "team_leader"].includes((t as Team & { role?: string }).role ?? ""))
    .map((t) => t.id);

  const joinRequestCounts = useQueries({
    queries: ownedTeamIds.map((id) => ({
      queryKey: ["join-requests", id],
      queryFn: () => api.get<JoinRequestItem[]>(`/api/teams/${id}/join-requests`),
      enabled: ownedTeamIds.length > 0,
    })),
  });

  const pendingCountMap = Object.fromEntries(
    ownedTeamIds.map((id, i) => [id, joinRequestCounts[i]?.data?.length ?? 0])
  );

  // Approve / reject mutations
  const approveMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", editingTeam?.id] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", editingTeam?.id] });
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

  const leaveTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/api/teams/${teamId}/leave`),
    onSuccess: async () => {
      const freshTeams = await queryClient.fetchQuery({
        queryKey: ["teams"],
        queryFn: () => api.get<Team[]>("/api/teams"),
      });
      setLeavingTeam(null);
      const remaining = freshTeams.filter((t) => t.id !== leavingTeam?.id);
      if (remaining.length > 0) {
        setActiveTeamId(remaining[0].id);
      } else {
        setActiveTeamId(null);
        router.replace("/onboarding");
      }
      toast({ title: "Left team", preset: "done" });
    },
    onError: () => toast({ title: "Failed to leave team", preset: "error" }),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Cookie: authClient.getCookie() },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to delete account");
      return json.data;
    },
    onSuccess: async () => {
      closeDeleteModal();
      await authClient.signOut();
      await invalidateSession();
      queryClient.clear();
      setActiveTeamId(null);
      router.replace("/(auth)/sign-in" as never);
    },
    onError: (err: Error) => {
      setDeleteError(err.message === "Incorrect password" ? "Incorrect password. Please try again." : err.message);
      setDeleteStep(2);
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
      uploadMutation.mutate("library");
    }
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

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
    await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    await queryClient.invalidateQueries({ queryKey: ["join-requests", editingTeam?.id] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView className="flex-1" edges={["top"]} testID="profile-screen">
      <ImageBackground
        source={require("@/assets/brand-bg.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: overlayColor }}>
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ flex: 1, color: "white", fontSize: 18, fontWeight: "700" }}>Profile</Text>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 88 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}>
        {/* Avatar + name */}
        <View className="items-center pt-8 pb-6 px-4">
          {/* Avatar */}
          <TouchableOpacity
            onPress={handlePhotoPress}
            disabled={uploadMutation.isPending || isDemo}
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
            {!isDemo ? (
              <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-indigo-600 items-center justify-center border-2 border-white">
                <Camera size={13} color="white" />
              </View>
            ) : null}
          </TouchableOpacity>

          {/* Name */}
          <Text style={{ fontSize: 20, fontWeight: "700", color: nameColor, marginBottom: 4 }}>{user?.name}</Text>

          <Text style={{ fontSize: 14, color: emailColor }}>{user?.email}</Text>
        </View>

        {/* Teams */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">My Teams</Text>
            {!isDemo ? (
              <TouchableOpacity
                className="flex-row items-center"
                style={{ gap: 4 }}
                onPress={() => router.push("/onboarding")}
                testID="create-join-team-button"
              >
                <Plus size={14} color="#4361EE" />
                <Text className="text-xs font-semibold text-indigo-600">Add team</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <GlassCard>
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
                const isOwner = ["owner", "team_leader"].includes((team as Team & { role?: string }).role ?? "");
                const pendingCount = pendingCountMap[team.id] ?? 0;
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => { setActiveTeamId(team.id); router.replace("/(app)/team"); }}
                    className="flex-row items-center px-4 py-3.5"
                    style={index < teams.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.8)" } : undefined}
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
                      <Text className="text-xs text-slate-400">
                        {(team as Team & { role?: string }).role === "owner" ? "Owner" : (team as Team & { role?: string }).role === "team_leader" ? "Team Leader" : (team as Team & { role?: string }).role ?? "member"}
                      </Text>
                      {team.inviteCode && !isActive ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE", letterSpacing: 1.5 }}>{team.inviteCode}</Text>
                          <TouchableOpacity
                            onPress={async () => { await Clipboard.setStringAsync(team.inviteCode); }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            testID={`copy-code-${team.id}`}
                          >
                            <Copy size={12} color="#4361EE" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => Share.share({ message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}` })}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            testID={`share-code-${team.id}`}
                          >
                            <Text style={{ fontSize: 10, color: "#4361EE", fontWeight: "600" }}>Share</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                    {isActive ? (
                      <View className="w-2 h-2 rounded-full bg-indigo-500 mr-3" />
                    ) : isOwner && !isDemo ? (
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        {pendingCount > 0 ? (
                          <View className="w-5 h-5 rounded-full bg-red-500 items-center justify-center">
                            <Text style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>{pendingCount}</Text>
                          </View>
                        ) : null}
                        <TouchableOpacity
                          onPress={() => openEditModal(team)}
                          className="w-8 h-8 rounded-full items-center justify-center"
                          style={{ backgroundColor: "#4361EE12" }}
                          testID={`edit-team-${team.id}`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Pencil size={14} color="#4361EE" />
                        </TouchableOpacity>
                      </View>
                    ) : !isOwner && !isDemo ? (
                      <TouchableOpacity
                        onPress={() => setLeavingTeam(team)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        testID={`leave-team-${team.id}`}
                      >
                        <LeaveIcon size={16} color="#EF4444" />
                      </TouchableOpacity>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </GlassCard>
        </View>

        {/* Notifications */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
            <Bell size={13} color="#94A3B8" />
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notifications</Text>
          </View>
          <GlassCard>
            {[
              { key: "notifMessages" as const, label: "New messages", description: "Team and direct messages" },
              { key: "notifTaskAssigned" as const, label: "Task assigned", description: "When a task is assigned to you" },
              { key: "notifTaskDue" as const, label: "Task due reminders", description: "Reminders for upcoming due dates" },
              { key: "notifMeetings" as const, label: "Meeting reminders", description: "Alerts before video meetings" },
            ].map((item, index, arr) => (
              <View
                key={item.key}
                className="flex-row items-center px-4 py-3.5"
                style={index < arr.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.8)" } : undefined}
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
            {/* Tone rows */}
            <View style={{ borderTopWidth: 1, borderTopColor: "rgba(241,245,249,0.8)" }}>
              <Pressable
                onPress={() => setShowTonePicker("msg")}
                className="flex-row items-center px-4 py-3.5"
                style={{ borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.8)" }}
                testID="msg-tone-row"
              >
                <Volume2 size={18} color="#4361EE" style={{ marginRight: 10 }} />
                <Text className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">Message Tone</Text>
                <Text className="text-sm text-slate-400 mr-1">
                  {TONES.find(t => t.id === msgToneId)?.label ?? "Default"}
                </Text>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
              <Pressable
                onPress={() => setShowTonePicker("dm")}
                className="flex-row items-center px-4 py-3.5"
                testID="dm-tone-row"
              >
                <Volume2 size={18} color="#4361EE" style={{ marginRight: 10 }} />
                <Text className="flex-1 text-sm font-semibold text-slate-900 dark:text-white">DM Tone</Text>
                <Text className="text-sm text-slate-400 mr-1">
                  {TONES.find(t => t.id === dmToneId)?.label ?? "Default"}
                </Text>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
            </View>
          </GlassCard>
        </View>

        {/* Subscription — only visible to Team Leaders */}
        {teams.some((t) => (t as Team & { role?: string }).role === "owner") ? (
        <View className="mx-4 mt-5">
          <View className="flex-row items-center mb-3" style={{ gap: 6 }}>
            <Crown size={13} color="#94A3B8" />
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan</Text>
          </View>
          <GlassCard>
            <TouchableOpacity
              className="flex-row items-center px-4 py-4"
              onPress={() => router.push("/subscription")}
              testID="subscription-row"
            >
              <View className="w-8 h-8 rounded-xl bg-indigo-100 items-center justify-center mr-3">
                <Crown size={16} color="#4361EE" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900 dark:text-white">Subscription</Text>
                <Text className="text-xs text-slate-400 mt-0.5">Manage your plan</Text>
              </View>
              <Text className="text-slate-300 text-base">›</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
        ) : null}

        {/* Legal / About */}
        <View className="mx-4 mt-5">
          <GlassCard>
            <TouchableOpacity
              className="flex-row items-center px-4 py-4 border-b border-slate-100/60"
              onPress={() => router.push("/privacy-policy")}
              testID="privacy-policy-link"
            >
              <Text className="flex-1 text-slate-700 font-medium">Privacy Policy</Text>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-row items-center px-4 py-4"
              onPress={() => router.push("/terms-of-service")}
              testID="terms-of-service-link"
            >
              <Text className="flex-1 text-slate-700 font-medium">Terms of Service</Text>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>
          </GlassCard>
        </View>

        {/* Sign out */}
        {showSignOutConfirm ? (
          <View className="mx-4 mt-5">
            <GlassCard>
              <View className="p-4">
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
            </GlassCard>
          </View>
        ) : (
          <View className="mx-4 mt-5">
            <GlassCard>
              <TouchableOpacity
                className="flex-row items-center px-4 py-4"
                onPress={() => setShowSignOutConfirm(true)}
                testID="sign-out-button"
              >
                <LogOut size={20} color="#EF4444" />
                <Text className="flex-1 ml-3 text-red-500 font-medium">Sign out</Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        )}

        {/* Delete Account */}
        {!isDemo && (
          <View className="mx-4 mt-3 mb-6">
            <TouchableOpacity
              onPress={() => setDeleteStep(1)}
              className="py-3 items-center"
              testID="delete-account-button"
            >
              <Text className="text-sm text-slate-400">Delete Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Tone picker modal */}
      <Modal visible={!!showTonePicker} transparent animationType="slide" onRequestClose={() => setShowTonePicker(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setShowTonePicker(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={70}
              tint="light"
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                overflow: "hidden",
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: "rgba(255,255,255,0.6)",
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.85)",
                  paddingHorizontal: 24,
                  paddingTop: 24,
                  paddingBottom: insets.bottom + 24,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>
                    {showTonePicker === "msg" ? "Message Tone" : "DM Tone"}
                  </Text>
                  <Pressable onPress={() => setShowTonePicker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#94A3B8" />
                  </Pressable>
                </View>
                <Text style={{ fontSize: 13, color: "#94A3B8", marginBottom: 16 }}>Tap to preview</Text>
                <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                  {/* System section */}
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>System</Text>
                  {TONES.filter(t => t.section === "system").map((tone) => {
                    const selected = showTonePicker === "msg" ? tone.id === msgToneId : tone.id === dmToneId;
                    return (
                      <Pressable
                        key={tone.id}
                        testID={`tone-option-${tone.id}`}
                        onPress={async () => {
                          if (tone.id !== "system") await playTonePreview(tone.url);
                          if (showTonePicker === "msg") {
                            setMsgToneId(tone.id);
                            AsyncStorage.setItem(MSG_TONE_KEY, tone.id);
                          } else {
                            setDmToneId(tone.id);
                            AsyncStorage.setItem(DM_TONE_KEY, tone.id);
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.9)" }}
                      >
                        <Text style={{ fontSize: 20, marginRight: 6, color: selected ? "#4361EE" : "#CBD5E1" }}>{selected ? "●" : "○"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: selected ? "600" : "400", color: selected ? "#4361EE" : "#1E293B" }}>{tone.label}</Text>
                          {tone.id === "system" ? (
                            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Uses your device's default notification sound</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  {/* Custom section */}
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 16, marginBottom: 4 }}>Custom Tones</Text>
                  {TONES.filter(t => t.section === "custom").map((tone) => {
                    const selected = showTonePicker === "msg" ? tone.id === msgToneId : tone.id === dmToneId;
                    return (
                      <Pressable
                        key={tone.id}
                        testID={`tone-option-${tone.id}`}
                        onPress={async () => {
                          await playTonePreview(tone.url);
                          if (showTonePicker === "msg") {
                            setMsgToneId(tone.id);
                            AsyncStorage.setItem(MSG_TONE_KEY, tone.id);
                          } else {
                            setDmToneId(tone.id);
                            AsyncStorage.setItem(DM_TONE_KEY, tone.id);
                          }
                        }}
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(241,245,249,0.9)" }}
                      >
                        <Text style={{ fontSize: 20, marginRight: 6, color: selected ? "#4361EE" : "#CBD5E1" }}>{selected ? "●" : "○"}</Text>
                        <Text style={{ fontSize: 15, fontWeight: selected ? "600" : "400", color: selected ? "#4361EE" : "#1E293B", flex: 1 }}>{tone.label}</Text>
                        <Text style={{ fontSize: 12, color: "#CBD5E1" }}>▶</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

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

                    {/* Pending join requests section */}
                    {joinRequests.length > 0 ? (
                      <View className="mb-6">
                        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                          Pending Requests ({joinRequests.length})
                        </Text>
                        {joinRequests.map((req) => (
                          <View key={req.id} className="flex-row items-center bg-slate-50 dark:bg-slate-700 rounded-xl px-3 py-2.5 mb-2">
                            <View className="w-9 h-9 rounded-full bg-indigo-100 items-center justify-center mr-3 overflow-hidden">
                              {req.user.image ? (
                                <Image source={{ uri: req.user.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
                              ) : (
                                <Text className="text-indigo-600 font-bold text-sm">{req.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="text-sm font-semibold text-slate-900 dark:text-white">{req.user.name}</Text>
                              <Text className="text-xs text-slate-400">{req.user.email}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => rejectMutation.mutate({ teamId: editingTeam!.id, requestId: req.id })}
                              className="w-7 h-7 rounded-full bg-red-100 items-center justify-center mr-1.5"
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              testID={`reject-request-${req.id}`}
                            >
                              <X size={13} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => approveMutation.mutate({ teamId: editingTeam!.id, requestId: req.id })}
                              className="w-7 h-7 rounded-full bg-green-100 items-center justify-center"
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              testID={`approve-request-${req.id}`}
                            >
                              <Check size={13} color="#22C55E" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null}

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

      {/* Leave team confirmation modal */}
      <Modal visible={!!leavingTeam} transparent animationType="fade" onRequestClose={() => setLeavingTeam(null)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-6" onPress={() => setLeavingTeam(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full">
              <Text className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Leave Team?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
                You'll lose access to{" "}
                <Text className="font-semibold text-slate-700 dark:text-slate-200">{leavingTeam?.name}</Text>
                {" "}and all its tasks. The Team Leader can invite you back.
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setLeavingTeam(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 items-center"
                  testID="cancel-leave-team"
                >
                  <Text className="font-semibold text-slate-600 dark:text-slate-300">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => leavingTeam && leaveTeamMutation.mutate(leavingTeam.id)}
                  disabled={leaveTeamMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-red-500 items-center"
                  testID="confirm-leave-team"
                >
                  {leaveTeamMutation.isPending ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="font-semibold text-white">Leave</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={deleteStep > 0} transparent animationType="slide" onRequestClose={closeDeleteModal}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={closeDeleteModal}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-white dark:bg-slate-800 rounded-t-3xl px-5 pt-6 pb-10">
                {/* Step 1: Impact */}
                {deleteStep === 1 && (
                  <>
                    <View className="flex-row items-center justify-between mb-5">
                      <Text className="text-xl font-bold text-slate-900 dark:text-white">Delete Account?</Text>
                      <TouchableOpacity onPress={closeDeleteModal}>
                        <X size={22} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <View className="bg-red-50 rounded-2xl p-4 mb-5" style={{ gap: 12 }}>
                      {[
                        "You'll be removed from all your teams",
                        "All your messages will be deleted",
                        "Your task history will be removed",
                        "This action cannot be undone",
                      ].map((item) => (
                        <View key={item} className="flex-row items-start" style={{ gap: 10 }}>
                          <X size={16} color="#EF4444" style={{ marginTop: 1 }} />
                          <Text className="flex-1 text-sm text-slate-700">{item}</Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      onPress={() => setDeleteStep(2)}
                      className="rounded-2xl py-4 items-center mb-3 bg-slate-100"
                      testID="delete-continue-step1"
                    >
                      <Text className="font-semibold text-slate-700 text-base">Continue</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={closeDeleteModal} className="py-3 items-center">
                      <Text className="text-slate-400 font-medium">Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
                {/* Step 2: Password */}
                {deleteStep === 2 && (
                  <>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-xl font-bold text-slate-900 dark:text-white">Confirm identity</Text>
                      <TouchableOpacity onPress={closeDeleteModal}>
                        <X size={22} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <Text className="text-sm text-slate-500 mb-5">Enter your password to continue</Text>
                    <View className="flex-row items-center bg-slate-50 rounded-xl px-4 border border-slate-200 mb-2">
                      <TextInput
                        className="flex-1 py-3 text-base text-slate-900"
                        placeholder="Password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!deletePasswordVisible}
                        value={deletePassword}
                        onChangeText={(t) => { setDeletePassword(t); setDeleteError(null); }}
                        autoCapitalize="none"
                        testID="delete-password-input"
                      />
                      <TouchableOpacity onPress={() => setDeletePasswordVisible((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text className="text-slate-400 text-sm">{deletePasswordVisible ? "Hide" : "Show"}</Text>
                      </TouchableOpacity>
                    </View>
                    {deleteError ? <Text className="text-red-500 text-xs mb-3 ml-1">{deleteError}</Text> : <View className="mb-3" />}
                    <TouchableOpacity
                      onPress={() => {
                        if (!deletePassword.trim()) return;
                        setDeleteStep(3);
                      }}
                      disabled={!deletePassword.trim()}
                      className="rounded-2xl py-4 items-center mb-3"
                      style={{ backgroundColor: deletePassword.trim() ? "#4361EE" : "#CBD5E1" }}
                      testID="delete-continue-step2"
                    >
                      <Text className="font-bold text-white text-base">Continue</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDeleteStep(1)} className="py-3 items-center">
                      <Text className="text-slate-400 font-medium">Back</Text>
                    </TouchableOpacity>
                  </>
                )}
                {/* Step 3: Final confirm */}
                {deleteStep === 3 && (
                  <>
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-xl font-bold text-slate-900 dark:text-white">Final step</Text>
                      <TouchableOpacity onPress={closeDeleteModal}>
                        <X size={22} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <View className="bg-red-50 rounded-2xl p-4 mb-5">
                      <Text className="text-sm text-red-700 text-center leading-5">
                        This will permanently delete your account and all associated data. There is no way to recover it.
                      </Text>
                    </View>
                    {deleteError ? <Text className="text-red-500 text-xs mb-3 text-center">{deleteError}</Text> : null}
                    <TouchableOpacity
                      onPress={() => deleteAccountMutation.mutate()}
                      disabled={deleteAccountMutation.isPending}
                      className="rounded-2xl py-4 items-center mb-3 bg-red-500"
                      testID="confirm-delete-account"
                    >
                      {deleteAccountMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="font-bold text-white text-base">Delete My Account</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={closeDeleteModal} className="py-3 items-center">
                      <Text className="text-slate-400 font-medium">Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}
