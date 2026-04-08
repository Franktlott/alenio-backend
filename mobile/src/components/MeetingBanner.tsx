import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withRepeat, withSequence,
} from "react-native-reanimated";
import { Video } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const alenioIcon = require("@/assets/alenio-icon.png");

type UpcomingMeeting = {
  event: {
    id: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    teamId: string;
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
      withSequence(withTiming(1.8, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
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
  wrap: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute", width: 10, height: 10, borderRadius: 5,
    backgroundColor: "rgba(74,222,128,0.4)",
  },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
});

export default function MeetingBanner() {
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const translateY = useSharedValue(-140);
  const opacity = useSharedValue(0);
  const joinScale = useSharedValue(1);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: meetings = [] } = useQuery<UpcomingMeeting[]>({
    queryKey: ["upcoming-video-meetings"],
    queryFn: () => api.get<UpcomingMeeting[]>("/api/video/upcoming"),
    enabled: !!session?.user,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const activeMeeting = meetings.find(m => {
    if (dismissed.has(m.event.id)) return false;
    const startMs = new Date(m.event.startDate).getTime();
    const endMs = m.event.endDate ? new Date(m.event.endDate).getTime() : startMs + 60 * 60 * 1000;
    const msUntilStart = startMs - now;
    return msUntilStart <= 15 * 60 * 1000 && now < endMs;
  });

  const visible = !!activeMeeting;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 300 });
      // Pulse the join button
      joinScale.value = withRepeat(
        withSequence(withTiming(1.05, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1, false
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

  const handleJoin = () => {
    router.push({
      pathname: "/video-call",
      params: { roomId: event.id, roomName: event.title },
    });
  };

  return (
    <Animated.View style={[styles.wrapper, { top: insets.top + 10 }, bannerStyle]} testID="meeting-banner">
      <LinearGradient
        colors={["#0F172A", "#1E1B4B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Left accent bar */}
        <View style={styles.accentBar} />

        {/* Icon */}
        <View style={styles.iconCol}>
          <Image source={alenioIcon} style={styles.icon} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <LiveDot />
            <Text style={styles.label}>
              {hasStarted ? "In progress" : "Upcoming meeting"}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.meta}>
            {teamName}
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
              <Text style={styles.countdownNum}>{formatCountdown(msUntilStart)}</Text>
            </View>
          )}
          <Pressable
            onPress={() => setDismissed(prev => new Set([...prev, event.id]))}
            style={styles.dismissBtn}
            testID="banner-dismiss-button"
          >
            <Text style={styles.dismissX}>✕</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
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
