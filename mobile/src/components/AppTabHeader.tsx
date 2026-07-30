import React, { useState } from "react";
import { View, Image, StyleSheet, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react-native";
import { HeaderNotificationsButton } from "@/components/HeaderNotificationsButton";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { SwitchWorkspaceSheet } from "@/components/SwitchWorkspaceSheet";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

type Props = {
  topInset: number;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  testID?: string;
  /** Kept for compatibility — all tab headers use the same compact height. */
  compact?: boolean;
  /** leading = logo left (default, all tabs). centered = logo in middle. */
  layout?: "centered" | "leading";
  /** Show the shared notifications bell (default true). */
  showNotifications?: boolean;
  /**
   * Optional page title mode (e.g. Chat). When set, replaces the workspace pill
   * with a centered title + subtitle so tabs can trial a curved-sheet layout.
   */
  title?: string;
  subtitle?: string;
  /** Let the centered title open the shared workspace selector. */
  workspaceTitleSelector?: boolean;
  /** Extra padding under the header row so a curved sheet can overlap the gradient. */
  overlapPad?: number;
};

const HEADER_PAD_TOP = 2;
const HEADER_PAD_BOTTOM = 4;
const TITLE_HEADER_PAD_TOP = 2;
const TITLE_HEADER_PAD_BOTTOM = 5;
const ROW_MIN_HEIGHT = 30;
const SIDE_SLOT_MIN = 36;

export function AppTabHeader({
  topInset,
  leftAction,
  rightAction,
  testID,
  showNotifications = true,
  title,
  subtitle,
  workspaceTitleSelector = false,
  overlapPad = 0,
}: Props) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 1000 * 60 * 2,
  });
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const workspaceLabel = activeTeam?.name ?? "Workspace";
  const canSwitch = teams.length > 1;
  const pageTitleMode = Boolean(title?.trim());

  return (
    <>
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          {
            paddingTop:
              topInset + (pageTitleMode ? TITLE_HEADER_PAD_TOP : HEADER_PAD_TOP),
            paddingBottom:
              (pageTitleMode ? TITLE_HEADER_PAD_BOTTOM : HEADER_PAD_BOTTOM) +
              Math.max(0, overlapPad),
          },
        ]}
        testID={testID}
      >
        <View style={[styles.row, pageTitleMode ? styles.rowTitleMode : null]}>
          <View style={[styles.sideSlot, styles.sideSlotStart]}>
            {leftAction ?? (
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={styles.brandIcon}
                resizeMode="contain"
              />
            )}
          </View>

          {pageTitleMode ? (
            <Pressable
              onPress={() => setSwitchOpen(true)}
              disabled={!workspaceTitleSelector || !canSwitch}
              style={({ pressed }) => [
                styles.titleBlock,
                pressed ? styles.titleBlockPressed : null,
              ]}
              accessibilityRole={workspaceTitleSelector && canSwitch ? "button" : undefined}
              accessibilityLabel={
                workspaceTitleSelector && canSwitch
                  ? `Switch workspace. Current: ${title}`
                  : undefined
              }
            >
              <View style={styles.titleLine}>
                <Text style={styles.pageTitle} numberOfLines={1}>
                  {title}
                </Text>
                {workspaceTitleSelector && canSwitch ? (
                  <ChevronDown
                    size={14}
                    color="rgba(255,255,255,0.92)"
                    strokeWidth={2.5}
                  />
                ) : null}
              </View>
              {subtitle ? (
                <Text style={styles.pageSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setSwitchOpen(true)}
              style={({ pressed }) => [
                styles.workspaceSelector,
                pressed ? styles.workspaceSelectorPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                canSwitch
                  ? `Switch workspace. Current: ${workspaceLabel}`
                  : `Workspace ${workspaceLabel}`
              }
              testID="header-workspace-selector"
            >
              <View style={styles.workspaceInner}>
                {activeTeam ? (
                  <WorkspaceTeamAvatar
                    team={activeTeam}
                    size={16}
                    radius={5}
                    backgroundColor="rgba(255,255,255,0.95)"
                    textColor="#4361EE"
                    borderColor="rgba(255,255,255,0.5)"
                  />
                ) : null}
                <Text style={styles.workspaceName} numberOfLines={1} ellipsizeMode="tail">
                  {workspaceLabel}
                </Text>
                {canSwitch ? (
                  <ChevronDown size={12} color="rgba(255,255,255,0.92)" strokeWidth={2.5} />
                ) : null}
              </View>
            </Pressable>
          )}

          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            {rightAction ?? null}
            {showNotifications ? <HeaderNotificationsButton /> : null}
          </View>
        </View>
      </LinearGradient>

      <SwitchWorkspaceSheet visible={switchOpen} onClose={() => setSwitchOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingHorizontal: 14,
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: ROW_MIN_HEIGHT,
  },
  rowTitleMode: {
    alignItems: "center",
    minHeight: 44,
  },
  sideSlot: {
    flex: 1,
    minWidth: SIDE_SLOT_MIN,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sideSlotStart: {
    justifyContent: "flex-start",
  },
  sideSlotEnd: {
    justifyContent: "flex-end",
  },
  brandIcon: {
    width: 30,
    height: 30,
  },
  titleBlock: {
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    maxWidth: 220,
  },
  titleBlockPressed: {
    opacity: 0.78,
  },
  titleLine: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  pageTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  pageSubtitle: {
    marginTop: 1,
    color: "rgba(255,255,255,0.82)",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: -0.1,
    lineHeight: 12,
  },
  workspaceSelector: {
    flexShrink: 1,
    maxWidth: 200,
    minHeight: 26,
    paddingLeft: 5,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.32)",
    justifyContent: "center",
  },
  workspaceSelectorPressed: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderColor: "rgba(255,255,255,0.45)",
  },
  workspaceInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  workspaceName: {
    flexShrink: 1,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
});
