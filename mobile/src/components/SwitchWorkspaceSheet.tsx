import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Check,
  ChevronRight,
  KeyRound,
  Plus,
  QrCode,
  ScanLine,
  Share2,
  Settings,
  X,
} from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useTeamStore } from "@/lib/state/team-store";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
} from "@/components/AlenioBottomSheet";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MAX_VISIBLE_WORKSPACES = 5;
const WORKSPACE_ROW_HEIGHT = 76;

function memberLabel(team: Team) {
  const count = team._count?.members;
  if (count == null) return formatTeamRole(team.role);
  return `${formatTeamRole(team.role)}  ·  ${count} Member${count === 1 ? "" : "s"}`;
}

/** Workspace switcher and entry point to workspace management. */
export function SwitchWorkspaceSheet({ visible, onClose }: Props) {
  const { height } = useWindowDimensions();
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [qrTeam, setQrTeam] = useState<Team | null>(null);
  /**
   * The list is capped by a share of the screen as well as by a row count, so
   * a short list can still overflow on a small phone. Only the measurement
   * knows whether it did.
   */
  const [listHeight, setListHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const listOverflows = listContentHeight > listHeight + 1;

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: Boolean(session?.user && visible),
  });

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );
  useEffect(() => {
    if (!visible) setQrTeam(null);
  }, [visible]);

  const onSelect = async (teamId: string) => {
    if (teamId === useTeamStore.getState().activeTeamId) {
      onClose();
      return;
    }
    setSwitchingId(teamId);
    try {
      await switchWorkspace(teamId);
    } finally {
      setSwitchingId((current) => (current === teamId ? null : current));
      onClose();
    }
  };

  const openCreate = () => {
    onClose();
    router.push({
      pathname: "/onboarding",
      params: { intent: "add", mode: "create" },
    });
  };

  const openJoinScanner = () => {
    onClose();
    router.push({
      pathname: "/onboarding",
      params: { intent: "add", mode: "join", action: "scan" },
    });
  };

  const openJoinCode = () => {
    onClose();
    router.push({
      pathname: "/onboarding",
      params: { intent: "add", mode: "join", action: "code", focus: "code" },
    });
  };

  const shareWorkspace = async (team: Team) => {
    const joinUrl = `alenio://join/${team.inviteCode}`;
    try {
      await Share.share({
        title: `Join ${team.name} on Alenio`,
        message: `Join ${team.name} on Alenio with code ${team.inviteCode}: ${joinUrl}`,
      });
    } catch {
      // The native share sheet may reject when dismissed on some platforms.
    }
  };

  const openWorkspaceSettings = (teamId: string) => {
    onClose();
    router.push({
      pathname: "/workspace-settings",
      params: { teamId },
    });
  };

  return (
    <>
      <AlenioBottomSheet
      visible={visible && qrTeam == null}
      title="Switch workspace"
      subtitle="Choose where you want to work."
      onClose={onClose}
      compact
      showCloseButton
      headerRight={
        <Pressable
          onPress={openJoinScanner}
          hitSlop={10}
          style={styles.headerScannerAction}
          accessibilityRole="button"
          accessibilityLabel="Scan workspace QR code"
          testID="switch-workspace-open-scanner"
        >
          <ScanLine size={18} color="#6548E8" strokeWidth={2.25} />
        </Pressable>
      }
      scrollEnabled={false}
      testID="switch-workspace-sheet"
    >
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : teams.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workspaces yet</Text>
          <Text style={styles.emptyBody}>Create a workspace to get started.</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.sectionLabel}>YOUR WORKSPACES</Text>
          <ScrollView
            style={{
              maxHeight: Math.min(
                MAX_VISIBLE_WORKSPACES * WORKSPACE_ROW_HEIGHT,
                Math.round(height * 0.42),
              ),
            }}
            onLayout={(event) =>
              setListHeight(event.nativeEvent.layout.height)
            }
            onContentSizeChange={(_width, contentHeight) =>
              setListContentHeight(contentHeight)
            }
            scrollEnabled={listOverflows}
            showsVerticalScrollIndicator={listOverflows}
            bounces={listOverflows}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.workspaceList}
          >
            {sortedTeams.map((team) => {
              const current = team.id === activeTeamId;
              const busy = switchingId === team.id;
              return (
                <View
                  key={team.id}
                  style={[
                    styles.workspaceRow,
                    current ? styles.workspaceRowCurrent : null,
                  ]}
                >
                    <Pressable
                      onPress={() => void onSelect(team.id)}
                      disabled={Boolean(switchingId)}
                      style={styles.workspaceSwitchAction}
                      accessibilityRole="button"
                      accessibilityState={{ selected: current }}
                      testID={`switch-workspace-${team.id}`}
                    >
                      <WorkspaceTeamAvatar
                        team={team}
                        size={42}
                        radius={11}
                        active={current}
                      />
                      <View style={styles.workspaceText}>
                        <Text style={styles.workspaceName} numberOfLines={1}>
                          {team.name}
                        </Text>
                        <View style={styles.workspaceMetaRow}>
                          <Text style={styles.workspaceMeta} numberOfLines={1}>
                            {memberLabel(team)}
                          </Text>
                        </View>
                        {team.inviteCode ? (
                          <Text style={styles.workspaceCodeText} numberOfLines={1}>
                            <Text style={styles.workspaceCodeLabel}>Code </Text>
                            {team.inviteCode}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {team.inviteCode ? (
                      <Pressable
                        onPress={() => setQrTeam(team)}
                        disabled={Boolean(switchingId)}
                        hitSlop={6}
                        style={styles.workspaceQrAction}
                        accessibilityRole="button"
                        accessibilityLabel={`Show ${team.name} QR code`}
                        testID={`show-workspace-qr-${team.id}`}
                      >
                        <QrCode size={17} color="#7757F6" strokeWidth={2.2} />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => openWorkspaceSettings(team.id)}
                      disabled={Boolean(switchingId)}
                      hitSlop={6}
                      style={styles.workspaceSettingsAction}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${team.name}`}
                      testID={`manage-workspace-${team.id}`}
                    >
                      <Settings size={15} color="#64748B" strokeWidth={2.15} />
                    </Pressable>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.brand} style={styles.rowState} />
                    ) : current ? (
                      <View style={[styles.rowState, styles.currentIcon]}>
                        <Check size={15} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : (
                      <ChevronRight size={17} color="#94A3B8" style={styles.rowState} />
                    )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!isLoading ? (
        <View style={styles.actions}>
          <View style={styles.qrMenuCard}>
            <TouchableOpacity
              onPress={openJoinCode}
              style={styles.qrMenuRow}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Join a workspace with an invite code"
              testID="join-workspace-with-code"
            >
              <View style={[styles.qrMenuIcon, styles.qrActionIconSlate]}>
                <KeyRound size={17} color="#526174" strokeWidth={2.2} />
              </View>
              <View style={styles.qrMenuCopy}>
                <Text style={styles.qrMenuTitle}>Join with invite code</Text>
                <Text style={styles.qrMenuSubtitle} numberOfLines={1}>
                  Enter a code shared by a workspace
                </Text>
              </View>
              <ChevronRight size={16} color="#A3ACBA" strokeWidth={2.1} />
            </TouchableOpacity>

            <View style={styles.qrMenuDivider} />

            <TouchableOpacity
              onPress={openJoinScanner}
              style={styles.qrMenuRow}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityLabel="Join a workspace with a QR code"
              testID="join-workspace-with-qr"
            >
              <View style={[styles.qrMenuIcon, styles.qrActionIconBlue]}>
                <ScanLine size={17} color="#3478F6" strokeWidth={2.2} />
              </View>
              <View style={styles.qrMenuCopy}>
                <Text style={styles.qrMenuTitle}>Join via QR code</Text>
                <Text style={styles.qrMenuSubtitle} numberOfLines={1}>
                  Scan a workspace invitation
                </Text>
              </View>
              <ChevronRight size={16} color="#A3ACBA" strokeWidth={2.1} />
            </TouchableOpacity>
          </View>
          <AlenioSheetOption
            icon={<Plus size={15} color="#FFFFFF" strokeWidth={2.5} />}
            title="Create workspace"
            subtitle="Start a new place for your team"
            onPress={openCreate}
            testID="create-workspace-from-switcher"
          />
        </View>
      ) : null}
      </AlenioBottomSheet>

      <Modal
        visible={visible && qrTeam != null}
        transparent
        animationType="fade"
        onRequestClose={() => setQrTeam(null)}
      >
        <View style={styles.qrModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setQrTeam(null)}
            accessibilityLabel="Close QR code"
          />
          {qrTeam ? (
            <View style={styles.qrModalCard}>
              <Pressable
                onPress={() => setQrTeam(null)}
                style={styles.qrModalClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={18} color="#64748B" strokeWidth={2.2} />
              </Pressable>
              <View style={styles.qrModalIcon}>
                <QrCode size={20} color="#5B43D6" strokeWidth={2.2} />
              </View>
              <Text style={styles.qrModalEyebrow}>WORKSPACE INVITE</Text>
              <Text style={styles.qrModalTitle} numberOfLines={2}>
                {qrTeam.name}
              </Text>
              <Text style={styles.qrModalBody}>
                Ask someone to scan this code with Alenio to request access.
              </Text>
              <View style={styles.qrCodeFrame}>
                <QRCode
                  value={`alenio://join/${qrTeam.inviteCode}`}
                  size={188}
                  color="#111827"
                  backgroundColor="#FFFFFF"
                />
              </View>
              <View style={styles.inviteCodeRow}>
                <Text style={styles.inviteCodeLabel}>Invite code</Text>
                <Text style={styles.inviteCodeValue}>{qrTeam.inviteCode}</Text>
              </View>
              <Pressable
                onPress={() => void shareWorkspace(qrTeam)}
                style={({ pressed }) => [
                  styles.shareButton,
                  pressed ? styles.shareButtonPressed : null,
                ]}
                accessibilityRole="button"
                testID="share-workspace-qr"
              >
                <Share2 size={16} color="#FFFFFF" strokeWidth={2.3} />
                <Text style={styles.shareButtonText}>Share invitation</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerScannerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  sectionLabel: {
    marginBottom: 7,
    paddingHorizontal: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "#7C8798",
  },
  workspaceList: { gap: 8 },
  workspaceRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    backgroundColor: "#FFFFFF",
  },
  workspaceRowCurrent: {
    borderColor: "#E5E3FF",
    backgroundColor: "#F4F3FF",
  },
  workspaceSwitchAction: {
    minHeight: 74,
    paddingLeft: 10,
    paddingVertical: 8,
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  workspaceText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  workspaceMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  workspaceCodeText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.15,
    color: "#6548E8",
  },
  workspaceCodeLabel: { fontWeight: "600", color: "#7C8798" },
  workspaceMeta: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "500",
    color: "#7C8798",
  },
  currentIcon: {
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4963F5",
  },
  rowState: {
    marginLeft: 3,
    marginRight: 10,
    flexShrink: 0,
  },
  workspaceQrAction: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    backgroundColor: "#FFFFFF",
  },
  workspaceSettingsAction: {
    width: 34,
    height: 34,
    marginLeft: 7,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E8F0",
    backgroundColor: "#FFFFFF",
  },
  actions: {
    marginTop: 1,
    gap: 5,
  },
  qrMenuCard: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    backgroundColor: "#FFFFFF",
  },
  qrMenuRow: {
    width: "100%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qrMenuIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  qrActionIconBlue: {
    backgroundColor: "#EAF3FF",
  },
  qrActionIconSlate: {
    backgroundColor: "#F1F5F9",
  },
  qrMenuCopy: {
    flex: 1,
    minWidth: 0,
  },
  qrMenuTitle: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "700",
    color: "#172033",
  },
  qrMenuSubtitle: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 12,
    color: "#8A94A6",
  },
  qrMenuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 49,
    backgroundColor: "#E8EDF3",
  },
  qrModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(15, 23, 42, 0.62)",
  },
  qrModalCard: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 18,
  },
  qrModalClose: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  qrModalIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0EDFF",
  },
  qrModalEyebrow: {
    marginTop: 13,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.25,
    color: "#6D4AE8",
  },
  qrModalTitle: {
    marginTop: 5,
    paddingHorizontal: 20,
    textAlign: "center",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    color: "#111827",
  },
  qrModalBody: {
    maxWidth: 270,
    marginTop: 7,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 17,
    color: "#7C8798",
  },
  qrCodeFrame: {
    marginTop: 18,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E9F2",
    backgroundColor: "#FFFFFF",
    shadowColor: "#334155",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  inviteCodeRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#F7F8FC",
  },
  inviteCodeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8A94A6",
  },
  inviteCodeValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 2.2,
    color: "#27324A",
  },
  shareButton: {
    width: "100%",
    minHeight: 44,
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#4361EE",
  },
  shareButtonPressed: {
    opacity: 0.84,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
