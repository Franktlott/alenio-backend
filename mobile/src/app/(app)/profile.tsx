import React, { useState, useEffect, useCallback } from "react";
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
  RefreshControl,
  Alert,
  Linking,
} from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Camera, LogOut, Pencil, X, Trash2, Bell, Check, Crown, MessageSquare, Globe, AlertTriangle, ShieldAlert, ChevronRight, Lock, Shield } from "lucide-react-native";
import { notificationPreferencesSummary } from "@/components/NotificationPreferencesPanel";
import { COMMON_TIMEZONES, formatTimeZoneLabel, getBrowserTimeZone, resolveTimeZone } from "@/lib/timezone";
import { authClient, agentDebugLog, clearAccessToken, getAuthHeaders } from "@/lib/auth/auth-client";
import {
  SESSION_QUERY_KEY,
  markSessionSignedOut,
  useSession,
  clearMobileAuthCaches,
  refreshMeInAuthCaches,
  useMobileAuthReady,
} from "@/lib/auth/use-session";
import { clearNotifDebugLog, getNotifDebugLog, getNotifStatus, registerForPushNotificationsAsync } from "@/lib/notifications";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { readJsonSafe } from "@/lib/api/api";
import { getBackendUrl } from "@/lib/backend-url";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import * as ImagePicker from "expo-image-picker";
import { useTeamStore } from "@/lib/state/team-store";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import { toast } from "burnt";
import { ACCOUNT_HUB_TITLE } from "@/lib/plan-access-copy";
import { tabBarClearance } from "@/lib/tab-bar";
import type { Team } from "@/lib/types";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import {
  ProfileCard,
  ProfileContent,
  ProfileDivider,
  ProfileMenuRow,
  ProfileSection,
  ProfileToolbarButton,
} from "@/components/profile/ProfileEnterpriseUI";
import { ProfileWorkspaceList } from "@/components/profile/ProfileWorkspaceList";
import { OutlookCalendarCard } from "@/components/profile/OutlookCalendarCard";
import { AppTabHeader } from "@/components/AppTabHeader";
import { formatOutlookUserError } from "@/lib/outlook-calendar-errors";

type JoinRequestItem = {
  id: string;
  status: string;
  createdAt: string;
  user: { id: string; name: string; email: string; image: string | null };
};

type MyJoinRequest = {
  id: string;
  status: string;
  createdAt: string;
  team: { id: string; name: string; image: string | null };
};

type NotifPrefs = {
  isAdmin?: boolean;
  notifMessages: boolean;
  notifTaskAssigned: boolean;
  notifTaskDue: boolean;
  notifMeetings: boolean;
  notifAdminUsers?: boolean;
  notifAdminWorkspaces?: boolean;
  notifAdminBilling?: boolean;
  notifTone: string;
  hasToken: boolean;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { outlook, message } = useLocalSearchParams<{ outlook?: string; message?: string }>();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const { switchWorkspace } = useSwitchWorkspace();
  const user = session?.user;

  useEffect(() => {
    if (outlook === "connected") {
      toast({ title: "Outlook connected", preset: "done" });
      void queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      router.setParams({ outlook: undefined, message: undefined });
    } else if (outlook === "error") {
      Alert.alert("Outlook calendar", formatOutlookUserError(typeof message === "string" ? message : undefined));
      router.setParams({ outlook: undefined, message: undefined });
    }
  }, [outlook, message, queryClient]);

  const nameColor = "#0F172A";
  const emailColor = "#64748B";

  // Profile state
  const [localImage, setLocalImage] = useState<string | null>(null);
  /** URI whose load genuinely failed (not cancelled). RN may fire onError when a prior load is aborted on uri change. */
  const [avatarFailedUri, setAvatarFailedUri] = useState<string | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Delete account state
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletePassword, setDeletePassword] = useState<string>("");
  const [deletePasswordVisible, setDeletePasswordVisible] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDeleteModal = () => {
    setDeleteStep(0);
    setDeletePassword("");
    setDeleteError(null);
    setDeletePasswordVisible(false);
  };

  // Team edit state
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamImage, setEditTeamImage] = useState<string | null>(null);
  const [uploadingTeamImage, setUploadingTeamImage] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteTeamPassword, setDeleteTeamPassword] = useState("");
  const [leavingTeam, setLeavingTeam] = useState<Team | null>(null);
  const [timezoneModalOpen, setTimezoneModalOpen] = useState(false);
  const [timezoneSaving, setTimezoneSaving] = useState(false);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!user,
  });

  /** Backend profile (includes `image` from DB); auth session often omits photo URL — same source as team member avatars. */
  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; image: string | null; isAdmin?: boolean; timezone?: string | null }>("/api/me"),
    enabled: !!user,
  });

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void refreshMeInAuthCaches(queryClient);
    }, [queryClient, user])
  );

  useEffect(() => {
    if (!meProfile?.id || meProfile.timezone) return;
    const browserTz = getBrowserTimeZone();
    if (!browserTz) return;
    void api.patch("/api/profile", { timezone: browserTz }).then(() => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    });
  }, [meProfile?.id, meProfile?.timezone, queryClient]);

  const { data: notifPrefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotifPrefs>("/api/notification-preferences"),
    enabled: !!user,
  });

  const { data: deletionReadiness, isLoading: deletionReadinessLoading } = useQuery({
    queryKey: ["deletion-readiness"],
    queryFn: () =>
      api.get<{
        canDelete: boolean;
        issues: Array<{
          code: string;
          message: string;
          teamId: string;
          teamName: string;
          blocking: boolean;
        }>;
      }>("/api/user/deletion-readiness"),
    enabled: deleteStep > 0 && !!user,
    staleTime: 0,
  });

  const deleteBlockers = deletionReadiness?.issues.filter((issue) => issue.blocking) ?? [];
  const deleteWarnings = deletionReadiness?.issues.filter((issue) => !issue.blocking) ?? [];
  const canContinueDelete = deletionReadiness?.canDelete === true;

  const isOwnerOfAnyTeam = teams.some((t) => (t as Team & { role?: string }).role === "owner");
  const activeTeam = teams.find((t) => t.id === activeTeamId) as (Team & { role?: string }) | undefined;
  const canManageActiveTeam =
    !!activeTeam && ["owner", "team_leader"].includes(activeTeam.role ?? "");
  const canLeaveActiveTeam =
    !!activeTeam && !canManageActiveTeam;

  const { data: ownerTeamSubscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId && isOwnerOfAnyTeam,
  });

  // Join requests for the team being edited (owner only)
  const { data: joinRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ["join-requests", editingTeam?.id],
    queryFn: () => api.get<JoinRequestItem[]>(`/api/teams/${editingTeam!.id}/join-requests`),
    enabled: !!editingTeam && ["owner", "team_leader"].includes((editingTeam as Team & { role?: string }).role ?? ""),
  });

  // Join requests the current user has sent (waiting for approval)
  const { data: myPendingJoinRequests = [] } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<MyJoinRequest[]>("/api/join-requests/mine"),
    refetchInterval: 15000,
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

  const cancelMyJoinRequestMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
    },
    onError: (err: Error) => {
      Alert.alert("Could not withdraw request", err.message || "Something went wrong. Try again.");
    },
  });

  // ── Profile mutations ──────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");
      setLocalImage(file.uri);
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType, { purpose: "profile" });
      await api.patch("/api/profile", { image: uploaded.url });
      return uploaded.url;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setLocalImage(null);
    },
    onError: (err: Error) => {
      setLocalImage(null);
      if (err.message !== "cancelled") {
        // Native Alert shows the full server message; Burnt toasts often hide the subtitle on Android.
        Alert.alert("Could not update photo", err.message || "Something went wrong. Try again.");
      }
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
    mutationFn: ({ id, body }: { id: string; body: { confirmPhrase?: string; password?: string } }) =>
      api.delete(`/api/teams/${id}`, body),
    onSuccess: async (_data, { id }) => {
      closeEditModal();
      await applyTeamRemovedFromAccount(id, activeTeamId, setActiveTeamId, queryClient);
      toast({ title: "Workspace deleted", preset: "done" });
    },
    onError: () => toast({ title: "Failed to delete team", preset: "error" }),
  });

  const leaveTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/api/teams/${teamId}/leave`),
    onSuccess: async (_data, teamId) => {
      setLeavingTeam(null);
      await queryClient.invalidateQueries({ queryKey: ["former-members", teamId] });
      await applyTeamRemovedFromAccount(teamId, activeTeamId, setActiveTeamId, queryClient);
      toast({ title: "Left team", preset: "done" });
    },
    onError: () => toast({ title: "Failed to leave team", preset: "error" }),
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${getBackendUrl()}/api/user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
        credentials: "include",
        body: JSON.stringify({ password: deletePassword }),
      });
      const json = await readJsonSafe<{ data?: unknown; error?: { message?: string } }>(res);
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to delete account");
      return json?.data;
    },
    onSuccess: async () => {
      closeDeleteModal();
      markSessionSignedOut();
      clearAccessToken();
      await clearMobileAuthCaches(queryClient);
      await authClient.signOut();
      queryClient.clear();
      setActiveTeamId(null);
      router.replace("/welcome");
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
        },
      );
      return;
    }
    Alert.alert("Profile photo", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Choose from library", onPress: () => uploadMutation.mutate("library") },
      { text: "Take photo", onPress: () => uploadMutation.mutate("camera") },
    ]);
  };

  const openEditModal = (team: Team) => {
    setEditingTeam(team);
    setEditTeamName(team.name);
    setEditTeamImage(team.image ?? null);
    setConfirmingDelete(false);
    setDeleteTeamPassword("");
  };

  const closeEditModal = () => {
    setEditingTeam(null);
    setEditTeamName("");
    setEditTeamImage(null);
    setConfirmingDelete(false);
    setDeleteTeamPassword("");
  };

  const pickTeamPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const teamBeingEdited = editingTeam;
    if (!teamBeingEdited) return;
    setUploadingTeamImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg", {
        purpose: "team",
        teamId: teamBeingEdited.id,
      });
      setEditTeamImage(uploaded.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Failed to upload photo", message, preset: "error" });
    } finally {
      setUploadingTeamImage(false);
    }
  };

  const handleSaveTeam = () => {
    if (!editingTeam || !editTeamName.trim()) return;
    updateTeamMutation.mutate({ id: editingTeam.id, data: { name: editTeamName.trim(), image: editTeamImage } });
  };

  const deleteTeamConfirmationReady = deleteTeamPassword.trim().length > 0;

  const handleDeleteTeam = () => {
    if (!editingTeam || !deleteTeamConfirmationReady) return;
    deleteTeamMutation.mutate({ id: editingTeam.id, body: { password: deleteTeamPassword } });
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    markSessionSignedOut();
    clearAccessToken();
    await clearMobileAuthCaches(queryClient);
    try {
      await authClient.signOut();
    } catch {
      // continue cleanup even if remote sign-out call fails
    }
    clearAccessToken();
    queryClient.clear();
    setActiveTeamId(null);
    agentDebugLog("sign-out complete", { runId: "auth-simplify-v1", hypothesisId: "H15" });
    router.replace("/welcome");
  };

  const displayName = meProfile?.name ?? user?.name;
  const displayEmail = meProfile?.email ?? user?.email;
  const avatarUri = localImage ?? meProfile?.image ?? user?.image ?? null;
  const avatarInitial = displayName?.trim()?.[0]?.toUpperCase() ?? "?";
  const showAvatarImage = !!avatarUri && avatarFailedUri !== avatarUri;

  useEffect(() => {
    setAvatarFailedUri(null);
  }, [avatarUri]);

  const [pushDebugResult, setPushDebugResult] = useState<string | null>(null);
  const [pushDebugLoading, setPushDebugLoading] = useState(false);
  const [retryingPush, setRetryingPush] = useState(false);

  const handleCheckNotifStatus = async () => {
    const status = await getNotifStatus();
    setPushDebugResult(status ?? "no status returned");
  };

  const handleRetryPushRegistration = async () => {
    setRetryingPush(true);
    setPushDebugResult(null);
    try {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
        setPushDebugResult("Registered successfully!");
      } else {
        const status = await getNotifStatus();
        setPushDebugResult(status ?? "Registration failed");
      }
    } finally {
      setRetryingPush(false);
    }
  };

  const handleCheckBackendPushStatus = async () => {
    try {
      const result = await api.get<{ hasPushToken: boolean; tokenPreview: string | null }>("/api/users/push-status");
      setPushDebugResult(result.hasPushToken ? `Backend has token: ${result.tokenPreview ?? "yes"}` : "Backend has no token saved");
    } catch (err: unknown) {
      // Fallback for older backends: infer from notification-preferences response
      try {
        const prefs = await api.get<{ hasToken?: boolean; pushToken?: string | null }>("/api/notification-preferences");
        const has = prefs.hasToken === true || !!prefs.pushToken;
        setPushDebugResult(has ? "Backend has token (via notification-preferences)" : "Backend has no token (via notification-preferences)");
      } catch {
        setPushDebugResult(`Backend status failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleClearBackendPushToken = async () => {
    setPushDebugLoading(true);
    try {
      await api.patch<{ ok: true }>("/api/users/push-token", { pushToken: null });
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      setPushDebugResult("Cleared push token in backend database");
    } catch (err: unknown) {
      // Fallback for older backends (legacy endpoint now supports token=null).
      try {
        await api.post<{ ok: true }>("/api/push-token", { token: null }, { skipSignOut: true });
        await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
        setPushDebugResult("Cleared push token in backend database (legacy)");
      } catch {
        setPushDebugResult(`Clear failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setPushDebugLoading(false);
    }
  };

  const handleClearLocalDebugLog = async () => {
    await clearNotifDebugLog();
    setPushDebugResult("Cleared local push debug log");
  };

  const handleSendTestPush = async () => {
    setPushDebugLoading(true);
    try {
      // Prefer the newer /api/users/push-test endpoint; fall back to legacy.
      let result: { ok?: boolean; error?: string; token?: string } | null = null;
      try {
        result = await api.post<{ ok?: boolean; error?: string; token?: string }>("/api/users/push-test", {});
      } catch {
        result = await api.post<{ ok?: boolean; error?: string; token?: string }>("/api/push-test", {});
      }
      if (result.error) {
        setPushDebugResult(`Error: ${result.error}`);
      } else {
        setPushDebugResult(`Sent to: ${result.token ?? "unknown"}`);
      }
    } catch (err: unknown) {
      setPushDebugResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPushDebugLoading(false);
    }
  };

  const handleDirectTestPush = async () => {
    setPushDebugLoading(true);
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        const status = await getNotifStatus();
        setPushDebugResult(status ?? "Could not register token for direct test");
        return;
      }

      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: token,
          title: "Push Test",
          body: "If you see this, push is working ✅",
          sound: "default",
          priority: "high",
          data: { type: "push_debug" },
        }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ignore
      }

      if (!res.ok) {
        setPushDebugResult(`Direct push failed (HTTP ${res.status}): ${text.slice(0, 180)}`);
        return;
      }

      const ticket = json?.data ?? null;
      if (ticket?.status === "error") {
        setPushDebugResult(`Direct push rejected: ${ticket?.message ?? "error"}`);
        return;
      }

      setPushDebugResult(`Direct push sent (ticket=${ticket?.id ?? "n/a"})`);
    } catch (err: unknown) {
      setPushDebugResult(`Direct push failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPushDebugLoading(false);
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshMeInAuthCaches(queryClient);
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ["teams"] });
    await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    await queryClient.invalidateQueries({ queryKey: ["join-requests", editingTeam?.id] });
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9" }} edges={[]} testID="profile-screen">
      <AppTabHeader
        topInset={insets.top}
        testID="profile-header"
        rightAction={
          <Pressable
            onPress={() => setShowSignOutConfirm(true)}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            testID="sign-out-icon-button"
          >
            <LogOut size={20} color="rgba(255,255,255,0.85)" />
          </Pressable>
        }
      />

      <View style={{ flex: 1, minHeight: 0 }}>
        {/* Profile hero — fixed */}
        <View style={{ flexShrink: 0 }}>
          <View style={{ height: 160, overflow: "hidden" }}>
            <Image
              source={require("@/assets/profile-header.png")}
              style={{ width: "100%", height: 160 }}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(241,245,249,0.95)"]}
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 70 }}
            />
          </View>

          <View style={{ alignItems: "center", paddingBottom: 24, paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={handlePhotoPress}
              disabled={uploadMutation.isPending}
              style={{ marginTop: -64, marginBottom: 16 }}
              testID="avatar-upload-button"
            >
              <View
                className="w-32 h-32 rounded-full overflow-hidden bg-indigo-100"
                style={{ borderWidth: 3, borderColor: "#F8FAFC", position: "relative" }}
              >
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  pointerEvents="none"
                >
                  <Text className="text-indigo-600 text-4xl font-bold">{avatarInitial}</Text>
                </View>
                {showAvatarImage ? (
                  <Image
                    key={avatarUri}
                    source={{ uri: avatarUri }}
                    style={{ position: "absolute", top: 0, left: 0, width: 128, height: 128 }}
                    resizeMode="cover"
                    onError={() => setAvatarFailedUri(avatarUri)}
                    testID="profile-avatar-image"
                  />
                ) : null}
                {uploadMutation.isPending ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(255,255,255,0.55)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ActivityIndicator color="#4361EE" testID="upload-loading-indicator" />
                  </View>
                ) : null}
              </View>
              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-600 items-center justify-center border-2 border-white">
                <Camera size={15} color="white" />
              </View>
            </TouchableOpacity>

            <Text style={{ fontSize: 18, fontWeight: "700", color: nameColor, marginBottom: 2 }}>{displayName}</Text>
            <Text style={{ fontSize: 13, color: emailColor }}>{displayEmail}</Text>
          </View>
        </View>

        {/* Settings sections — only this area scrolls */}
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}
          keyboardShouldPersistTaps="handled"
        >
          <ProfileContent>
          {/* Workspaces */}
          <ProfileSection
            title="Workspaces"
            subtitle={
              teamsLoading
                ? undefined
                : teams.length > 1
                  ? canManageActiveTeam
                    ? "Tap to switch · hold to edit."
                    : "Tap your workspace to switch."
                  : canManageActiveTeam
                    ? "Press and hold to edit workspace."
                    : undefined
            }
            action={
              !teamsLoading && teams.length > 0 ? (
                <ProfileToolbarButton
                  label="Add"
                  onPress={() =>
                    router.push({
                      pathname: "/onboarding",
                      params: { intent: "add" },
                    })
                  }
                  testID="create-join-team-button"
                />
              ) : undefined
            }
          >
            <ProfileWorkspaceList
              teams={teams as (Team & { role?: string })[]}
              activeTeamId={activeTeamId}
              teamsLoading={teamsLoading}
              pendingCountMap={pendingCountMap}
              pendingJoinRequests={myPendingJoinRequests}
              cancelingRequestId={cancelMyJoinRequestMutation.isPending ? cancelMyJoinRequestMutation.variables ?? null : null}
              onCancelPendingRequest={(requestId) => cancelMyJoinRequestMutation.mutate(requestId)}
              onSelectTeam={(teamId) => void switchWorkspace(teamId)}
              onManageActive={
                canManageActiveTeam && activeTeam ? () => openEditModal(activeTeam) : undefined
              }
              onLeaveActive={
                canLeaveActiveTeam && activeTeam ? () => setLeavingTeam(activeTeam) : undefined
              }
              onAddWorkspace={() =>
                router.push({
                  pathname: "/onboarding",
                  params: { intent: "add" },
                })
              }
            />
          </ProfileSection>

          {/* Account */}
          <ProfileSection title="Account">
            <ProfileCard>
              {(meProfile?.isAdmin === true || authReady?.me?.isAdmin === true) ? (
                <>
                  <ProfileMenuRow
                    icon={Shield}
                    title="Alenio Admin"
                    subtitle="Platform stats, users, and workspaces"
                    onPress={() => {
                      void (async () => {
                        await refreshMeInAuthCaches(queryClient);
                        router.push("/(admin)/(tabs)");
                      })();
                    }}
                    testID="alenio-admin-row"
                  />
                  <ProfileDivider inset />
                </>
              ) : null}
              <ProfileMenuRow
                icon={Crown}
                title={ACCOUNT_HUB_TITLE}
                subtitle={
                  isOwnerOfAnyTeam
                    ? ownerTeamSubscription?.plan === "team"
                      ? "Team access active · Manage workplaces"
                      : "Manage workplace subscriptions"
                    : "View workplace plans"
                }
                onPress={() => router.push("/account-hub")}
                testID="account-hub-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Bell}
                title="Notifications"
                subtitle={notificationPreferencesSummary(notifPrefs)}
                onPress={() => router.push("/notifications")}
                testID="notifications-menu-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Globe}
                title="Time zone"
                subtitle={formatTimeZoneLabel(resolveTimeZone(meProfile?.timezone))}
                onPress={() => setTimezoneModalOpen(true)}
                testID="timezone-menu-row"
              />
            </ProfileCard>
          </ProfileSection>

          <ProfileSection title="Calendar sync">
            <OutlookCalendarCard />
          </ProfileSection>

        {/* Push Notifications Debug — hidden, preserved for future use */}
        {false ? (<View className="mx-4 mt-5">
          <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 ml-1">Push Notifications Debug</Text>
          <ProfileCard>
            <Pressable
              onPress={handleRetryPushRegistration}
              disabled={retryingPush}
              className="px-4 py-3.5 border-b border-slate-100/60"
              testID="retry-push-registration-button"
            >
              {retryingPush ? (
                <ActivityIndicator size="small" color="#4361EE" />
              ) : (
                <Text className="text-sm font-semibold text-indigo-600">Retry push registration</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleCheckNotifStatus}
              className="px-4 py-3.5 border-b border-slate-100/60"
              testID="check-notif-status-button"
            >
              <Text className="text-sm font-semibold text-indigo-600">Check notification status</Text>
            </Pressable>
            <Pressable
              onPress={handleCheckBackendPushStatus}
              className="px-4 py-3.5 border-b border-slate-100/60"
              testID="check-backend-push-status-button"
            >
              <Text className="text-sm font-semibold text-indigo-600">Check backend token status</Text>
            </Pressable>
            <Pressable
              onPress={handleDirectTestPush}
              disabled={pushDebugLoading}
              className="px-4 py-3.5 border-b border-slate-100/60"
              testID="send-direct-test-push-button"
            >
              {pushDebugLoading ? (
                <ActivityIndicator size="small" color="#4361EE" />
              ) : (
                <Text className="text-sm font-semibold text-indigo-600">Test push</Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleClearBackendPushToken}
              disabled={pushDebugLoading}
              className="px-4 py-3.5 border-b border-slate-100/60"
              testID="clear-backend-push-token-button"
            >
              <Text className="text-sm font-semibold text-indigo-600">Clear backend push token</Text>
            </Pressable>
            <Pressable
              onPress={handleClearLocalDebugLog}
              className="px-4 py-3.5"
              testID="clear-local-push-debug-log-button"
            >
              <Text className="text-sm font-semibold text-indigo-600">Clear local debug log</Text>
            </Pressable>
            {pushDebugResult ? (
              <View className="px-4 pb-3.5 pt-1 border-t border-slate-100/60">
                <Text className="text-xs text-slate-500" selectable testID="push-debug-result">{pushDebugResult}</Text>
              </View>
            ) : null}
          </ProfileCard>
        </View>) : null}

          {/* Support */}
          <ProfileSection title="Support">
            <ProfileCard>
              <ProfileMenuRow
                icon={MessageSquare}
                title="Send feedback"
                subtitle="Report issues or suggest improvements"
                onPress={() => router.push("/feedback")}
                testID="feedback-card"
              />
            </ProfileCard>
          </ProfileSection>

          {/* Legal */}
          <ProfileSection title="Legal & privacy">
            <ProfileCard>
              <ProfileMenuRow
                title="Privacy Policy"
                onPress={() => router.push("/privacy-policy")}
                testID="privacy-policy-link"
              />
              <ProfileDivider />
              <ProfileMenuRow
                title="Terms of Service"
                onPress={() => router.push("/terms-of-service")}
                testID="terms-of-service-link"
              />
              <ProfileDivider />
              <ProfileMenuRow
                title="Account deletion"
                subtitle="Permanently remove your account and data"
                onPress={() => setDeleteStep(1)}
                testID="account-deletion-link"
              />
            </ProfileCard>
            <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", marginTop: 10 }}>
              v{Constants.expoConfig?.version ?? "—"}
            </Text>
          </ProfileSection>

          {/* Sign out */}
          <ProfileSection title="Session">
            <ProfileCard>
              <ProfileMenuRow
                icon={LogOut}
                title="Sign out"
                subtitle="Sign in again to access your account"
                onPress={() => setShowSignOutConfirm(true)}
                testID="sign-out-button"
                destructive
                showChevron={false}
              />
            </ProfileCard>
          </ProfileSection>
        </ProfileContent>

        {/* App Info / Environment */}
        {false ? (<View className="mx-4 mt-2 mb-8 items-center">
          <View className="flex-row items-center mb-1" style={{ gap: 6 }}>
            <View
              style={{
                backgroundColor: __DEV__ ? "rgba(234, 179, 8, 0.12)" : "rgba(34, 197, 94, 0.12)",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: __DEV__ ? "rgba(234, 179, 8, 0.4)" : "rgba(34, 197, 94, 0.4)",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: __DEV__ ? "#B45309" : "#15803D",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {__DEV__ ? "Development" : "Production"}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-slate-400" numberOfLines={1} style={{ maxWidth: "90%" }}>
            {getBackendUrl()}
          </Text>
        </View>) : null}
      </ScrollView>
      </View>

      {/* Team edit / delete modal */}
      <Modal visible={!!editingTeam} transparent animationType="slide" onRequestClose={closeEditModal}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={closeEditModal}>
          <SafeKeyboardAvoidingView>
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
                      <TouchableOpacity
                        onPress={() => {
                          setConfirmingDelete(false);
                          setDeleteTeamPassword("");
                        }}
                        testID="back-from-delete"
                      >
                        <X size={20} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                      This will permanently delete{" "}
                      <Text className="font-semibold text-slate-700 dark:text-slate-200">{editingTeam?.name}</Text>
                      {" "}and all its tasks and messages. Members will keep their accounts.
                    </Text>
                    <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      Enter your account password to confirm.
                    </Text>
                    <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Your account password
                    </Text>
                    <TextInput
                      className="bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 text-base mb-4 border border-slate-200 dark:border-slate-600"
                      value={deleteTeamPassword}
                      onChangeText={setDeleteTeamPassword}
                      placeholder="Password"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="delete-confirm-password-input"
                    />
                    <TouchableOpacity
                      onPress={handleDeleteTeam}
                      disabled={deleteTeamMutation.isPending || !deleteTeamConfirmationReady}
                      className="rounded-2xl py-4 items-center mb-3"
                      style={{ backgroundColor: deleteTeamConfirmationReady ? "#EF4444" : "#CBD5E1" }}
                      testID="confirm-delete-team"
                    >
                      {deleteTeamMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="text-white font-bold text-base">Delete Forever</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setConfirmingDelete(false);
                        setDeleteTeamPassword("");
                      }}
                      className="rounded-2xl py-4 items-center bg-slate-100 dark:bg-slate-700"
                      testID="cancel-delete-team"
                    >
                      <Text className="text-slate-700 dark:text-slate-200 font-semibold text-base">Cancel</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </Pressable>
          </SafeKeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Leave team confirmation modal */}
      <Modal visible={showSignOutConfirm} transparent animationType="fade" onRequestClose={() => setShowSignOutConfirm(false)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-6" onPress={() => setShowSignOutConfirm(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full">
              <Text className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Sign out?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
                You'll need to sign in again to access your account.
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setShowSignOutConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 items-center"
                  testID="cancel-sign-out-button"
                >
                  <Text className="font-semibold text-slate-600 dark:text-slate-300">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSignOut}
                  className="flex-1 py-3 rounded-xl bg-red-500 items-center"
                  testID="confirm-sign-out-button"
                >
                  <Text className="font-semibold text-white">Sign out</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={closeDeleteModal}>
          <SafeKeyboardAvoidingView>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-white dark:bg-slate-900 rounded-t-2xl overflow-hidden">
                <View className="items-center pt-3 pb-1">
                  <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                </View>

                {/* Step 1: Impact */}
                {deleteStep === 1 && (
                  <View className="px-5 pt-3 pb-10">
                    <View className="flex-row items-start justify-between mb-1">
                      <View className="flex-1 pr-4">
                        <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Account settings</Text>
                        <Text className="text-xl font-bold text-slate-900 dark:text-white mt-1">Delete account</Text>
                        <Text className="text-sm text-slate-500 mt-1 leading-5">
                          Review what happens and resolve any blockers before continuing.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={closeDeleteModal}
                        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center"
                      >
                        <X size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    <View className="mt-5 rounded-xl border border-red-200 bg-red-50/70 overflow-hidden">
                      <View className="flex-row items-center px-4 py-3 border-b border-red-100" style={{ gap: 8 }}>
                        <AlertTriangle size={16} color="#DC2626" />
                        <Text className="text-sm font-semibold text-red-800">Permanent removal</Text>
                      </View>
                      <View className="px-4 py-3" style={{ gap: 10 }}>
                        {[
                          "You'll be removed from all your teams",
                          "All your messages will be deleted",
                          "Your task history will be removed",
                          "This action cannot be undone",
                        ].map((item) => (
                          <View key={item} className="flex-row items-start" style={{ gap: 10 }}>
                            <View className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2" />
                            <Text className="flex-1 text-sm text-slate-700 leading-5">{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {deletionReadinessLoading ? (
                      <View className="items-center py-6 mt-4 rounded-xl border border-slate-200 bg-slate-50">
                        <ActivityIndicator color="#64748B" />
                        <Text className="text-sm text-slate-500 mt-2">Checking workspaces and billing…</Text>
                      </View>
                    ) : null}

                    {!deletionReadinessLoading && deleteBlockers.length > 0 ? (
                      <View className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
                        <View className="flex-row items-center px-4 py-3 border-b border-amber-100" style={{ gap: 8 }}>
                          <ShieldAlert size={16} color="#B45309" />
                          <Text className="text-sm font-semibold text-amber-900">Action required</Text>
                        </View>
                        <View className="p-3" style={{ gap: 10 }}>
                          {deleteBlockers.map((issue) => (
                            <View
                              key={`${issue.code}-${issue.teamId}`}
                              className="rounded-lg border border-amber-100 bg-white px-3 py-3"
                              style={{ gap: 10 }}
                            >
                              <Text className="text-sm text-slate-700 leading-5">{issue.message}</Text>
                              {issue.code === "active_web_billing" || issue.code === "mobile_store_billing" ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    closeDeleteModal();
                                    router.push({ pathname: "/account-hub", params: { teamId: issue.teamId } });
                                  }}
                                  className="self-start flex-row items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                                  style={{ gap: 6 }}
                                >
                                  <Text className="text-sm font-semibold text-[#4361EE]">Open {ACCOUNT_HUB_TITLE}</Text>
                                  <ChevronRight size={14} color="#4361EE" />
                                </TouchableOpacity>
                              ) : null}
                              {issue.code === "multi_member_owner" ? (
                                <TouchableOpacity
                                  onPress={() => {
                                    closeDeleteModal();
                                    router.push("/(app)/team");
                                  }}
                                  className="self-start flex-row items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
                                  style={{ gap: 6 }}
                                >
                                  <Text className="text-sm font-semibold text-[#4361EE]">Go to Team</Text>
                                  <ChevronRight size={14} color="#4361EE" />
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}

                    {!deletionReadinessLoading && deleteWarnings.length > 0 ? (
                      <View className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3" style={{ gap: 8 }}>
                        <Text className="text-sm font-semibold text-slate-700">Before you continue</Text>
                        {deleteWarnings.map((issue) => (
                          <Text key={`${issue.code}-${issue.teamId}`} className="text-sm text-slate-600 leading-5">
                            {issue.message}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    {!deletionReadinessLoading && !canContinueDelete ? (
                      <Text className="text-xs text-slate-500 text-center mt-4 leading-4">
                        Complete the required steps above to enable account deletion.
                      </Text>
                    ) : null}

                    <TouchableOpacity
                      onPress={() => {
                        if (!canContinueDelete) return;
                        setDeleteStep(2);
                      }}
                      disabled={deletionReadinessLoading || !canContinueDelete}
                      className={`rounded-xl py-4 items-center mt-5 mb-2 ${
                        deletionReadinessLoading || !canContinueDelete ? "bg-slate-100" : "bg-slate-900"
                      }`}
                      testID="delete-continue-step1"
                    >
                      <Text
                        className={`font-semibold text-base ${
                          deletionReadinessLoading || !canContinueDelete ? "text-slate-400" : "text-white"
                        }`}
                      >
                        Continue
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={closeDeleteModal} className="py-3 items-center">
                      <Text className="text-slate-500 font-medium">Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Step 2: Password + confirm deletion */}
                {deleteStep === 2 && (
                  <View className="px-5 pt-3 pb-10">
                    <View className="flex-row items-start justify-between mb-1">
                      <View className="flex-1 pr-4">
                        <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Final confirmation</Text>
                        <Text className="text-xl font-bold text-slate-900 dark:text-white mt-1">Verify your identity</Text>
                        <Text className="text-sm text-slate-500 mt-1 leading-5">
                          Enter your password to permanently delete this account.
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={closeDeleteModal}
                        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 items-center justify-center"
                      >
                        <X size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    <View className="mt-5 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 flex-row items-start" style={{ gap: 10 }}>
                      <AlertTriangle size={16} color="#DC2626" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-sm text-red-800 leading-5">
                        This permanently deletes your account and all associated data. Recovery is not possible.
                      </Text>
                    </View>

                    <Text className="text-sm font-semibold text-slate-700 mt-5 mb-2">Account password</Text>
                    <View className="flex-row items-center bg-white rounded-xl px-4 border border-slate-200 mb-2">
                      <Lock size={16} color="#94A3B8" />
                      <TextInput
                        className="flex-1 py-3.5 px-3 text-base text-slate-900"
                        placeholder="Enter your password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry={!deletePasswordVisible}
                        value={deletePassword}
                        onChangeText={(t) => { setDeletePassword(t); setDeleteError(null); }}
                        autoCapitalize="none"
                        testID="delete-password-input"
                      />
                      <TouchableOpacity onPress={() => setDeletePasswordVisible((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text className="text-slate-500 text-sm font-medium">{deletePasswordVisible ? "Hide" : "Show"}</Text>
                      </TouchableOpacity>
                    </View>
                    {deleteError ? <Text className="text-red-600 text-xs mb-3 ml-1">{deleteError}</Text> : <View className="mb-3" />}

                    <TouchableOpacity
                      onPress={() => {
                        if (!deletePassword.trim()) {
                          setDeleteError("Enter your password to confirm deletion.");
                          return;
                        }
                        deleteAccountMutation.mutate();
                      }}
                      disabled={deleteAccountMutation.isPending || !deletePassword.trim()}
                      className="rounded-xl py-4 items-center mt-2 mb-2 bg-red-600"
                      style={{ opacity: deletePassword.trim() ? 1 : 0.45 }}
                      testID="confirm-delete-account"
                    >
                      {deleteAccountMutation.isPending ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text className="font-semibold text-white text-base">Delete my account</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setDeletePassword("");
                        setDeleteError(null);
                        setDeleteStep(1);
                      }}
                      className="py-3 items-center"
                    >
                      <Text className="text-slate-500 font-medium">Back</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Pressable>
          </SafeKeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={timezoneModalOpen} transparent animationType="slide" onRequestClose={() => setTimezoneModalOpen(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setTimezoneModalOpen(false)}>
          <Pressable className="bg-white dark:bg-slate-900 rounded-t-3xl max-h-[70%]" onPress={(e) => e.stopPropagation()}>
            <View className="px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Text className="text-lg font-bold text-slate-900 dark:text-white">Time zone</Text>
              <Text className="text-sm text-slate-500 mt-1">Used for due dates and recurring tasks.</Text>
            </View>
            <ScrollView className="px-5 py-3">
              {COMMON_TIMEZONES.map((tz) => {
                const selected = resolveTimeZone(meProfile?.timezone) === tz;
                return (
                  <TouchableOpacity
                    key={tz}
                    disabled={timezoneSaving}
                    onPress={async () => {
                      setTimezoneSaving(true);
                      try {
                        await api.patch("/api/profile", { timezone: tz });
                        await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
                        setTimezoneModalOpen(false);
                      } finally {
                        setTimezoneSaving(false);
                      }
                    }}
                    className="py-3 border-b border-slate-100 dark:border-slate-800 flex-row items-center justify-between"
                  >
                    <Text className={`text-sm ${selected ? "font-bold text-indigo-600" : "text-slate-700 dark:text-slate-200"}`}>
                      {formatTimeZoneLabel(tz)}
                    </Text>
                    {selected ? <Check size={18} color="#4361EE" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
