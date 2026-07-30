import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronRight, LayoutGrid, Plus } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type TeamWithRole = Team & { role?: string };

/** Quiet workspace picker — compact sheet, no branded chrome. Stays on the current tab. */
export function SwitchWorkspaceSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user && visible,
  });

  const sortedTeams = useMemo(() => {
    // Stable alpha order — don't jump the selected workspace to the top.
    return [...(teams as TeamWithRole[])].sort((a, b) => a.name.localeCompare(b.name));
  }, [teams]);
  const visibleTeams = showAll ? sortedTeams : sortedTeams.slice(0, 4);
  const menuWidth = Math.min(width - 32, 304);

  useEffect(() => {
    if (!visible) setShowAll(false);
  }, [visible]);

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

  const onAddWorkspace = () => {
    onClose();
    router.push({
      pathname: "/onboarding",
      params: { intent: "add" },
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            styles.menu,
            {
              top: insets.top + 50,
              width: menuWidth,
              left: (width - menuWidth) / 2,
            },
          ]}
        >
          <Text style={styles.title}>SWITCH WORKSPACE</Text>

            {isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : teams.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No workspaces yet</Text>
                <Text style={styles.emptyBody}>Create or join one to get started.</Text>
              </View>
            ) : (
              <View style={styles.listCard}>
                <ScrollView
                  bounces={showAll && sortedTeams.length > 6}
                  showsVerticalScrollIndicator={showAll && sortedTeams.length > 6}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  style={styles.listScroll}
                >
                  {visibleTeams.map((team, index) => {
                    const isActive = team.id === activeTeamId;
                    const isBusy = switchingId === team.id;
                    return (
                      <View key={team.id}>
                        {index > 0 ? <View style={styles.divider} /> : null}
                        <Pressable
                          onPress={() => void onSelect(team.id)}
                          disabled={!!switchingId}
                          testID={`switch-workspace-${team.id}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                          style={({ pressed }) => [
                            styles.rowPressable,
                            pressed ? styles.rowPressed : null,
                          ]}
                        >
                          <View style={styles.row}>
                            <WorkspaceTeamAvatar
                              team={team}
                              size={28}
                              active={isActive}
                              radius={8}
                            />
                            <View style={styles.rowText}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {team.name}
                              </Text>
                              <Text style={styles.rowMeta} numberOfLines={1}>
                                {formatTeamRole(team.role)}
                                {isActive ? " · Current" : ""}
                              </Text>
                            </View>
                            {isBusy ? (
                              <ActivityIndicator size="small" color={colors.brand} />
                            ) : isActive ? (
                              <View style={styles.checkWrap}>
                                <Check size={16} color={colors.brand} strokeWidth={2.75} />
                              </View>
                            ) : (
                              <View style={styles.checkSpacer} />
                            )}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {!isLoading ? (
              <>
              <Pressable
                onPress={onAddWorkspace}
                style={({ pressed }) => [styles.addLink, pressed ? styles.addLinkPressed : null]}
                testID="add-workspace-from-switcher"
                accessibilityRole="button"
              >
                <Plus size={14} color={colors.brand} strokeWidth={2.5} />
                <Text style={styles.addLinkText}>Add workspace</Text>
              </Pressable>
              {sortedTeams.length > 4 && !showAll ? (
                <Pressable
                  onPress={() => setShowAll(true)}
                  style={({ pressed }) => [styles.viewAllLink, pressed ? styles.addLinkPressed : null]}
                  testID="view-all-workspaces"
                  accessibilityRole="button"
                >
                  <LayoutGrid size={13} color="#64748B" strokeWidth={2.1} />
                  <Text style={styles.viewAllText}>View all workspaces</Text>
                  <ChevronRight size={13} color="#94A3B8" />
                </Pressable>
              ) : null}
              </>
            ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.10)",
  },
  menu: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6EAF0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  title: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.7,
    marginBottom: 7,
    marginLeft: 2,
  },
  loading: {
    paddingVertical: 32,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
  },
  listCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    overflow: "hidden",
  },
  listScroll: {
    maxHeight: 270,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#F1F5F9",
    marginLeft: 39,
  },
  rowPressable: {
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 2,
    gap: 9,
  },
  rowPressed: {
    backgroundColor: "#F3F4F6",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  rowTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: -0.2,
  },
  rowMeta: {
    fontSize: 9,
    color: "#9CA3AF",
    marginTop: 2,
  },
  checkWrap: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  checkSpacer: {
    width: 18,
    height: 18,
  },
  addLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF1F5",
  },
  addLinkPressed: {
    opacity: 0.6,
  },
  addLinkText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.brand,
  },
  viewAllLink: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF1F5",
  },
  viewAllText: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
  },
});
