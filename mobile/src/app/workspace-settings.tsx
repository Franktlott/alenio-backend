import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Check,
  ChevronRight,
  LogOut,
  Settings2,
  Trash2,
  X,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { uploadFile } from "@/lib/upload";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import type { Team } from "@/lib/types";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import { WorkplaceStandardsSheet } from "@/components/WorkplaceStandardsSheet";
import { SwitchWorkspaceSheet } from "@/components/SwitchWorkspaceSheet";
import { AppPageBackground } from "@/components/AppPageBackground";
import { mergeWorkplaceStandards, type WorkplaceStandards } from "@/lib/workplace-standards";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { colors, radii, space } from "@/theme";

type JoinRequestItem = {
  id: string;
  status: string;
  user: { id: string; name: string; email: string; image: string | null };
};

export default function WorkspaceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const { switchWorkspace } = useSwitchWorkspace();

  const teamId = (typeof params.teamId === "string" && params.teamId) || activeTeamId || "";

  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const role = (team?.role ?? teams.find((t) => t.id === teamId)?.role ?? "").toLowerCase();
  const isOwner = role === "owner";
  const isLeader = isOwner || role === "team_leader";
  const canManage = isOwner || isLeader;
  const isCurrent = teamId === activeTeamId;

  const { data: teamStandards } = useQuery({
    queryKey: ["team", teamId, "workplaceStandards"],
    queryFn: async () => {
      const row = await api.get<Team & { workplaceStandards?: WorkplaceStandards }>(`/api/teams/${teamId}`);
      return mergeWorkplaceStandards(row.workplaceStandards);
    },
    enabled: !!teamId && isOwner,
  });

  const { data: joinRequests = [] } = useQuery({
    queryKey: ["join-requests", teamId],
    queryFn: () => api.get<JoinRequestItem[]>(`/api/teams/${teamId}/join-requests`),
    enabled: !!teamId && canManage,
  });

  useEffect(() => {
    if (!team) return;
    setName(team.name);
    setImage(team.image ?? null);
    setConfirmingDelete(false);
    setDeletePassword("");
  }, [team?.id, team?.name, team?.image]);

  const dirty = useMemo(() => {
    if (!team) return false;
    return name.trim() !== team.name || (image ?? null) !== (team.image ?? null);
  }, [team, name, image]);

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; image: string | null }) =>
      api.patch<Team>(`/api/teams/${teamId}`, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team", updated.id] });
      toast({ title: "Workspace updated", preset: "done" });
    },
    onError: () => toast({ title: "Failed to update workspace", preset: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (body: { password: string }) => api.delete(`/api/teams/${teamId}`, body),
    onSuccess: async () => {
      await applyTeamRemovedFromAccount(teamId, activeTeamId, setActiveTeamId, queryClient);
      toast({ title: "Workspace deleted", preset: "done" });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/profile");
    },
    onError: (err: Error) => {
      const message =
        err.message === "Incorrect password" ? "Incorrect password. Please try again." : "Failed to delete workspace";
      toast({ title: message, preset: "error" });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/leave`),
    onSuccess: async () => {
      await applyTeamRemovedFromAccount(teamId, activeTeamId, setActiveTeamId, queryClient);
      toast({ title: "Left workspace", preset: "done" });
      if (router.canGoBack()) router.back();
      else router.replace("/(app)/profile");
    },
    onError: () => toast({ title: "Couldn’t leave workspace", preset: "error" }),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", teamId] });
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      toast({ title: "Request approved", preset: "done" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests", teamId] });
      toast({ title: "Request declined", preset: "done" });
    },
  });

  const pickPhoto = async () => {
    if (!canManage || !teamId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg", {
        purpose: "team",
        teamId,
      });
      setImage(uploaded.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Failed to upload photo", message, preset: "error" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = () => {
    if (!canManage || !name.trim()) return;
    updateMutation.mutate({ name: name.trim(), image });
  };

  const deleteReady = deletePassword.trim().length > 0;

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <AppPageBackground />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No workspace selected</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="workspace-settings-screen">
      <AppPageBackground />

      <View style={[styles.topBar, { paddingTop: 4 }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/profile"))}
          hitSlop={10}
          style={styles.iconBtn}
          testID="workspace-settings-back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <Text style={styles.topTitle}>Workspace</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading || !team ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : confirmingDelete ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: space.pagePad, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionTitle}>Delete workspace?</Text>
          <Text style={styles.bodyCopy}>
            This permanently deletes <Text style={{ fontWeight: "700" }}>{team.name}</Text> and its
            tasks and messages. Members keep their accounts.
          </Text>
          <Text style={styles.label}>Your account password</Text>
          <TextInput
            style={styles.input}
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Password"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="delete-workspace-password-input"
          />
          <Pressable
            onPress={() => deleteMutation.mutate({ password: deletePassword.trim() })}
            disabled={deleteMutation.isPending || !deleteReady}
            style={[styles.primaryBtn, { backgroundColor: deleteReady ? "#EF4444" : "#CBD5E1" }]}
            testID="confirm-delete-workspace"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>Delete forever</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setConfirmingDelete(false);
              setDeletePassword("");
            }}
            style={styles.secondaryBtn}
            testID="cancel-delete-workspace"
          >
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <SafeKeyboardAvoidingView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: space.pagePad, paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <Pressable
                onPress={canManage ? pickPhoto : undefined}
                disabled={!canManage || uploadingImage}
                testID="workspace-settings-pick-photo"
                style={styles.photoWrap}
              >
                {uploadingImage ? (
                  <View style={[styles.photo, styles.photoPlaceholder]}>
                    <ActivityIndicator color={colors.brand} />
                  </View>
                ) : image ? (
                  <Image source={{ uri: image }} style={styles.photo} resizeMode="cover" />
                ) : (
                  <WorkspaceTeamAvatar team={{ name: team.name, image }} size={88} radius={22} />
                )}
                {canManage ? (
                  <View style={styles.cameraBadge}>
                    <Camera size={13} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
              {canManage ? (
                <Text style={styles.hint}>Tap to change photo</Text>
              ) : (
                <Text style={styles.heroName}>{team.name}</Text>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{formatTeamRole(team.role)}</Text>
                {isCurrent ? (
                  <>
                    <Text style={styles.metaDot}>·</Text>
                    <View style={styles.currentPill}>
                      <Check size={11} color={colors.brand} strokeWidth={2.75} />
                      <Text style={styles.currentPillText}>Current</Text>
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            {canManage ? (
              <View style={styles.card}>
                <Text style={styles.label}>Workspace name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Workspace name"
                  placeholderTextColor="#94A3B8"
                  testID="workspace-settings-name-input"
                  returnKeyType="done"
                />
              </View>
            ) : null}

            {canManage && joinRequests.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.label}>Pending requests · {joinRequests.length}</Text>
                {joinRequests.map((req, index) => (
                  <View key={req.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.requestRow}>
                      <UserAvatar
                        user={req.user}
                        size={36}
                        radius={18}
                        backgroundColor="#EEF2FF"
                        textColor="#4361EE"
                        fontSize={14}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.requestName} numberOfLines={1}>
                          {req.user.name}
                        </Text>
                        <Text style={styles.requestEmail} numberOfLines={1}>
                          {req.user.email}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => rejectMutation.mutate(req.id)}
                        style={styles.rejectBtn}
                        testID={`reject-request-${req.id}`}
                      >
                        <X size={14} color="#EF4444" />
                      </Pressable>
                      <Pressable
                        onPress={() => approveMutation.mutate(req.id)}
                        style={styles.approveBtn}
                        testID={`approve-request-${req.id}`}
                      >
                        <Check size={14} color="#16A34A" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.card}>
              {isOwner ? (
                <Pressable
                  onPress={() => setStandardsOpen(true)}
                  style={styles.menuRow}
                  testID="workspace-settings-standards"
                >
                  <View style={styles.menuIcon}>
                    <Settings2 size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>Workplace settings</Text>
                    <Text style={styles.menuSub}>Check-ins, goals, and standards</Text>
                  </View>
                  <ChevronRight size={16} color="#C0C7D1" />
                </Pressable>
              ) : null}

              {teams.length > 1 ? (
                <>
                  {isOwner ? <View style={styles.divider} /> : null}
                  <Pressable
                    onPress={() => setSwitchOpen(true)}
                    style={styles.menuRow}
                    testID="workspace-settings-switch"
                  >
                    <View style={[styles.menuIcon, { backgroundColor: "#F1F5F9" }]}>
                      <ArrowLeftRight size={15} color="#64748B" strokeWidth={2.25} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuTitle}>Switch workspace</Text>
                      <Text style={styles.menuSub}>
                        {teams.length} workspace{teams.length === 1 ? "" : "s"} available
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#C0C7D1" />
                  </Pressable>
                </>
              ) : null}

              {!isCurrent ? (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    onPress={() => void switchWorkspace(teamId)}
                    style={styles.menuRow}
                    testID="workspace-settings-make-current"
                  >
                    <View style={[styles.menuIcon, { backgroundColor: colors.brandSoft }]}>
                      <Check size={16} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuTitle}>Use this workspace</Text>
                      <Text style={styles.menuSub}>Make it your current workspace</Text>
                    </View>
                    <ChevronRight size={16} color="#C0C7D1" />
                  </Pressable>
                </>
              ) : null}
            </View>

            {canManage ? (
              <Pressable
                onPress={handleSave}
                disabled={updateMutation.isPending || !name.trim() || !dirty}
                style={[
                  styles.primaryBtn,
                  { backgroundColor: dirty && name.trim() ? colors.brand : "#CBD5E1", marginTop: 8 },
                ]}
                testID="save-workspace-button"
              >
                {updateMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save changes</Text>
                )}
              </Pressable>
            ) : null}

            {isOwner ? (
              <Pressable
                onPress={() => setConfirmingDelete(true)}
                style={styles.dangerOutline}
                testID="delete-workspace-button"
              >
                <Trash2 size={16} color="#EF4444" />
                <Text style={styles.dangerOutlineText}>Delete workspace</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                style={styles.dangerOutline}
                testID="leave-workspace-button"
              >
                {leaveMutation.isPending ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <>
                    <LogOut size={16} color="#EF4444" />
                    <Text style={styles.dangerOutlineText}>Leave workspace</Text>
                  </>
                )}
              </Pressable>
            )}
          </ScrollView>
        </SafeKeyboardAvoidingView>
      )}

      {isOwner ? (
        <WorkplaceStandardsSheet
          visible={standardsOpen}
          teamId={teamId}
          initialStandards={teamStandards ?? mergeWorkplaceStandards(undefined)}
          onClose={() => setStandardsOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["team", teamId] });
            queryClient.invalidateQueries({ queryKey: ["team", teamId, "workplaceStandards"] });
            queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
          }}
        />
      ) : null}

      <SwitchWorkspaceSheet visible={switchOpen} onClose={() => setSwitchOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  topTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#64748B", marginBottom: 16 },
  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 18 },
  photoWrap: { position: "relative" },
  photo: { width: 88, height: 88, borderRadius: 22 },
  photoPlaceholder: {
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F8FAFC",
  },
  hint: { marginTop: 10, fontSize: 12, color: "#94A3B8" },
  heroName: {
    marginTop: 12,
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  metaText: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  metaDot: { color: "#CBD5E1" },
  currentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  currentPillText: { fontSize: 11, fontWeight: "700", color: colors.brand },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F1F5F9",
    padding: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0F172A",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
    marginBottom: 10,
  },
  bodyCopy: { fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 16 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTitle: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  menuSub: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#EEF1F5",
    marginVertical: 4,
    marginLeft: 42,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  requestAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  requestInitial: { fontSize: 13, fontWeight: "700", color: colors.brand },
  requestName: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  requestEmail: { fontSize: 11, color: "#94A3B8", marginTop: 1 },
  rejectBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand,
    minHeight: 48,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  secondaryBtnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  dangerOutline: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#FECACA",
    backgroundColor: "#FFFFFF",
  },
  dangerOutlineText: { color: "#EF4444", fontSize: 14, fontWeight: "700" },
});
