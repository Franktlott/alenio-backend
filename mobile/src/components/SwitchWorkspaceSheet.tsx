import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Check,
  ChevronRight,
  Link2,
  Plus,
  ScanLine,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { useTeamStore } from "@/lib/state/team-store";
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
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
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

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Workspaces"
      subtitle="Switch, join, or create a workspace."
      onClose={onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      sheetStyle={styles.sheet}
      testID="switch-workspace-sheet"
    >
      {isLoading ? (
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
            const busy = switchingId === team.id;
            return (
              <Pressable
                key={team.id}
                onPress={() => void onSelect(team.id)}
                disabled={Boolean(switchingId)}
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
                {busy ? (
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

      {!isLoading ? (
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
  actions: {
    marginTop: 14,
    gap: 10,
  },
});
