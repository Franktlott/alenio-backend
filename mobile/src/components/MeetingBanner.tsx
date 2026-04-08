import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { Video, X } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  if (ms <= 0) return "Now";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function MeetingBanner() {
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  // Tick every second for countdown
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

  // Find the soonest non-dismissed meeting within 15 min window
  const activeMeeting = meetings.find(m => {
    if (dismissed.has(m.event.id)) return false;
    const startMs = new Date(m.event.startDate).getTime();
    const endMs = m.event.endDate ? new Date(m.event.endDate).getTime() : startMs + 60 * 60 * 1000;
    const msUntilStart = startMs - now;
    const isUpcoming = msUntilStart <= 15 * 60 * 1000; // within 15 min
    const notOver = now < endMs;
    return isUpcoming && notOver;
  });

  const visible = !!activeMeeting;

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(-120, { duration: 300 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!activeMeeting) return null;

  const { event, teamName, userRole } = activeMeeting;
  const isLeader = userRole === "owner" || userRole === "team_leader";
  const startMs = new Date(event.startDate).getTime();
  const msUntilStart = startMs - now;
  const hasStarted = msUntilStart <= 0;
  const showJoin = isLeader || msUntilStart <= 5 * 60 * 1000;

  const handleJoin = () => {
    router.push({
      pathname: "/video-call",
      params: { roomId: event.id, roomName: event.title },
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8 },
        animStyle,
      ]}
      testID="meeting-banner"
    >
      <View style={styles.leftSection}>
        <View style={styles.iconWrap}>
          <Video size={16} color="#4361EE" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={styles.subtitle}>
            {hasStarted
              ? `In progress · ${teamName}`
              : `${formatCountdown(msUntilStart)} · ${teamName}`}
          </Text>
        </View>
      </View>

      <View style={styles.rightSection}>
        {showJoin ? (
          <Pressable onPress={handleJoin} style={styles.joinBtn} testID="banner-join-button">
            <Text style={styles.joinText}>Join</Text>
          </Pressable>
        ) : (
          <Text style={styles.countdownOnly}>{formatCountdown(msUntilStart)}</Text>
        )}
        <Pressable
          onPress={() => setDismissed(prev => new Set([...prev, event.id]))}
          style={styles.dismissBtn}
          testID="banner-dismiss-button"
        >
          <X size={14} color="#94A3B8" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    backgroundColor: "white",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#4361EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(67,97,238,0.12)",
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  joinBtn: {
    backgroundColor: "#4361EE",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  joinText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  countdownOnly: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4361EE",
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
});
