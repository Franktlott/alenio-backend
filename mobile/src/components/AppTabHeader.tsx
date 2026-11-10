import React, { useEffect, useState } from "react";
import { View, Image, StyleSheet, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Video } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { HeaderActionPill } from "@/components/HeaderAddButton";
import { HeaderNotificationsButton } from "@/components/HeaderNotificationsButton";
import { HeaderProfileButton } from "@/components/HeaderProfileButton";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { SwitchWorkspaceSheet } from "@/components/SwitchWorkspaceSheet";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { canOpenWorkspaceTitleMenu } from "@/lib/workspace-management";
import type { Team } from "@/lib/types";
import { useMeetingBannerStore } from "@/lib/state/meeting-banner-store";
import { HEADER_BRAND_COLOR } from "@/lib/header-brand";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { typography } from "@/theme";

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
  notificationsTestID?: string;
  notificationsSize?: "default" | "large";
  /**
   * Optional page title mode (e.g. Chat). When set, replaces the workspace pill
   * with a centered title so tabs can trial a curved-sheet layout.
   */
  title?: string;
  /** Let the centered title open the shared workspace selector. */
  workspaceTitleSelector?: boolean;
  /** Leave the center slot empty while preserving the side actions. */
  hideCenterContent?: boolean;
  /** Extra padding under the header row so a curved sheet can overlap the gradient. */
  overlapPad?: number;
  /** Light headers place the page title beside the Alenio mark. */
  tone?: "brand" | "light";
  /** Renders over a screen-provided backdrop (e.g. a hero photo) instead of a solid bar. */
  transparent?: boolean;
  titlePlacement?: "center" | "leading";
  showWorkspaceSubtitle?: boolean;
};

const HEADER_PAD_TOP = 0;
const HEADER_PAD_BOTTOM = 4;
const TITLE_HEADER_PAD_TOP = 0;
const TITLE_HEADER_PAD_BOTTOM = 3;
/**
 * Portrait leans on the status bar inset for breathing room. Landscape and
 * the Duo's inner display report no top inset at all, which would leave the
 * logo and the avatar touching the edge of the glass.
 */
const MIN_HEADER_PAD_TOP = 10;
const HEADER_PAD_HORIZONTAL = 14;
// 48 leaves the 38pt header icons a touch target past the 44pt iOS minimum.
// A shorter row clips their hitSlop, since iOS drops touches outside a parent.
const ROW_MIN_HEIGHT = 48;
const SIDE_SLOT_MIN = 36;

/**
 * Where the header row ends, for a floating overlay that has to clear it. The
 * header lives inside the tab scene, so an overlay mounted beside the tabs has
 * no other way to find its bottom edge.
 */
export function appTabHeaderHeight(
  topInset: number,
  titleLayoutMode = false,
): number {
  return (
    Math.max(MIN_HEADER_PAD_TOP, topInset - 4) +
    (titleLayoutMode ? TITLE_HEADER_PAD_TOP : HEADER_PAD_TOP) +
    ROW_MIN_HEIGHT +
    (titleLayoutMode ? TITLE_HEADER_PAD_BOTTOM : HEADER_PAD_BOTTOM)
  );
}

export function AppTabHeader({
  topInset,
  leftAction,
  rightAction,
  testID,
  showNotifications = true,
  notificationsTestID,
  notificationsSize = "large",
  title,
  workspaceTitleSelector = false,
  hideCenterContent = false,
  overlapPad = 0,
  tone = "light",
  transparent = false,
  titlePlacement = "leading",
  showWorkspaceSubtitle = false,
}: Props) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const [meetingNow, setMeetingNow] = useState(Date.now());
  const cluster = useStatusClusterInset();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const dismissedMeetingIds = useMeetingBannerStore(
    (state) => state.dismissedMeetingIds,
  );
  const meetingSnapshots = useMeetingBannerStore(
    (state) => state.meetingSnapshots,
  );
  const restoreAllDismissed = useMeetingBannerStore(
    (state) => state.restoreAllDismissed,
  );
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 1000 * 60 * 2,
  });
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  useEffect(() => {
    if (dismissedMeetingIds.length === 0) return;
    setMeetingNow(Date.now());
    const interval = setInterval(() => setMeetingNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [dismissedMeetingIds.length]);
  const dismissedActiveMeeting = dismissedMeetingIds
    .map((meetingId) => meetingSnapshots[meetingId])
    .find((meeting) => {
      if (!meeting) return false;
      const startMs = new Date(meeting.event.startDate).getTime();
      const endMs = meeting.event.endDate
        ? new Date(meeting.event.endDate).getTime()
        : startMs + 60 * 60 * 1000;
      return startMs - meetingNow <= 15 * 60 * 1000 && meetingNow < endMs;
    });
  // With no workspace the header names the account, not an absent workspace.
  const workspaceLabel =
    activeTeam?.name ?? (teams.length === 0 ? "Alenio" : "Workspace");
  const canSwitch = teams.length > 1;
  const canOpenTitleMenu = canOpenWorkspaceTitleMenu({
    enabled: workspaceTitleSelector,
    teamCount: teams.length,
    activeRole: activeTeam?.role,
  });
  const pageTitleMode = Boolean(title?.trim());
  const titleLayoutMode = pageTitleMode || hideCenterContent;
  const titleControl = pageTitleMode ? (
    <Pressable
      onPress={() => setSwitchOpen(true)}
      disabled={!canOpenTitleMenu}
      style={({ pressed }) => [
        styles.titleBlock,
        titlePlacement === "leading" ? styles.titleBlockLeading : null,
        pressed ? styles.titleBlockPressed : null,
      ]}
      accessibilityRole={canOpenTitleMenu ? "button" : undefined}
      accessibilityLabel={
        canOpenTitleMenu ? `Open workspace menu. Current: ${title}` : undefined
      }
    >
      <View
        style={[
          styles.titleLine,
          titlePlacement === "leading" ? styles.titleLineLeading : null,
        ]}
      >
        <Text
          style={[
            styles.pageTitle,
            tone === "light" ? styles.pageTitleLight : null,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {canOpenTitleMenu ? (
          <ChevronDown
            size={14}
            color={tone === "light" ? "#64748B" : "rgba(255,255,255,0.92)"}
            strokeWidth={2.5}
          />
        ) : null}
      </View>
      {showWorkspaceSubtitle && activeTeam ? (
        <Text
          style={[
            styles.workspaceSubtitle,
            tone === "light" ? styles.workspaceSubtitleLight : null,
          ]}
          numberOfLines={1}
        >
          {activeTeam.name}
        </Text>
      ) : null}
    </Pressable>
  ) : null;

  const headerPad = {
    paddingTop:
      Math.max(MIN_HEADER_PAD_TOP, topInset - 4) +
      (titleLayoutMode ? TITLE_HEADER_PAD_TOP : HEADER_PAD_TOP),
    paddingBottom:
      (titleLayoutMode ? TITLE_HEADER_PAD_BOTTOM : HEADER_PAD_BOTTOM) +
      Math.max(0, overlapPad),
    /**
     * Keep the row clear of whatever the display curves or the system bar
     * took. The rail's edge is already offset by the tab layout, so only the
     * opposite edge needs the inset added here.
     */
    paddingLeft: HEADER_PAD_HORIZONTAL + cluster.left,
    paddingRight: HEADER_PAD_HORIZONTAL + cluster.right,
  };
  return (
    <>
      <View
        style={[
          styles.header,
          tone === "light" ? styles.headerLight : null,
          transparent ? styles.headerTransparent : null,
          headerPad,
        ]}
        testID={testID}
      >
        <View
          style={[styles.row, titleLayoutMode ? styles.rowTitleMode : null]}
        >
          <View
            style={[
              styles.sideSlot,
              styles.sideSlotStart,
              titlePlacement === "leading" ? styles.sideSlotLeadingTitle : null,
            ]}
          >
            {leftAction ?? (
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={styles.brandIcon}
                resizeMode="contain"
              />
            )}
            {titlePlacement === "leading" && !hideCenterContent
              ? titleControl
              : null}
          </View>

          {titlePlacement === "leading" || hideCenterContent ? (
            <View style={styles.emptyTitleBlock} />
          ) : pageTitleMode ? (
            titleControl
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
                <Text
                  style={styles.workspaceName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {workspaceLabel}
                </Text>
                {canSwitch ? (
                  <ChevronDown
                    size={12}
                    color="rgba(255,255,255,0.92)"
                    strokeWidth={2.5}
                  />
                ) : null}
              </View>
            </Pressable>
          )}

          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            {dismissedActiveMeeting ? (
              <Pressable
                onPress={() => restoreAllDismissed()}
                style={styles.meetingRecallButton}
                accessibilityRole="button"
                accessibilityLabel={`Show meeting: ${dismissedActiveMeeting.event.title}`}
                testID="header-dismissed-meeting-button"
              >
                <LinearGradient
                  colors={["#0F172A", "#1E1B4B"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.meetingRecallGradient}
                >
                  <Video size={14} color="#FFFFFF" strokeWidth={2.2} />
                  <View style={styles.meetingLiveDot} />
                </LinearGradient>
              </Pressable>
            ) : null}
            {rightAction || showNotifications ? (
              <HeaderActionPill tone={tone}>
                {rightAction ?? null}
                {showNotifications ? (
                  <HeaderNotificationsButton
                    testID={notificationsTestID}
                    tone={tone}
                    size={notificationsSize}
                  />
                ) : null}
              </HeaderActionPill>
            ) : null}
            <HeaderProfileButton tone={tone} />
          </View>
        </View>
      </View>

      <SwitchWorkspaceSheet
        visible={switchOpen}
        onClose={() => setSwitchOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: HEADER_BRAND_COLOR,
  },
  headerLight: {
    backgroundColor: "#FFFFFF",
  },
  headerTransparent: {
    backgroundColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: ROW_MIN_HEIGHT,
  },
  rowTitleMode: {
    alignItems: "center",
    height: ROW_MIN_HEIGHT,
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
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    gap: 12,
  },
  meetingRecallButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#33218A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 4,
  },
  meetingRecallGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  meetingLiveDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
    borderWidth: 1,
    borderColor: "#0F172A",
  },
  sideSlotLeadingTitle: {
    flex: 2,
    gap: 10,
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
  titleBlockLeading: {
    alignItems: "flex-start",
    paddingHorizontal: 0,
  },
  emptyTitleBlock: {
    width: 0,
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
  titleLineLeading: {
    justifyContent: "flex-start",
  },
  pageTitle: {
    ...typography.pageTitle,
    color: "#FFFFFF",
    lineHeight: 21,
  },
  pageTitleLight: {
    color: "#18213A",
  },
  workspaceSubtitle: {
    marginTop: 1,
    maxWidth: 180,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
  },
  workspaceSubtitleLight: {
    color: "#7A8599",
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
