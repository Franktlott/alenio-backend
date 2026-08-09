import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Check,
  ChevronRight,
  Plus,
  Settings,
  X,
} from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const MAX_VISIBLE_WORKSPACES = 5;
const WORKSPACE_ROW_HEIGHT = 62;

function memberLabel(team: Team) {
  const count = team._count?.members;
  if (count == null) return formatTeamRole(team.role);
  return `${formatTeamRole(team.role)}  ·  ${count} Member${count === 1 ? "" : "s"}`;
}

/** Workspace switcher and entry point to workspace management. */
export function SwitchWorkspaceSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

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
    if (switchingId) return;
    if (teamId === activeTeamId) {
      onClose();
      return;
    }
    setSwitchingId(teamId);
    try {
      await switchWorkspace(teamId);
      onClose();
    } finally {
      setSwitchingId(null);
    }
  };

  const openCreate = () => {
    onClose();
    router.push({
      pathname: "/onboarding",
      params: { intent: "add", mode: "create" },
    });
  };

  const openManage = () => {
    onClose();
    router.push("/manage-workspaces");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss workspace menu"
        />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
          testID="switch-workspace-sheet"
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Switch Workspace</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={17} color="#64748B" strokeWidth={2.25} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : teams.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No workspaces yet</Text>
              <Text style={styles.emptyBody}>
                Create a workspace to get started.
              </Text>
            </View>
          ) : (
            <View style={styles.workspaceCard}>
              <ScrollView
                style={{
                  maxHeight: Math.min(
                    MAX_VISIBLE_WORKSPACES * WORKSPACE_ROW_HEIGHT,
                    Math.round(height * 0.42),
                  ),
                }}
                scrollEnabled={sortedTeams.length > MAX_VISIBLE_WORKSPACES}
                showsVerticalScrollIndicator={
                  sortedTeams.length > MAX_VISIBLE_WORKSPACES
                }
                bounces={sortedTeams.length > MAX_VISIBLE_WORKSPACES}
                keyboardShouldPersistTaps="handled"
              >
                {sortedTeams.map((team, index) => {
                  const current = team.id === activeTeamId;
                  const busy = switchingId === team.id;
                  return (
                    <View key={team.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <Pressable
                        onPress={() => void onSelect(team.id)}
                        disabled={Boolean(switchingId)}
                        style={styles.workspaceRow}
                        accessibilityRole="button"
                        accessibilityState={{ selected: current }}
                        testID={`switch-workspace-${team.id}`}
                      >
                        <WorkspaceTeamAvatar
                          team={team}
                          size={38}
                          radius={10}
                          active={current}
                        />
                        <View style={styles.workspaceText}>
                          <Text style={styles.workspaceName} numberOfLines={1}>
                            {team.name}
                          </Text>
                          <Text style={styles.workspaceMeta} numberOfLines={1}>
                            {memberLabel(team)}
                            {current ? "  ·  Current" : ""}
                          </Text>
                        </View>
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.brand} />
                        ) : current ? (
                          <Check
                            size={20}
                            color={colors.brand}
                            strokeWidth={2.6}
                          />
                        ) : (
                          <ChevronRight size={18} color="#94A3B8" />
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {!isLoading ? (
            <View style={styles.actions}>
              <Pressable
                onPress={openCreate}
                style={styles.actionRow}
                accessibilityRole="button"
                testID="create-workspace-from-switcher"
              >
                <View style={[styles.actionIcon, styles.createIcon]}>
                  <Plus size={14} color={colors.brand} strokeWidth={2.5} />
                </View>
                <Text style={[styles.actionText, { color: colors.brand }]}>
                  Create Workspace
                </Text>
              </Pressable>

              <Pressable
                onPress={openManage}
                style={styles.actionRow}
                accessibilityRole="button"
                testID="manage-workspaces-from-switcher"
              >
                <View style={styles.actionIcon}>
                  <Settings size={14} color="#64748B" strokeWidth={2.15} />
                </View>
                <Text style={styles.actionText}>Manage Workspaces</Text>
                <ChevronRight size={15} color="#94A3B8" />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  sheet: {
    width: "100%",
    maxHeight: "84%",
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 18,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
    backgroundColor: "#E2E8F0",
  },
  header: {
    minHeight: 38,
    marginBottom: 8,
    paddingLeft: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.25,
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  pressed: {
    opacity: 0.65,
  },
  loading: {
    minHeight: 100,
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
  workspaceCard: {
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E7ECF3",
    backgroundColor: "#FFFFFF",
  },
  workspaceRow: {
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowPressed: {
    backgroundColor: "#F8FAFC",
  },
  workspaceText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  workspaceMeta: {
    marginTop: 3,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "500",
    color: "#7C8798",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 58,
    backgroundColor: "#E8EDF3",
  },
  actions: {
    marginTop: 9,
    gap: 6,
  },
  actionRow: {
    minHeight: 40,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  actionIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  createIcon: {
    borderWidth: 1.25,
    borderColor: colors.brand,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
  },
  actionText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#334155",
  },
});
