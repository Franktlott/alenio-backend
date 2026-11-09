import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import { ChevronRight, Video } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appTabHeaderHeight } from "@/components/AppTabHeader";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { formatEventTimeRange } from "@/lib/format-event-time";
import { useMeetingBannerStore } from "@/lib/state/meeting-banner-store";
import { useTeamStore } from "@/lib/state/team-store";
import { videoCallHref } from "@/lib/meeting-navigation";
import {
  isInVideoMeetingBannerWindow,
  rankMeetingsForBanner,
} from "@/lib/video-meeting-join";
import type { CalendarEvent, Team } from "@/lib/types";

const alenioIcon = require("@/assets/alenio-icon.png");

/**
 * A notification, not a page: past this the title and the Join button drift to
 * opposite ends of the screen. iPadOS keeps its own banners about this wide.
 */
const BANNER_MAX_WIDTH = 460;
/** Clearance from the edge of the safe area, or from the rail beside it. */
const BANNER_EDGE_GAP = 12;
/** Sits under the header rather than over the workspace controls. */
const BANNER_HEADER_GAP = 8;

type UpcomingMeeting = {
  event: {
    id: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    teamId: string;
    isOneOnOne?: boolean;
    oneOnOneMemberUserId?: string | null;
    oneOnOneTemplateId?: string | null;
  };
  teamName: string;
  userRole: string;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds < 10 ? "0" : ""}${seconds}s`;
}

function LiveDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={dot.wrap}>
      <Animated.View style={[dot.ring, ringStyle]} />
      <View style={dot.core} />
    </View>
  );
}

const dot = StyleSheet.create({
  wrap: {
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(74,222,128,0.4)",
  },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
});

export default function MeetingBanner() {
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const { showRail, railEdge, railWidth, iconRailEdge, iconRailWidth } =
    useAdaptiveLayout();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const [now, setNow] = useState(Date.now());
  const [preferredMeetingId, setPreferredMeetingId] = useState<string | null>(
    null,
  );
  const dismissedMeetingIds = useMeetingBannerStore(
    (state) => state.dismissedMeetingIds,
  );
  const meetingSnapshots = useMeetingBannerStore(
    (state) => state.meetingSnapshots,
  );
  const dismissMeeting = useMeetingBannerStore((state) => state.dismissMeeting);
  const forgetMeeting = useMeetingBannerStore((state) => state.forgetMeeting);
  const restoreAllDismissed = useMeetingBannerStore(
    (state) => state.restoreAllDismissed,
  );

  const translateY = useSharedValue(-140);
  const opacity = useSharedValue(0);
  const joinScale = useSharedValue(1);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: meetings = [], isSuccess: meetingsLoaded } = useQuery<
    UpcomingMeeting[]
  >({
    queryKey: ["upcoming-video-meetings"],
    queryFn: () => api.get<UpcomingMeeting[]>("/api/video/upcoming"),
    enabled: !!session?.user,
    refetchInterval: 30000,
    staleTime: 20000,
  });
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });
  const { data: activeTeamEvents = [], isSuccess: activeTeamEventsLoaded } =
    useQuery<CalendarEvent[]>({
      queryKey: ["calendar-events", activeTeamId],
      queryFn: () =>
        api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
      enabled: !!session?.user && !!activeTeamId,
      staleTime: 5000,
    });

  useEffect(() => {
    if (!meetingsLoaded) return;
    const serverMeetingIds = new Set(
      meetings.map((meeting) => meeting.event.id),
    );
    if (activeTeamEventsLoaded) {
      for (const event of activeTeamEvents) {
        if (event.isVideoMeeting) serverMeetingIds.add(event.id);
      }
    }

    const checkedAt = Date.now();
    for (const snapshot of Object.values(meetingSnapshots)) {
      const startMs = new Date(snapshot.event.startDate).getTime();
      const isInUpcomingApiWindow =
        startMs >= checkedAt - 30 * 60 * 1000 &&
        startMs <= checkedAt + 60 * 60 * 1000;
      const activeWorkspaceWasChecked =
        activeTeamEventsLoaded && snapshot.event.teamId === activeTeamId;
      if (
        (isInUpcomingApiWindow || activeWorkspaceWasChecked) &&
        !serverMeetingIds.has(snapshot.event.id)
      ) {
        forgetMeeting(snapshot.event.id);
      }
    }
  }, [
    activeTeamEvents,
    activeTeamEventsLoaded,
    activeTeamId,
    forgetMeeting,
    meetingSnapshots,
    meetings,
    meetingsLoaded,
  ]);

  const meetingsById = new Map<string, UpcomingMeeting>();
  for (const meeting of Object.values(meetingSnapshots)) {
    meetingsById.set(meeting.event.id, meeting);
  }
  const activeTeam = teams.find((team) => team.id === activeTeamId);
  for (const event of activeTeamEvents) {
    if (!event.isVideoMeeting) continue;
    meetingsById.set(event.id, {
      event: {
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        teamId: event.teamId,
        isOneOnOne: event.isOneOnOne,
        oneOnOneMemberUserId: event.oneOnOneMemberUserId,
        oneOnOneTemplateId: event.oneOnOneTemplateId,
      },
      teamName: activeTeam?.name ?? "Workspace",
      userRole: activeTeam?.role ?? "member",
    });
  }
  for (const meeting of meetings) {
    meetingsById.set(meeting.event.id, meeting);
  }

  const rankedMeetings = rankMeetingsForBanner(
    Array.from(meetingsById.values()),
    now,
    dismissedMeetingIds,
  );
  const activeIndex = Math.max(
    0,
    rankedMeetings.findIndex(
      (meeting) => meeting.event.id === preferredMeetingId,
    ),
  );
  const activeMeeting = rankedMeetings[activeIndex] ?? rankedMeetings[0];

  const visible = !!activeMeeting;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 300 });
      // Pulse the join button
      joinScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        false,
      );
    } else {
      translateY.value = withTiming(-140, { duration: 280 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const joinBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: joinScale.value }],
  }));

  if (!activeMeeting) return null;

  const { event, teamName, userRole } = activeMeeting;
  const isLeader = userRole === "owner" || userRole === "team_leader";
  const startMs = new Date(event.startDate).getTime();
  const msUntilStart = startMs - now;
  const hasStarted = msUntilStart <= 0;
  const showJoin = isLeader || msUntilStart <= 5 * 60 * 1000;
  const isUrgent = msUntilStart <= 5 * 60 * 1000;

  const overlapCount = rankedMeetings.length;
  const lastHiddenMeetingId = [...dismissedMeetingIds]
    .reverse()
    .find((meetingId) => {
      const snapshot = meetingSnapshots[meetingId];
      return (
        !!snapshot &&
        isInVideoMeetingBannerWindow(
          snapshot.event.startDate,
          snapshot.event.endDate,
          now,
        )
      );
    });
  const canRestoreHidden = !!lastHiddenMeetingId;

  const handleJoin = () => {
    router.push(videoCallHref(event.id, event.title));
  };

  const showNextMeeting = () => {
    if (overlapCount < 2) return;
    const next = rankedMeetings[(activeIndex + 1) % overlapCount];
    setPreferredMeetingId(next.event.id);
  };

  const restoreHiddenMeetings = () => {
    if (!lastHiddenMeetingId) return;
    setPreferredMeetingId(lastHiddenMeetingId);
    restoreAllDismissed();
  };

  /** The rail owns one edge, so the card starts past it rather than under it. */
  const railOnLeft = iconRailEdge === "left" || (showRail && railEdge === "left");
  const railOnRight = iconRailEdge === "right" || (showRail && railEdge === "right");
  const railSpaceLeft = iconRailEdge === "left" ? iconRailWidth : railOnLeft ? railWidth : 0;
  const railSpaceRight = iconRailEdge === "right" ? iconRailWidth : railOnRight ? railWidth : 0;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: appTabHeaderHeight(insets.top) + BANNER_HEADER_GAP,
          left: (iconRailEdge === "left" ? 0 : insets.left) + BANNER_EDGE_GAP + railSpaceLeft,
          right: (iconRailEdge === "right" ? 0 : insets.right) + BANNER_EDGE_GAP + railSpaceRight,
        },
        bannerStyle,
      ]}
      testID="meeting-banner"
    >
      <View style={styles.shell}>
        <LinearGradient
          colors={["#0F172A", "#1E1B4B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Left accent bar */}
          <View style={styles.accentBar} />

          {/* Icon — tap to bring dismissed meetings back onto the flipper */}
          <Pressable
            onPress={restoreHiddenMeetings}
            disabled={!canRestoreHidden}
            style={styles.iconCol}
            accessibilityRole={canRestoreHidden ? "button" : undefined}
            accessibilityLabel={
              canRestoreHidden ? "Show hidden meetings" : undefined
            }
            testID="banner-restore-meetings"
          >
            <Image source={alenioIcon} style={styles.icon} />
          </Pressable>

          {/* Content */}
          <View style={styles.content}>
            <View style={styles.topRow}>
              <LiveDot />
              <Text style={styles.label}>
                {hasStarted ? "In progress" : "Upcoming meeting"}
              </Text>
              {overlapCount > 1 ? (
                <Pressable
                  onPress={showNextMeeting}
                  hitSlop={8}
                  style={styles.switcher}
                  testID="banner-next-meeting"
                  accessibilityRole="button"
                  accessibilityLabel={`Show next meeting, ${activeIndex + 1} of ${overlapCount}`}
                >
                  <Text style={styles.switcherText}>
                    {activeIndex + 1} of {overlapCount}
                  </Text>
                  <ChevronRight size={12} color="rgba(255,255,255,0.55)" />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {event.title}
            </Text>
            <Text style={styles.meta}>
              {formatEventTimeRange(event.startDate, event.endDate)}
              {` · ${teamName}`}
              {!hasStarted ? ` · ${formatCountdown(msUntilStart)}` : ""}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {showJoin ? (
              <Animated.View style={joinBtnStyle}>
                <Pressable
                  onPress={handleJoin}
                  style={[styles.joinBtn, isUrgent && styles.joinBtnUrgent]}
                  testID="banner-join-button"
                >
                  <Video size={13} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={styles.joinText}>Join</Text>
                </Pressable>
              </Animated.View>
            ) : (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownNum}>
                  {formatCountdown(msUntilStart)}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => dismissMeeting(activeMeeting)}
              style={styles.dismissBtn}
              testID="banner-dismiss-button"
            >
              <Text style={styles.dismissX}>✕</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Spans the free width so the card inside it can centre on any screen. */
  wrapper: {
    position: "absolute",
    zIndex: 9999,
    alignItems: "center",
  },
  shell: {
    width: "100%",
    maxWidth: BANNER_MAX_WIDTH,
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#4361EE",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingRight: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  accentBar: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: "#4361EE",
    borderRadius: 2,
    marginRight: 10,
    marginLeft: 0,
  },
  iconCol: {
    marginRight: 10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 9,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    gap: 1,
  },
  switcherText: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 10,
  },
  joinBtn: {
    backgroundColor: "#4361EE",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    shadowColor: "#4361EE",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  joinBtnUrgent: {
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
  },
  joinText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  countdownBox: {
    backgroundColor: "rgba(67,97,238,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(67,97,238,0.35)",
  },
  countdownNum: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  dismissX: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "600",
  },
});
