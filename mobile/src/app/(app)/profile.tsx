import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  Linking,
  Switch,
  useWindowDimensions,
} from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Activity, AtSign, Ban, Bell, Building2, Camera, CircleHelp, Clock3, FileText, ImageIcon, Info, LogOut, Mail, MessageSquareText, Search, ChevronLeft, ChevronRight, Settings, Shield, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react-native";
import { formatTimeZoneLabel, getBrowserTimeZone, resolveTimeZone } from "@/lib/timezone";
import { authClient, agentDebugLog, clearAccessToken } from "@/lib/auth/auth-client";
import {
  SESSION_QUERY_KEY,
  markSessionSignedOut,
  useSession,
  clearMobileAuthCaches,
  clearAllCachesForSignedOutUser,
  refreshMeInAuthCaches,
  useMobileAuthReady,
} from "@/lib/auth/use-session";
import { clearNotifDebugLog, getNotifDebugLog, getNotifStatus, registerForPushNotificationsAsync } from "@/lib/notifications";
import { router, useLocalSearchParams, useFocusEffect, usePathname } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { uploadFile } from "@/lib/upload";
import { pickImage, takePhoto } from "@/lib/file-picker";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";
import type { Team } from "@/lib/types";
import {
  AlenioBottomSheet,
} from "@/components/AlenioBottomSheet";
import {
  ProfileCard,
  ProfileContent,
  ProfileDivider,
  ProfileMenuRow,
  ProfileSection,
} from "@/components/profile/ProfileEnterpriseUI";
import { formatTeamRole } from "@/components/WorkspaceTeamUI";
import { radii } from "@/theme";
import { OutlookCalendarCard } from "@/components/profile/OutlookCalendarCard";
import { formatOutlookUserError } from "@/lib/outlook-calendar-errors";
import { UserAvatar } from "@/components/UserAvatar";
import { GetStartedProgressCard } from "@/components/profile/GetStartedProgressCard";
import { useGetStartedProgress } from "@/lib/use-get-started-progress";
import { useProfileSheetStore } from "@/lib/state/seneca-sheet-store";
import { useTabBarClearanceFn } from "@/lib/tab-bar";

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

type MessagePrivacy = "everyone" | "connections_and_shared" | "connections_only";

type PrivacySettings = {
  messagePrivacy: MessagePrivacy;
  discoverableByEmail: boolean;
  showActiveStatus: boolean;
};

type BlockedPerson = {
  id: string;
  person: { id: string; name: string | null; username: string | null; image: string | null };
  createdAt: string;
};

const PRIVACY_SETTINGS_QUERY_KEY = ["privacy-settings"] as const;

const MESSAGE_PRIVACY_LABELS: Record<MessagePrivacy, string> = {
  everyone: "Everyone",
  connections_and_shared: "Connections + shared",
  connections_only: "Connections only",
};

export function ProfileScreen({
  asSheet = false,
  visible = true,
  onClose,
  asTab = false,
}: {
  asSheet?: boolean;
  visible?: boolean;
  onClose?: () => void;
  asTab?: boolean;
}) {
  const tabClearance = useTabBarClearanceFn();
  const { height: viewportHeight } = useWindowDimensions();
  const pathname = usePathname();
  const pathWhenOpened = useRef(pathname);
  const { outlook, message, openPhoto } = useLocalSearchParams<{
    outlook?: string;
    message?: string;
    openPhoto?: string;
  }>();
  const { data: session } = useSession();
  const { data: authReady } = useMobileAuthReady();
  const queryClient = useQueryClient();
  const getStartedProgress = useGetStartedProgress();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const user = session?.user;

  useEffect(() => {
    if (visible) pathWhenOpened.current = pathname;
  }, [visible]);

  useEffect(() => {
    if (!asSheet || !visible) return;
    if (pathname !== pathWhenOpened.current) {
      onClose?.();
    }
  }, [asSheet, visible, pathname, onClose]);

  useEffect(() => {
    if (outlook === "connected") {
      toast({ title: "Outlook connected", preset: "done" });
      void queryClient.invalidateQueries({ queryKey: ["calendar-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["external-calendar-events"] });
      router.setParams({ outlook: undefined, message: undefined });
    } else if (outlook === "error") {
      Alert.alert("Outlook calendar", formatOutlookUserError(typeof message === "string" ? message : undefined));
      router.setParams({ outlook: undefined, message: undefined });
    }
  }, [outlook, message, queryClient]);

  // Profile state
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);

  useEffect(() => {
    if (openPhoto !== "1") return;
    setShowSettings(false);
    setShowPhotoPicker(true);
    router.setParams({ openPhoto: undefined });
  }, [openPhoto]);

  // Delete account state

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!user,
  });
  const compactNoWorkspace = !teamsLoading && teams.length === 0 && viewportHeight < 900;

  /** Backend profile (includes `image` from DB); auth session often omits photo URL — same source as team member avatars. */
  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{
        id: string;
        name: string;
        email: string;
        image: string | null;
        isAdmin?: boolean;
        timezone?: string | null;
        username?: string | null;
        usernameAutoGenerated?: boolean;
      }>("/api/me"),
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

  const { data: privacySettings } = useQuery({
    queryKey: PRIVACY_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<PrivacySettings>("/api/privacy-settings"),
    enabled: !!user,
  });
  const messagePrivacy: MessagePrivacy = privacySettings?.messagePrivacy ?? "connections_and_shared";
  const discoverableByEmail = privacySettings?.discoverableByEmail ?? true;
  const showActiveStatus = privacySettings?.showActiveStatus ?? true;

  const privacyMutation = useMutation({
    mutationFn: (payload: Partial<PrivacySettings>) =>
      api.patch<PrivacySettings>("/api/privacy-settings", payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: PRIVACY_SETTINGS_QUERY_KEY });
      const previous = queryClient.getQueryData<PrivacySettings>(PRIVACY_SETTINGS_QUERY_KEY);
      queryClient.setQueryData<PrivacySettings>(PRIVACY_SETTINGS_QUERY_KEY, (current) => ({
        messagePrivacy: current?.messagePrivacy ?? "connections_and_shared",
        discoverableByEmail: current?.discoverableByEmail ?? true,
        showActiveStatus: current?.showActiveStatus ?? true,
        ...payload,
      }));
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PRIVACY_SETTINGS_QUERY_KEY, data);
    },
    onError: (_error, _payload, context) => {
      queryClient.setQueryData(PRIVACY_SETTINGS_QUERY_KEY, context?.previous);
      Alert.alert("Couldn't save", "Please try again.");
    },
  });

  const { data: blockedPeople = [] } = useQuery({
    queryKey: ["blocked-people"],
    queryFn: () => api.get<BlockedPerson[]>("/api/connections/blocked"),
    enabled: !!user,
  });

  const { data: notifPrefs } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<NotifPrefs>("/api/notification-preferences"),
    enabled: !!user,
  });


  const activeTeam = teams.find((t) => t.id === activeTeamId) as (Team & { role?: string }) | undefined;

  // ── Profile mutations ──────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (source: "library" | "camera") => {
      const file = source === "library" ? await pickImage() : await takePhoto();
      if (!file) throw new Error("cancelled");
      setLocalImage(file.uri);
      const uploaded = await uploadFile(file.uri, file.filename, file.mimeType, { purpose: "profile" });
      return uploaded.url;
    },
    onSuccess: async (uploadedUrl) => {
      setLocalImage(uploadedUrl);
      queryClient.setQueryData<
        { id: string; name: string; email: string; image: string | null; isAdmin?: boolean; timezone?: string | null }
      >(ME_QUERY_KEY, (current) => (current ? { ...current, image: uploadedUrl } : current));
      await refreshMeInAuthCaches(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["team"] }),
        queryClient.invalidateQueries({ queryKey: ["dms"] }),
        queryClient.invalidateQueries({ queryKey: ["dm-messages"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
        queryClient.invalidateQueries({ queryKey: ["user-search"] }),
        queryClient.invalidateQueries({ queryKey: ["group-member-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["task"] }),
        queryClient.invalidateQueries({ queryKey: ["task-notes"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
        queryClient.invalidateQueries({ queryKey: ["join-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast({ title: "Profile photo updated", preset: "done" });
    },
    onError: (err: Error) => {
      setLocalImage(null);
      if (err.message !== "cancelled") {
        // Native Alert shows the full server message; Burnt toasts often hide the subtitle on Android.
        Alert.alert("Could not update photo", err.message || "Something went wrong. Try again.");
      }
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () =>
      api.patch<{ image: string | null }>("/api/profile", { image: null }),
    onSuccess: async () => {
      setShowRemovePhotoConfirm(false);
      setLocalImage(null);
      queryClient.setQueryData<
        { id: string; name: string; email: string; image: string | null; isAdmin?: boolean; timezone?: string | null }
      >(ME_QUERY_KEY, (current) => (current ? { ...current, image: null } : current));
      await refreshMeInAuthCaches(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["team"] }),
        queryClient.invalidateQueries({ queryKey: ["dms"] }),
        queryClient.invalidateQueries({ queryKey: ["dm-messages"] }),
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
        queryClient.invalidateQueries({ queryKey: ["user-search"] }),
        queryClient.invalidateQueries({ queryKey: ["group-member-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["task"] }),
        queryClient.invalidateQueries({ queryKey: ["task-notes"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
        queryClient.invalidateQueries({ queryKey: ["join-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
      toast({ title: "Profile photo removed", preset: "done" });
    },
    onError: (err: Error) => {
      Alert.alert(
        "Could not remove photo",
        err.message || "Something went wrong. Try again.",
      );
    },
  });


  const handlePhotoPress = () => {
    if (uploadMutation.isPending || removePhotoMutation.isPending) return;
    setShowPhotoPicker(true);
  };

  const pickProfilePhoto = (source: "library" | "camera") => {
    setShowPhotoPicker(false);
    setTimeout(() => uploadMutation.mutate(source), 280);
  };

  const removeProfilePhoto = () => {
    setShowPhotoPicker(false);
    setTimeout(() => setShowRemovePhotoConfirm(true), 280);
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
    clearAllCachesForSignedOutUser(queryClient);
    setActiveTeamId(null);
    agentDebugLog("sign-out complete", { runId: "auth-simplify-v1", hypothesisId: "H15" });
    router.replace("/welcome");
  };

  const displayName = meProfile?.name ?? user?.name;
  const displayEmail = meProfile?.email ?? user?.email;
  const username = meProfile?.username ?? null;
  const avatarUri =
    localImage ??
    (meProfile !== undefined ? meProfile?.image : user?.image) ??
    null;
  const heroRoleLabel = activeTeam?.role ? formatTeamRole(activeTeam.role) : "Member";
  const workspaceCountLabel = `${teams.length} Workspace${teams.length === 1 ? "" : "s"}`;
  const timezoneValue = formatTimeZoneLabel(resolveTimeZone(meProfile?.timezone));

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
    try {
      await refreshMeInAuthCaches(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["billing-workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["notification-preferences"] }),
        queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const profileAvatarSize = compactNoWorkspace ? 70 : 76;
  const profileAvatarControl = !showSettings ? (
    <TouchableOpacity
      onPress={handlePhotoPress}
      disabled={uploadMutation.isPending}
      testID="avatar-upload-button"
      style={{
        position: "relative",
        width: profileAvatarSize + 8,
        height: profileAvatarSize + 8,
        borderRadius: (profileAvatarSize + 8) / 2,
        padding: 4,
        backgroundColor: "#FFFFFF",
        shadowColor: "#312E81",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.14,
        shadowRadius: 7,
        elevation: 4,
      }}
    >
      <View
        style={{
          width: profileAvatarSize,
          height: profileAvatarSize,
          borderRadius: profileAvatarSize / 2,
          overflow: "visible",
        }}
      >
        <UserAvatar
          user={{
            name: displayName,
            email: displayEmail,
            image: avatarUri,
            isWorkplaceConnected:
              (meProfile as { isWorkplaceConnected?: boolean } | undefined)
                ?.isWorkplaceConnected ?? (teams.length > 0),
          }}
          size={profileAvatarSize}
          radius={profileAvatarSize / 2}
          backgroundColor="#EEF2FF"
          textColor="#4361EE"
          fontSize={compactNoWorkspace ? 27 : 29}
          style={{ borderWidth: 1, borderColor: "#E2E8F0" }}
          testID="profile-avatar"
          workplaceConnectedInteractive
        />
        {uploadMutation.isPending ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: profileAvatarSize / 2,
              backgroundColor: "rgba(255,255,255,0.62)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color="#4361EE" testID="upload-loading-indicator" />
          </View>
        ) : null}
      </View>
      <View
        style={{
          position: "absolute",
          top: 1,
          right: 1,
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1.5,
          borderColor: "#D7DDF8",
        }}
      >
        <Camera size={11} color="#4361EE" />
      </View>
    </TouchableOpacity>
  ) : undefined;
  const profileSheetHero = !showSettings ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 4,
        paddingBottom: 18,
      }}
      testID="profile-sheet-hero"
    >
      {profileAvatarControl}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 21,
            lineHeight: 26,
            fontWeight: "800",
            color: "#0F172A",
            letterSpacing: -0.35,
          }}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {username ? (
          <Pressable
            onPress={() => router.push("/username")}
            style={{ alignSelf: "flex-start", marginTop: 1, paddingVertical: 2 }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Edit username"
            testID="profile-username"
          >
            <Text style={{ fontSize: 12, color: "#64748B" }} numberOfLines={1}>
              @{username}
            </Text>
          </Pressable>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            marginTop: 7,
            flexWrap: "wrap",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Building2 size={12} color="#64748B" strokeWidth={2.2} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>
              {workspaceCountLabel}
            </Text>
          </View>
          <View style={{ width: 1, height: 12, backgroundColor: "#E2E8F0" }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Shield size={12} color="#64748B" strokeWidth={2.2} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>
              {heroRoleLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  const closeProfile = () => {
    setShowSettings(false);
    onClose?.();
  };

  const profileOverlays = (
        <>
      {/* Profile photo sheet */}
      <AlenioBottomSheet
        visible={showPhotoPicker}
        title="Profile photo"
        subtitle="Choose how you appear across Alenio"
        onClose={() => setShowPhotoPicker(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        sheetStyle={{ minHeight: avatarUri ? 430 : 370 }}
        testID="profile-photo-sheet"
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 13,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: "#E7E9F4",
            backgroundColor: "#F8F8FD",
          }}
        >
          <UserAvatar
            user={{ name: displayName, email: displayEmail, image: avatarUri }}
            size={52}
            radius={26}
            resetKey={avatarUri}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "800", color: "#202A3E" }}>
              {avatarUri ? "Current profile photo" : "Your profile initials"}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 11.5, lineHeight: 16, color: "#7A8699" }}>
              This is how people recognize you across Alenio.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <TouchableOpacity
            onPress={() => pickProfilePhoto("library")}
            activeOpacity={0.78}
            style={{
              flex: 1,
              minHeight: 104,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 10,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: "#E3E6F2",
              backgroundColor: "#FFFFFF",
            }}
            testID="profile-photo-library"
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#EEF1FF",
              }}
            >
              <ImageIcon size={19} color="#5364E8" strokeWidth={2} />
            </View>
            <Text style={{ marginTop: 9, fontSize: 13, fontWeight: "800", color: "#263148" }}>
              Choose photo
            </Text>
            <Text style={{ marginTop: 2, fontSize: 10.5, color: "#8A95A7" }}>From your library</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => pickProfilePhoto("camera")}
            activeOpacity={0.78}
            style={{
              flex: 1,
              minHeight: 104,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 10,
              borderRadius: 17,
              borderWidth: 1,
              borderColor: "#E3E6F2",
              backgroundColor: "#FFFFFF",
            }}
            testID="profile-photo-camera"
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F0ECFF",
              }}
            >
              <Camera size={19} color="#744DE8" strokeWidth={2} />
            </View>
            <Text style={{ marginTop: 9, fontSize: 13, fontWeight: "800", color: "#263148" }}>
              Take photo
            </Text>
            <Text style={{ marginTop: 2, fontSize: 10.5, color: "#8A95A7" }}>Use your camera</Text>
          </TouchableOpacity>
        </View>

        {avatarUri ? (
          <TouchableOpacity
            onPress={removeProfilePhoto}
            activeOpacity={0.72}
            style={{
              minHeight: 54,
              marginTop: 10,
              paddingHorizontal: 12,
              borderRadius: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 11,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "#E5E8EF",
              shadowColor: "#1F2937",
              shadowOpacity: 0.045,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
            }}
            testID="profile-photo-remove"
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FBF0EE",
              }}
            >
              <Trash2 size={14} color="#AC5148" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "800", color: "#344054" }}>
                Remove current photo
              </Text>
              <Text style={{ marginTop: 2, fontSize: 10.5, color: "#8A95A7" }}>
                Return to your profile initials
              </Text>
            </View>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F6F7FA",
              }}
            >
              <ChevronRight size={14} color="#98A2B3" strokeWidth={2.1} />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          testID="profile-photo-cancel"
          onPress={() => setShowPhotoPicker(false)}
          activeOpacity={0.65}
          style={{ minHeight: 38, marginTop: 4, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#68758A" }}>Cancel</Text>
        </TouchableOpacity>
      </AlenioBottomSheet>

      <AlenioBottomSheet
        visible={showRemovePhotoConfirm}
        title="Profile photo"
        subtitle="Manage how you appear across Alenio"
        onClose={() => {
          if (!removePhotoMutation.isPending) setShowRemovePhotoConfirm(false);
        }}
        compact
        showCloseButton
        scrollEnabled={false}
        sheetStyle={{ minHeight: 400 }}
        testID="remove-profile-photo-confirmation"
      >
        <View style={{ alignItems: "center", paddingHorizontal: 14, paddingTop: 6 }}>
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F1F3FF",
              borderWidth: 1,
              borderColor: "#E2E5FA",
              shadowColor: "#273248",
              shadowOpacity: 0.12,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
            }}
          >
            <UserAvatar
              user={{ name: displayName, email: displayEmail, image: avatarUri }}
              size={70}
              radius={35}
              resetKey={avatarUri}
            />
            <View
              style={{
                position: "absolute",
                right: -1,
                bottom: -1,
                width: 29,
                height: 29,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FBE8E4",
                borderWidth: 3,
                borderColor: "#FFFFFF",
              }}
            >
              <Trash2 size={13} color="#B94A3F" strokeWidth={2.2} />
            </View>
          </View>
          <Text
            style={{
              marginTop: 17,
              fontSize: 18,
              lineHeight: 23,
              fontWeight: "800",
              letterSpacing: -0.3,
              color: "#172033",
              textAlign: "center",
            }}
          >
            Remove your current photo?
          </Text>
          <Text
            style={{
              maxWidth: 310,
              marginTop: 6,
              fontSize: 12.5,
              lineHeight: 18,
              color: "#718096",
              textAlign: "center",
            }}
          >
            Your initials will appear across Alenio instead. You can add a new photo anytime.
          </Text>
        </View>
        <View style={{ marginTop: 20, width: "100%", alignSelf: "stretch" }}>
          <TouchableOpacity
            onPress={() => removePhotoMutation.mutate()}
            disabled={removePhotoMutation.isPending}
            activeOpacity={0.82}
            style={{
              width: "100%",
              alignSelf: "stretch",
              minHeight: 48,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#B4473E",
              opacity: removePhotoMutation.isPending ? 0.72 : 1,
            }}
            testID="confirm-remove-profile-photo"
          >
            {removePhotoMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFFFFF" }}>
                Remove profile photo
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowRemovePhotoConfirm(false)}
            disabled={removePhotoMutation.isPending}
            activeOpacity={0.65}
            style={{
              width: "100%",
              minHeight: 38,
              marginTop: 5,
              alignItems: "center",
              justifyContent: "center",
              opacity: removePhotoMutation.isPending ? 0.45 : 1,
            }}
            testID="cancel-remove-profile-photo"
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#68758A" }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </AlenioBottomSheet>

        </>
  );

  const profileMain = (
          <ProfileContent compact={compactNoWorkspace}>
          {!showSettings ? (
          <>
          {profileSheetHero}
          {getStartedProgress.isResolved &&
          !getStartedProgress.hasCompletedOnce &&
          !getStartedProgress.isExpired ? (
            <GetStartedProgressCard
              completedCount={getStartedProgress.completedCount}
              totalCount={getStartedProgress.totalCount}
              remainingCount={getStartedProgress.remainingCount}
              percent={getStartedProgress.percent}
              onPress={() => router.push("/get-started")}
            />
          ) : null}

          {/* Account */}
          <ProfileSection title="Account">
            <ProfileCard>
              <ProfileMenuRow
                icon={UserRound}
                title="Public profile"
                subtitle="View your profile and edit what others see"
                onPress={() => {
                  const userId = meProfile?.id ?? user?.id;
                  if (!userId) return;
                  router.push({ pathname: "/person", params: { userId } });
                }}
                testID="public-profile-menu-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Settings}
                title="Settings"
                subtitle="Notifications, appearance, integrations, and support"
                onPress={() => setShowSettings(true)}
                testID="open-settings-row"
              />
            </ProfileCard>
          </ProfileSection>

          <View style={{ marginTop: 20 }}>
            <ProfileCard>
              <ProfileMenuRow
                icon={LogOut}
                title="Sign Out"
                subtitle="Sign out of Alenio on this device"
                onPress={() => setShowSignOutConfirm(true)}
                testID="profile-sign-out-button"
                destructive
              />
            </ProfileCard>
          </View>

          </>
          ) : null}

          {showSettings ? (
          <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: radii.md,
              paddingHorizontal: 14,
              paddingVertical: 13,
              backgroundColor: "#F2F5FF",
              borderWidth: 1,
              borderColor: "#DDE5FF",
            }}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
              }}
            >
              <ShieldCheck size={19} color="#4361EE" strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: "700", color: "#182033" }}>
                Account controls
              </Text>
              <Text style={{ marginTop: 2, fontSize: 11, lineHeight: 15, color: "#69758C" }}>
                Manage your personal Alenio experience and account security.
              </Text>
            </View>
          </View>

          {getStartedProgress.isResolved &&
          !getStartedProgress.hasCompletedOnce &&
          !getStartedProgress.isExpired ? (
            <ProfileSection title="Getting started">
              <ProfileCard>
                <ProfileMenuRow
                  icon={Sparkles}
                  title="Get started"
                  subtitle={`${getStartedProgress.remainingCount} ${
                    getStartedProgress.remainingCount === 1 ? "step" : "steps"
                  } remaining`}
                  value={`${getStartedProgress.completedCount}/${getStartedProgress.totalCount}`}
                  onPress={() => router.push("/get-started")}
                  testID="settings-get-started-row"
                />
              </ProfileCard>
            </ProfileSection>
          ) : null}

          <ProfileSection
            title="Personal information"
            subtitle="Your Alenio identity across every workspace."
          >
            <ProfileCard>
              <ProfileMenuRow
                icon={AtSign}
                title="Username"
                subtitle="How people find you on Alenio"
                value={username ? `@${username}` : undefined}
                onPress={() => router.push("/username")}
                testID="username-menu-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Mail}
                title="Email"
                subtitle="Used for sign-in and account notices"
                value={displayEmail}
                onPress={() => router.push("/change-email")}
                testID="email-menu-row"
              />
            </ProfileCard>
          </ProfileSection>

          <ProfileSection
            title="Preferences"
            subtitle="Choose how Alenio communicates and displays information."
          >
            <ProfileCard>
              <ProfileMenuRow
                icon={Bell}
                title="Notifications"
                subtitle="Messages, assignments, meetings, and admin alerts"
                onPress={() => router.push("/notifications")}
                testID="notifications-menu-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Clock3}
                title="Time Zone"
                subtitle="Used for due dates, schedules, and recurring work"
                value={timezoneValue}
                onPress={() => router.push("/timezone")}
                testID="timezone-menu-row"
              />
            </ProfileCard>
          </ProfileSection>

          {!teamsLoading && teams.length > 0 ? (
            <ProfileSection
              title="Integrations"
              subtitle="Connect calendars and other tools you use at work."
            >
              <OutlookCalendarCard />
            </ProfileSection>
          ) : null}

          <ProfileSection
            title="Privacy"
            subtitle="Control who can reach you and how people find you."
          >
            <ProfileCard>
              <ProfileMenuRow
                icon={MessageSquareText}
                title="Who can message me"
                subtitle="Applies to new conversations only"
                value={MESSAGE_PRIVACY_LABELS[messagePrivacy]}
                onPress={() => router.push("/message-privacy")}
                testID="message-privacy-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Search}
                title="Find me by email"
                subtitle="Let people search your exact email address"
                showChevron={false}
                trailing={
                  <Switch
                    value={discoverableByEmail}
                    onValueChange={(next) => privacyMutation.mutate({ discoverableByEmail: next })}
                    disabled={privacyMutation.isPending}
                    trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
                    testID="discoverable-by-email-switch"
                  />
                }
                testID="discoverable-by-email-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Activity}
                title="Show active status"
                subtitle="Only accepted connections can see when you’re active"
                showChevron={false}
                trailing={
                  <Switch
                    value={showActiveStatus}
                    onValueChange={(next) => privacyMutation.mutate({ showActiveStatus: next })}
                    disabled={privacyMutation.isPending}
                    trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
                    testID="show-active-status-switch"
                  />
                }
                testID="show-active-status-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Ban}
                title="Blocked people"
                subtitle="Blocking never changes a workspace you share"
                value={blockedPeople.length > 0 ? String(blockedPeople.length) : undefined}
                onPress={() => router.push("/blocked-people")}
                testID="blocked-people-row"
              />
            </ProfileCard>
          </ProfileSection>

          <ProfileSection
            title="Security & access"
            subtitle="Protect your account and manage sensitive actions."
          >
            <ProfileCard>
              <ProfileMenuRow
                icon={ShieldCheck}
                title="Security"
                subtitle="Review account protection and deletion options"
                onPress={() => router.push("/security")}
                testID="security-menu-row"
              />
            </ProfileCard>
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

          <ProfileSection
            title="Help & resources"
            subtitle="Get assistance and learn more about Alenio."
          >
            <ProfileCard>
              <ProfileMenuRow
                icon={MessageSquareText}
                title="Send Feedback"
                subtitle="Share an idea or report a problem"
                onPress={() => router.push("/feedback")}
                testID="feedback-card"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={CircleHelp}
                title="Help Center"
                subtitle="Guides, answers, and product support"
                onPress={() => void Linking.openURL("https://alenio.com/help")}
                testID="help-center-row"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={Info}
                title="About Alenio"
                subtitle="Product and release information"
                value={`v${Constants.expoConfig?.version ?? "—"}`}
                onPress={() =>
                  Alert.alert(
                    "About Alenio",
                    `Version ${Constants.expoConfig?.version ?? "—"}\n\nWorkplace chat, tasks, and team rituals — built for the floor.`,
                  )
                }
                testID="about-alenio-row"
              />
            </ProfileCard>
          </ProfileSection>

          <ProfileSection title="Legal">
            <ProfileCard>
              <ProfileMenuRow
                icon={FileText}
                title="Privacy Policy"
                onPress={() => router.push("/privacy-policy")}
                testID="privacy-policy-link"
              />
              <ProfileDivider inset />
              <ProfileMenuRow
                icon={FileText}
                title="Terms of Service"
                onPress={() => router.push("/terms-of-service")}
                testID="terms-of-service-link"
              />
            </ProfileCard>
          </ProfileSection>

          <ProfileSection title="Account">
            <ProfileCard>
              <ProfileMenuRow
                icon={LogOut}
                title="Sign Out"
                onPress={() => setShowSignOutConfirm(true)}
                testID="sign-out-button"
                destructive
                subtitle="Sign out of Alenio on this device"
              />
            </ProfileCard>
          </ProfileSection>
          </>
          ) : null}
        </ProfileContent>
  );

  const signOutConfirm = showSignOutConfirm ? (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={() => setShowSignOutConfirm(false)}
    >
      <View style={signOutStyles.backdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={signOutStyles.card}
        >
          <Text style={signOutStyles.title}>Sign out?</Text>
          <Text style={signOutStyles.copy}>
            You'll need to sign in again to access your account.
          </Text>
          <View style={signOutStyles.actions}>
            <TouchableOpacity
              onPress={() => setShowSignOutConfirm(false)}
              style={signOutStyles.cancelBtn}
              activeOpacity={0.85}
              testID="cancel-sign-out-button"
            >
              <Text style={signOutStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSignOut}
              style={signOutStyles.confirmBtn}
              activeOpacity={0.9}
              testID="confirm-sign-out-button"
            >
              <Text style={signOutStyles.confirmText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </View>
    </Pressable>
  ) : null;

  return (
    <>
      <AlenioBottomSheet
        visible={asSheet ? visible : true}
        asScreen={asTab}
        title={showSettings ? "Settings" : "Profile"}
        onClose={closeProfile}
        showCloseButton={!asTab}
        bodyHeightRatio={asTab ? 0.78 : 0.88}
        sheetStyle={asTab ? { marginBottom: tabClearance(4) } : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4361EE"
            colors={["#4361EE"]}
          />
        }
        headerRight={
          showSettings ? (
            <Pressable
              onPress={() => setShowSettings(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to profile"
              testID="settings-back-to-profile"
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#E7ECF8" : "#F1F4FA",
                marginRight: 6,
              })}
            >
              <ChevronLeft size={20} color="#27304D" strokeWidth={2.4} />
            </Pressable>
          ) : undefined
        }
        testID="profile-screen"
        overlay={signOutConfirm}
      >
        {profileMain}
      </AlenioBottomSheet>
      {profileOverlays}
    </>
  );
}

const signOutStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  copy: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  cancelBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  confirmBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

export default function ProfileRoute() {
  const openSheet = useProfileSheetStore((state) => state.openSheet);
  useFocusEffect(
    useCallback(() => {
      openSheet();
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(app)/home");
      }
    }, [openSheet]),
  );
  return null;
}
