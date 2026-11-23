import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { toast } from "burnt";
import {
  Check,
  ChevronRight,
  Link2,
  LogOut,
  Plus,
  ScanLine,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useTeamStore } from "@/lib/state/team-store";
import { applyTeamRemovedFromAccount } from "@/lib/workspace-switch";
import { workspaceManagementCapabilities } from "@/lib/workspace-management";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import {
  AlenioList,
  AlenioListRow,
  Button,
  buttonInk,
  IconTile,
  tintInk,
} from "@/components/ui";
import { elevation, palette, premiumType, tints } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MAX_VISIBLE_WORKSPACES = 5;
const WORKSPACE_ROW_HEIGHT = 64;

function memberLabel(team: Team) {
  const count = team._count?.members;
  if (count == null) return formatTeamRole(team.role);
  return `${formatTeamRole(team.role)} · ${count} member${count === 1 ? "" : "s"}`;
}

/** Workspace switcher — pick a place to work, or join / create one. */
export function SwitchWorkspaceSheet({ visible, onClose }: Props) {
  const { height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<Team | null>(null);
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
    if (!visible) setLeaveTarget(null);
  }, [visible]);

  const leaveMutation = useMutation({
    mutationFn: (teamId: string) =>
      api.delete(`/api/teams/${encodeURIComponent(teamId)}/leave`),
    onMutate: (teamId) => {
      setLeavingId(teamId);
    },
    onSuccess: async (_data, teamId) => {
      setLeaveTarget(null);
      await applyTeamRemovedFromAccount(
        teamId,
        activeTeamId,
        setActiveTeamId,
        queryClient,
      );
      toast({ title: "Left workspace", preset: "done" });
      onClose();
    },
    onError: () => {
      toast({ title: "Couldn’t leave workspace", preset: "error" });
    },
    onSettled: () => {
      setLeavingId(null);
    },
  });

  const onSelect = async (teamId: string) => {
    if (leavingId || leaveMutation.isPending || leaveTarget) return;
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

  const askToLeave = (team: Team) => {
    if (leavingId || leaveMutation.isPending || switchingId) return;
    setLeaveTarget(team);
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

  const handleClose = () => {
    if (leaveMutation.isPending) return;
    if (leaveTarget) {
      setLeaveTarget(null);
      return;
    }
    onClose();
  };

  return (
    <AlenioBottomSheet
      visible={visible}
      title={leaveTarget ? "Leave workspace?" : "Workspaces"}
      subtitle={
        leaveTarget
          ? "This removes your access to this team’s work."
          : "Switch, join, or create a workspace."
      }
      onClose={handleClose}
      compact
      showCloseButton={!leaveMutation.isPending}
      scrollEnabled={false}
      sheetStyle={styles.sheet}
      testID={
        leaveTarget ? "leave-workspace-confirm-sheet" : "switch-workspace-sheet"
      }
    >
      {leaveTarget ? (
        <View style={styles.leaveConfirm} testID="leave-workspace-confirm">
          <View style={styles.leaveHero}>
            <WorkspaceTeamAvatar
              team={leaveTarget}
              size={52}
              radius={14}
              active={leaveTarget.id === activeTeamId}
            />
            <View style={styles.leaveHeroCopy}>
              <Text style={styles.leaveHeroName} numberOfLines={2}>
                {leaveTarget.name}
              </Text>
              <Text style={styles.leaveHeroMeta} numberOfLines={1}>
                {memberLabel(leaveTarget)}
              </Text>
            </View>
          </View>

          <View style={styles.leaveDetails}>
            <Text style={styles.leaveDetailLine}>
              You’ll lose access to tasks, goals, and check-ins here.
            </Text>
            <Text style={styles.leaveDetailLine}>
              Your Alenio account, chats, and connections stay with you.
            </Text>
          </View>

          <View style={styles.leaveActions}>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              label="Stay"
              disabled={leaveMutation.isPending}
              onPress={() => setLeaveTarget(null)}
              style={styles.leaveActionBtn}
              testID="leave-workspace-cancel"
            />
            <Button
              variant="destructive"
              size="lg"
              fullWidth
              label="Leave"
              loading={leaveMutation.isPending}
              disabled={leaveMutation.isPending}
              icon={
                leaveMutation.isPending ? undefined : (
                  <LogOut size={15} color={buttonInk("destructive")} strokeWidth={2.3} />
                )
              }
              onPress={() => leaveMutation.mutate(leaveTarget.id)}
              style={styles.leaveActionBtn}
              testID="leave-workspace-confirm-button"
            />
          </View>
        </View>
      ) : isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.violet} />
        </View>
      ) : teams.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No workspaces yet</Text>
          <Text style={styles.emptyBody}>Create one to get started with your team.</Text>
        </View>
      ) : (
        <ScrollView
          style={{
            maxHeight: Math.min(
              MAX_VISIBLE_WORKSPACES * WORKSPACE_ROW_HEIGHT,
              Math.round(height * 0.42),
            ),
          }}
          onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}
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
            const busy = switchingId === team.id || leavingId === team.id;
            const canLeave = workspaceManagementCapabilities(team.role).canLeave;
            return (
              <Pressable
                key={team.id}
                onPress={() => void onSelect(team.id)}
                disabled={Boolean(switchingId || leavingId)}
                style={[styles.workspaceRow, current ? styles.workspaceRowCurrent : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                testID={`switch-workspace-${team.id}`}
              >
                <WorkspaceTeamAvatar
                  team={team}
                  size={40}
                  radius={12}
                  active={current}
                />
                <View style={styles.workspaceText}>
                  <Text style={styles.workspaceName} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <Text style={styles.workspaceMeta} numberOfLines={1}>
                    {memberLabel(team)}
                  </Text>
                </View>
                {canLeave ? (
                  <Pressable
                    onPress={(event) => {
                      event.stopPropagation?.();
                      askToLeave(team);
                    }}
                    hitSlop={8}
                    disabled={Boolean(switchingId || leavingId)}
                    style={styles.leaveButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Leave ${team.name}`}
                    testID={`leave-workspace-${team.id}`}
                  >
                    {leavingId === team.id ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <LogOut size={15} color="#DC2626" strokeWidth={2.2} />
                    )}
                  </Pressable>
                ) : null}
                {busy && leavingId !== team.id ? (
                  <ActivityIndicator size="small" color={palette.violet} />
                ) : current ? (
                  <View style={styles.currentIcon}>
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : (
                  <ChevronRight size={16} color={palette.inkMuted} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!isLoading && !leaveTarget ? (
        <View style={styles.actions}>
          <AlenioList>
            <AlenioListRow
              leading={
                <IconTile tint="lavender">
                  <Link2 size={16} color={tintInk("lavender")} strokeWidth={2.2} />
                </IconTile>
              }
              title="Join with a code"
              subtitle="Enter an invite from a teammate"
              onPress={openJoinCode}
              chevron
              accessibilityLabel="Join a workspace with an invite code"
              testID="join-workspace-with-code"
            />
            <AlenioListRow
              leading={
                <IconTile tint="lavender">
                  <ScanLine size={16} color={tintInk("lavender")} strokeWidth={2.2} />
                </IconTile>
              }
              title="Scan a QR code"
              subtitle="Join from someone’s invite"
              onPress={openJoinScanner}
              chevron
              accessibilityLabel="Join a workspace with a QR code"
              testID="join-workspace-with-qr"
            />
          </AlenioList>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            label="Create a workspace"
            icon={<Plus size={16} color={buttonInk("primary")} strokeWidth={2.5} />}
            onPress={openCreate}
            testID="create-workspace-from-switcher"
          />
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: palette.page,
  },
  loading: {
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingVertical: 22,
    alignItems: "center",
  },
  emptyTitle: {
    ...premiumType.rowTitle,
  },
  emptyBody: {
    marginTop: 4,
    ...premiumType.supporting,
    textAlign: "center",
  },
  workspaceList: {
    gap: 8,
  },
  workspaceRow: {
    ...elevation.card,
    minHeight: WORKSPACE_ROW_HEIGHT,
    paddingLeft: 10,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    shadowOpacity: 0.07,
  },
  workspaceRowCurrent: {
    borderColor: "rgba(109, 40, 217, 0.18)",
    backgroundColor: tints.lavender.bg,
  },
  workspaceText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: palette.ink,
  },
  workspaceMeta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
    color: palette.inkMuted,
  },
  currentIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.violet,
  },
  leaveButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  leaveConfirm: {
    gap: 16,
    paddingBottom: 4,
  },
  leaveHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  leaveHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  leaveHeroName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: palette.ink,
  },
  leaveHeroMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: palette.inkMuted,
  },
  leaveDetails: {
    gap: 6,
    paddingHorizontal: 2,
  },
  leaveDetailLine: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    color: "#475569",
  },
  leaveActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  leaveActionBtn: {
    flex: 1,
  },
  actions: {
    marginTop: 14,
    gap: 10,
  },
});
