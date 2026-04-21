import { View, Text, FlatList, ActivityIndicator, Pressable, ScrollView, Modal, TouchableOpacity, Image, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { CheckCircle, UserPlus, UserMinus, Calendar, Activity, UserCheck, Trophy, Flame, Clock, Video, PartyPopper, X, Star, Award, Zap, Target, Users, Lightbulb, Heart, Flag } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";
import { useState, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/use-session";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDemoMode } from "@/lib/useDemo";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  allDay: boolean;
  color: string;
};

function formatEventTime(startDate: string, endDate: string | null | undefined, allDay: boolean) {
  if (allDay) return "All day";
  const start = new Date(startDate);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!endDate) return fmt(start);
  return `${fmt(start)} – ${fmt(new Date(endDate))}`;
}


const REACTION_HINT_KEY = "reaction_hint_shown";

type UpcomingMeeting = {
  event: { id: string; title: string; startDate: string; endDate?: string | null; teamId: string };
  teamName: string;
  userRole: string;
};

function LiveDot() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.8, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={liveDotStyles.wrap}>
      <Animated.View style={[liveDotStyles.ring, ringStyle]} />
      <View style={liveDotStyles.core} />
    </View>
  );
}
const liveDotStyles = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(74,222,128,0.4)" },
  core: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
});

function ActivityMeetingRow({ meeting, now }: { meeting: UpcomingMeeting; now: number }) {
  const { event, teamName } = meeting;
  const startMs = new Date(event.startDate).getTime();
  const endMs = event.endDate ? new Date(event.endDate).getTime() : startMs + 60 * 60 * 1000;
  const msUntilStart = startMs - now;
  const hasStarted = msUntilStart <= 0;
  const isUrgent = !hasStarted && msUntilStart <= 5 * 60 * 1000;
  const timeLeft = endMs - now;
  const minutes = Math.floor(timeLeft / 60000);
  const timeLeftLabel = minutes > 0 ? `${minutes}m left` : "Ending soon";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/video-call", params: { roomId: event.id, roomName: event.title } } as any)}
      style={meetingRowStyles.wrapper}
      testID="activity-meeting-row"
    >
      <LinearGradient colors={["#0F172A", "#1E1B4B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={meetingRowStyles.card}>
        <View style={meetingRowStyles.accentBar} />
        <Image source={require("@/assets/alenio-icon.png")} style={meetingRowStyles.icon} />
        <View style={meetingRowStyles.content}>
          <View style={meetingRowStyles.topRow}>
            <LiveDot />
            <Text style={meetingRowStyles.label}>{hasStarted ? "In progress" : "Starting soon"}</Text>
          </View>
          <Text style={meetingRowStyles.title} numberOfLines={1}>{event.title}</Text>
          <Text style={meetingRowStyles.meta}>{teamName}{hasStarted ? ` · ${timeLeftLabel}` : ""}</Text>
        </View>
        <Pressable
          onPress={() => router.push({ pathname: "/video-call", params: { roomId: event.id, roomName: event.title } } as any)}
          style={[meetingRowStyles.joinBtn, isUrgent && meetingRowStyles.joinBtnUrgent]}
          testID="activity-meeting-join-button"
        >
          <Video size={13} color="#fff" style={{ marginRight: 5 }} />
          <Text style={meetingRowStyles.joinText}>Join</Text>
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}
const meetingRowStyles = StyleSheet.create({
  wrapper: { marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 18, overflow: "hidden", shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 13, paddingRight: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  accentBar: { width: 3, alignSelf: "stretch", backgroundColor: "#4361EE", borderRadius: 2, marginRight: 10 },
  icon: { width: 34, height: 34, borderRadius: 9, marginRight: 10 },
  content: { flex: 1, gap: 2 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 14, fontWeight: "700", color: "#FFFFFF", letterSpacing: -0.2 },
  meta: { fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: "500" },
  joinBtn: { backgroundColor: "#4361EE", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, shadowColor: "#4361EE", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6 },
  joinBtnUrgent: { backgroundColor: "#10B981", shadowColor: "#10B981" },
  joinText: { color: "white", fontSize: 13, fontWeight: "700" },
});

type ActivityEvent = {
  id: string;
  type: "task_completed" | "member_joined" | "member_removed" | "calendar_event_added" | "task_assigned" | "task_milestone" | "personal_best" | "celebration";
  createdAt: string;
  metadata: { taskTitle?: string; taskTitles?: string[]; taskCount?: number; eventTitle?: string; eventTitles?: string[]; eventCount?: number; startDate?: string; allDay?: boolean; userName?: string; count?: number; incognito?: boolean; assigneeName?: string; isVideoMeeting?: boolean; targetUserId?: string; targetName?: string; targetUserImage?: string | null; celebrationType?: string; message?: string | null; assignees?: { id: string; name: string; image: string | null }[] } | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>;
};

const EVENT_CONFIG = {
  task_completed: {
    label: "Task Done",
    color: "#10B981",
    bg: "#ECFDF5",
    Icon: CheckCircle,
    getMessage: (e: ActivityEvent) =>
      e.metadata?.taskTitle
        ? `${e.user?.name ?? "Someone"} completed "${e.metadata.taskTitle}"`
        : `${e.user?.name ?? "Someone"} completed an incognito task 🕵️`,
  },
  member_joined: {
    label: "Joined",
    color: "#4361EE",
    bg: "#EEF2FF",
    Icon: UserPlus,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? e.metadata?.userName ?? "Someone"} joined the team`,
  },
  member_removed: {
    label: "Left",
    color: "#F59E0B",
    bg: "#FFFBEB",
    Icon: UserMinus,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? e.metadata?.userName ?? "Someone"} left the team`,
  },
  calendar_event_added: {
    label: "Event Added",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    Icon: Calendar,
    getMessage: (e: ActivityEvent) => {
      const count = e.metadata?.eventCount ?? 1;
      if (count > 1) {
        return `${e.user?.name ?? "Someone"} added ${count} events to the calendar`;
      }
      const title = e.metadata?.eventTitles?.[0] ?? e.metadata?.eventTitle;
      return title
        ? `${e.user?.name ?? "Someone"} added "${title}" to the calendar`
        : `${e.user?.name ?? "Someone"} added an event to the calendar`;
    },
  },
  task_assigned: {
    label: "Assigned",
    color: "#4361EE",
    bg: "#EEF2FF",
    Icon: UserCheck,
    getMessage: (e: ActivityEvent) => {
      const count = e.metadata?.taskCount ?? 1;
      if (count > 1) {
        return `${e.user?.name ?? "Someone"} was assigned ${count} tasks`;
      }
      const title = e.metadata?.taskTitles?.[0] ?? e.metadata?.taskTitle;
      return title
        ? `${e.user?.name ?? "Someone"} was assigned "${title}"`
        : `${e.user?.name ?? "Someone"} was assigned a task`;
    },
  },
  task_milestone: {
    label: "Milestone",
    color: "#F59E0B",
    bg: "#FFFBEB",
    Icon: Trophy,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? "Someone"} completed ${e.metadata?.count ?? 10} tasks on time!`,
  },
  personal_best: {
    label: "Personal Best",
    color: "#F59E0B",
    bg: "#FFFBEB",
    Icon: Trophy,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? "Someone"} hit a new personal best of ${e.metadata?.count ?? 0} on-time tasks!`,
  },
};

const EMOJI_OPTIONS = ["😊", "❤️", "😂", "😮", "🔥", "🎉"];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ReactionRow({
  activityId,
  reactions,
  currentUserId,
  onToggleReaction,
  showPicker,
  onClosePicker,
}: {
  activityId: string;
  teamId: string | null;
  reactions: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }>;
  currentUserId: string | undefined;
  onToggleReaction: (emoji: string) => void;
  showPicker: boolean;
  onClosePicker: () => void;
}) {
  const existingReactions = Object.entries(reactions ?? {});
  // Find the emoji this user has already reacted with (at most one)
  const myReaction = currentUserId
    ? existingReactions.find(([, { userIds }]) => userIds.includes(currentUserId))?.[0]
    : undefined;
  const [whoReacted, setWhoReacted] = useState<{ emoji: string; users: { id: string; name: string }[] } | null>(null);

  return (
    <View style={{ marginTop: 4 }}>
      {/* Who reacted modal */}
      <Modal visible={!!whoReacted} transparent animationType="fade" onRequestClose={() => setWhoReacted(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" }} onPress={() => setWhoReacted(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderRadius: 20, padding: 20, width: 280, maxHeight: 360 }}>
            <Text style={{ fontSize: 22, textAlign: "center", marginBottom: 4 }}>{whoReacted?.emoji}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", textAlign: "center", marginBottom: 14 }}>
              {whoReacted?.users.length} {whoReacted?.users.length === 1 ? "person" : "people"} reacted
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {whoReacted?.users.map((u) => (
                <View key={u.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>{u.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#1E293B" }}>{u.name}</Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {showPicker ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 6 }}
          contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          testID={`emoji-picker-${activityId}`}
        >
          {EMOJI_OPTIONS.map((emoji) => {
            const isMine = emoji === myReaction;
            return (
              <Pressable
                key={emoji}
                testID={`pick-emoji-${activityId}-${emoji}`}
                onPress={() => { onToggleReaction(emoji); onClosePicker(); }}
                style={({ pressed }) => ({
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isMine ? "#EEF2FF" : pressed ? "#E2E8F0" : "#F1F5F9",
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderWidth: 1.5,
                  borderColor: isMine ? "#4361EE" : "#E2E8F0",
                })}
              >
                <Text style={{ fontSize: 18 }}>{emoji}</Text>
              </Pressable>
            );
          })}
          {/* Remove button — only shown when user has a reaction */}
          {myReaction ? (
            <Pressable
              testID={`remove-reaction-${activityId}`}
              onPress={() => { onToggleReaction(myReaction); onClosePicker(); }}
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#FEE2E2" : "#FFF1F2",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#FECDD3",
              })}
            >
              <Text style={{ fontSize: 12, color: "#EF4444", fontWeight: "700" }}>Remove</Text>
            </Pressable>
          ) : (
            <Pressable
              testID={`close-picker-${activityId}`}
              onPress={onClosePicker}
              style={({ pressed }) => ({
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? "#E2E8F0" : "#F1F5F9",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: "#E2E8F0",
              })}
            >
              <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "600" }}>✕</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 2 }}
      >
        {existingReactions.map(([emoji, { count, userIds, users = [] }]) => {
          const isActive = !!currentUserId && userIds.includes(currentUserId);
          return (
            <Pressable
              key={emoji}
              onPress={() => setWhoReacted({ emoji, users })}
              onLongPress={() => onToggleReaction(emoji)}
              testID={`reaction-pill-${activityId}-${emoji}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: isActive ? "#EEF2FF" : "#F1F5F9",
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: isActive ? "#4361EE" : "transparent",
                opacity: pressed && isActive ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 13 }}>{emoji}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: isActive ? "#4361EE" : "#64748B" }}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const NUM_CELEBRATION_VARIANTS = 4;

function CelebrationCard({ item, activeTeamId, currentUserId, isDemo, showPicker, onOpenPicker, onClosePicker }: { item: ActivityEvent; activeTeamId: string | null; currentUserId: string | undefined; isDemo: boolean; showPicker: boolean; onOpenPicker: () => void; onClosePicker: () => void }) {
  const count = item.metadata?.count ?? 10;
  const name = item.user?.name ?? "Someone";
  const queryClient = useQueryClient();

  const variant = parseInt(item.id.replace(/[^0-9]/g, '').slice(0, 6) || '0', 10) % NUM_CELEBRATION_VARIANTS;

  type CelebrationTheme = {
    borderColor: string;
    accentColor: string;
    circleBg: string;
    buttonBg: string;
    emoji: string;
    headline: string;
    sub: string;
    nameHeadline: string;
  };

  let theme: CelebrationTheme;
  switch (variant) {
    case 1:
      theme = {
        borderColor: "#A855F7",
        accentColor: "#A855F7",
        circleBg: "rgba(168,85,247,0.12)",
        buttonBg: "#A855F7",
        emoji: "🚀",
        headline: "CRUSHING IT! 🚀💜",
        sub: "Top performer streak!",
        nameHeadline: `${name} is absolutely crushing it!`,
      };
      break;
    case 2:
      theme = {
        borderColor: "#10B981",
        accentColor: "#10B981",
        circleBg: "rgba(16,185,129,0.12)",
        buttonBg: "#10B981",
        emoji: "💎",
        headline: "LEGENDARY level! 💎",
        sub: "Consistency is power 🌿",
        nameHeadline: `${name} is playing at a legendary level!`,
      };
      break;
    case 3:
      theme = {
        borderColor: "#F43F5E",
        accentColor: "#F43F5E",
        circleBg: "rgba(244,63,94,0.12)",
        buttonBg: "#F43F5E",
        emoji: "⚡",
        headline: "UNSTOPPABLE! ⚡🔥",
        sub: "On fire, no breaks! 💥",
        nameHeadline: `${name} is unstoppable right now!`,
      };
      break;
    default:
      theme = {
        borderColor: "#F59E0B",
        accentColor: "#F59E0B",
        circleBg: "rgba(245,158,11,0.12)",
        buttonBg: "#F59E0B",
        emoji: "⭐",
        headline: "INSANE milestone! 🏆✨",
        sub: "New record!",
        nameHeadline: `${name} hit an insane milestone!`,
      };
      break;
  }

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${activeTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  return (
    <Pressable
      onPress={() => router.push("/(app)" as any)}
      onLongPress={isDemo ? undefined : onOpenPicker}
      style={{ marginHorizontal: 16, marginVertical: 6 }}
      testID={`milestone-card-${item.id}`}
    >
      <View
        style={{
          backgroundColor: "#FFFBEB",
          borderRadius: 20,
          borderWidth: 2,
          borderColor: theme.borderColor,
          padding: 16,
          overflow: "hidden",
          shadowColor: theme.borderColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        {/* Logo watermark top-right */}
        <Image
          source={require("@/assets/alenio-icon.png")}
          style={{ position: "absolute", top: 12, right: 14, width: 36, height: 36, borderRadius: 8, opacity: 0.9 }}
        />

        {/* Main horizontal body */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {/* Left column: emoji circle */}
          <View style={{ alignItems: "center" }}>
            <View
              style={{
                width: 70,
                height: 70,
                borderRadius: 35,
                backgroundColor: theme.circleBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 34 }}>{theme.emoji}</Text>
            </View>
          </View>

          {/* Right column: count + headline + sub + button */}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={{ fontSize: 52, fontWeight: "900", color: theme.accentColor, lineHeight: 56 }}>{count}</Text>
              <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "500" }}>tasks completed</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "800", color: theme.accentColor }}>{theme.headline}</Text>
            <Text style={{ fontSize: 12, color: "#64748B" }}>{theme.sub}</Text>
            <Pressable
              style={{
                backgroundColor: theme.buttonBg,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 8,
                alignSelf: "flex-start",
                marginTop: 8,
              }}
              onPress={() => router.push("/(app)" as any)}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#FFFFFF" }}>Let's go! 🎉</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer: avatar + name | timestamp */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.circleBg, borderWidth: 1, borderColor: theme.borderColor + "40", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {item.user?.image ? (
                <ExpoImage source={{ uri: item.user.image }} style={{ width: 24, height: 24 }} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 11, fontWeight: "700", color: theme.accentColor }}>{name[0].toUpperCase()}</Text>
              )}
            </View>
            <Text style={{ fontSize: 11, color: "#64748B" }}>{name}</Text>
          </View>
          <Text style={{ fontSize: 11, color: "#94A3B8" }}>{timeAgo(item.createdAt)}</Text>
        </View>

        <ReactionRow
          activityId={item.id}
          teamId={activeTeamId}
          reactions={item.reactions ?? {}}
          currentUserId={currentUserId}
          onToggleReaction={toggleReaction}
          showPicker={showPicker}
          onClosePicker={onClosePicker}
        />
      </View>
    </Pressable>
  );
}

const NUM_PERSONAL_BEST_VARIANTS = 3;

function PersonalBestCard({ item, activeTeamId, currentUserId, isDemo, showPicker, onOpenPicker, onClosePicker }: { item: ActivityEvent; activeTeamId: string | null; currentUserId: string | undefined; isDemo: boolean; showPicker: boolean; onOpenPicker: () => void; onClosePicker: () => void }) {
  const count = item.metadata?.count ?? 0;
  const name = item.user?.name ?? "Someone";
  const queryClient = useQueryClient();

  const variant = parseInt(item.id.replace(/[^0-9]/g, '').slice(0, 6) || '0', 10) % NUM_PERSONAL_BEST_VARIANTS;

  type PersonalBestTheme = {
    shadow: string;
    gradient: [string, string, string];
    badgeGradient: [string, string, string];
    badgeBg: string;
    badgeTextColor: string;
    emoji: string;
    particleColor0: string;
    particleColor1: string;
    headline: string;
    sub: string;
    nameColor: string;
  };

  let theme: PersonalBestTheme;
  switch (variant) {
    case 1:
      theme = {
        shadow: "#3B82F6",
        gradient: ["#60A5FA", "#3B82F6", "#2563EB"] as [string, string, string],
        badgeGradient: ["#DBEAFE", "#BFDBFE", "#93C5FD"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "❄️",
        particleColor0: "#BFDBFE",
        particleColor1: "#DBEAFE",
        headline: `${name} is BACK in ice cold form! ❄️💙`,
        sub: "Personal best streak matched! 🏆",
        nameColor: "rgba(255,255,255,0.85)",
      };
      break;
    case 2:
      theme = {
        shadow: "#EC4899",
        gradient: ["#F472B6", "#EC4899", "#DB2777"] as [string, string, string],
        badgeGradient: ["#FCE7F3", "#FBCFE8", "#F9A8D4"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "💫",
        particleColor0: "#FBCFE8",
        particleColor1: "#FCE7F3",
        headline: `${name} just made a STUNNING comeback! 💫💖`,
        sub: "Personal best streak matched! 🏆",
        nameColor: "rgba(255,255,255,0.85)",
      };
      break;
    default:
      theme = {
        shadow: "#F97316",
        gradient: ["#FB923C", "#F97316", "#EA580C"] as [string, string, string],
        badgeGradient: ["#FED7AA", "#FDBA74", "#FB923C"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "🔥",
        particleColor0: "#FED7AA",
        particleColor1: "#FDBA74",
        headline: `${name} is BACK and better than ever! 💪🔥`,
        sub: "Personal best streak matched! 🏆",
        nameColor: "rgba(255,255,255,0.85)",
      };
      break;
  }

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${activeTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  return (
    <Pressable
      onPress={() => router.push("/(app)" as any)}
      onLongPress={isDemo ? undefined : onOpenPicker}
      style={{ marginHorizontal: 16, marginVertical: 6 }}
      testID={`personal-best-card-${item.id}`}
    >
      <View style={{ shadowColor: theme.shadow, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8, borderRadius: 20 }}>
        <LinearGradient
          colors={theme.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, overflow: "hidden" }}
        >
          {/* Ember particles */}
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
            {[
              { top: 10, left: 20, size: 9, opacity: 0.5, char: "✦" },
              { top: 24, left: 55, size: 6, opacity: 0.35, char: "•" },
              { top: 6, right: 28, size: 8, opacity: 0.45, char: "✦" },
              { top: 18, right: 65, size: 5, opacity: 0.3, char: "•" },
              { top: 46, left: 14, size: 6, opacity: 0.25, char: "✦" },
              { top: 40, right: 18, size: 7, opacity: 0.4, char: "•" },
              { bottom: 44, left: 38, size: 6, opacity: 0.3, char: "✦" },
              { bottom: 28, right: 46, size: 5, opacity: 0.3, char: "•" },
              { top: 32, left: 90, size: 7, opacity: 0.4, char: "✦" },
              { top: 14, left: 140, size: 6, opacity: 0.35, char: "•" },
              { bottom: 20, left: 70, size: 8, opacity: 0.3, char: "✦" },
              { bottom: 50, right: 80, size: 6, opacity: 0.35, char: "•" },
            ].map((s, i) => (
              <Text key={i} style={{ position: "absolute", top: (s as any).top, left: (s as any).left, right: (s as any).right, bottom: (s as any).bottom, fontSize: s.size, opacity: s.opacity, color: i % 2 === 0 ? theme.particleColor0 : theme.particleColor1 }}>{s.char}</Text>
            ))}
          </View>
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 6, opacity: 0.9 }}
          />

          <View style={{ padding: 14, alignItems: "center", gap: 8 }}>
            {/* Badge */}
            <View style={{ alignItems: "center", marginTop: 0 }}>
              <LinearGradient
                colors={theme.badgeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: 16, padding: 2 }}
              >
                <View style={{ backgroundColor: theme.badgeBg, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, alignItems: "center", minWidth: 80 }}>
                  <Text style={{ fontSize: 18, lineHeight: 28 }}>{theme.emoji}</Text>
                  <Text style={{ fontSize: 40, fontWeight: "900", color: theme.badgeTextColor, lineHeight: 44 }}>{count}</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Text */}
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 12, color: theme.nameColor, fontWeight: "500" }}>tasks in a row</Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "white", textAlign: "center" }}>
                {theme.headline}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{theme.sub}</Text>
            </View>

            {/* Footer: avatar + time */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: theme.particleColor0, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                  {item.user?.image ? (
                    <ExpoImage source={{ uri: item.user.image }} style={{ width: 24, height: 24 }} contentFit="cover" />
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: "700", color: theme.badgeTextColor }}>{name[0].toUpperCase()}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: theme.nameColor }}>{name}</Text>
              </View>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{timeAgo(item.createdAt)}</Text>
            </View>

            <ReactionRow
              activityId={item.id}
              teamId={activeTeamId}
              reactions={item.reactions ?? {}}
              currentUserId={currentUserId}
              onToggleReaction={toggleReaction}
              showPicker={showPicker}
              onClosePicker={onClosePicker}
            />
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

const CELEBRATION_TYPES = [
  { key: "shoutout",   Icon: Star,        label: "Shoutout",        tag: "Recognition",    color: "#D97706", bg: "#FFFBEB", gradient: ["#92400E", "#B45309"] as [string,string] },
  { key: "mvp",        Icon: Trophy,      label: "MVP",             tag: "Most Valuable",  color: "#7C3AED", bg: "#EEF2FF", gradient: ["#4C1D95", "#6D28D9"] as [string,string] },
  { key: "beyond",     Icon: Award,       label: "Above & Beyond",  tag: "Top Performer",  color: "#059669", bg: "#ECFDF5", gradient: ["#064E3B", "#047857"] as [string,string] },
  { key: "rockstar",   Icon: Zap,         label: "Rockstar",        tag: "High Impact",    color: "#EA580C", bg: "#FFF7ED", gradient: ["#7C2D12", "#C2410C"] as [string,string] },
  { key: "clutch",     Icon: Target,      label: "Clutch",          tag: "Clutch Play",    color: "#DC2626", bg: "#FEF2F2", gradient: ["#7F1D1D", "#B91C1C"] as [string,string] },
  { key: "teamplayer", Icon: Users,       label: "Team Player",     tag: "Team Impact",    color: "#1D4ED8", bg: "#EFF6FF", gradient: ["#1E3A8A", "#1E40AF"] as [string,string] },
  { key: "bigbrain",   Icon: Lightbulb,   label: "Big Brain",       tag: "Problem Solver", color: "#0891B2", bg: "#ECFEFF", gradient: ["#164E63", "#0E7490"] as [string,string] },
  { key: "onfire",     Icon: Flame,       label: "On Fire",         tag: "On a Roll",      color: "#4338CA", bg: "#EEF2FF", gradient: ["#312E81", "#3730A3"] as [string,string] },
  { key: "milestone",  Icon: Flag,        label: "Milestone",       tag: "Milestone Hit",  color: "#7C3AED", bg: "#F5F3FF", gradient: ["#4C1D95", "#5B21B6"] as [string,string] },
  { key: "grateful",   Icon: Heart,       label: "Grateful",        tag: "Team Spirit",    color: "#E11D48", bg: "#FDF2F8", gradient: ["#881337", "#BE123C"] as [string,string] },
];

function CelebrationPostCard({ item, activeTeamId, currentUserId, isDemo, showPicker, onOpenPicker, onClosePicker }: { item: ActivityEvent; activeTeamId: string | null; currentUserId: string | undefined; isDemo: boolean; showPicker: boolean; onOpenPicker: () => void; onClosePicker: () => void }) {
  const queryClient = useQueryClient();
  const meta = item.metadata;
  const celebType = CELEBRATION_TYPES.find((t) => t.key === meta?.celebrationType) ?? CELEBRATION_TYPES[0]!;
  const fromName = item.user?.name ?? "Someone";
  const toName = meta?.targetName ?? "a teammate";

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${activeTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  return (
    <Pressable
      onLongPress={isDemo ? undefined : onOpenPicker}
      style={{ marginHorizontal: 16, marginVertical: 6 }}
      testID={`celebration-post-card-${item.id}`}
    >
      <LinearGradient
        colors={celebType.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", elevation: 4, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }}
      >
        {/* Watermark icon */}
        <View style={{ position: "absolute", right: -10, top: -10, opacity: 0.05 }}>
          <celebType.Icon size={110} color="white" />
        </View>

        <View style={{ padding: 16, gap: 12 }}>
          {/* Top row: label + time */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <celebType.Icon size={11} color="rgba(255,255,255,0.75)" />
              <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.75)", letterSpacing: 1, textTransform: "uppercase" }}>{celebType.label}</Text>
            </View>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: "500" }}>{timeAgo(item.createdAt)}</Text>
          </View>

          {/* 3-column main row */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            {/* LEFT: target user photo or icon fallback */}
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: celebType.bg, alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
              {meta?.targetUserImage ? (
                <ExpoImage source={{ uri: meta.targetUserImage }} style={{ width: 48, height: 48 }} contentFit="cover" />
              ) : (
                <celebType.Icon size={24} color={celebType.color} />
              )}
            </View>

            {/* CENTER: content */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "white", letterSpacing: -0.3 }}>{toName}</Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "500" }}>Recognized by {fromName}</Text>
            </View>

            {/* RIGHT: tag badge */}
            <View style={{ backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5 }}>{celebType.tag.toUpperCase()}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />

          {/* Message */}
          {meta?.message ? (
            <View style={{ backgroundColor: "rgba(0,0,0,0.15)", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 20 }}>"{meta.message}"</Text>
            </View>
          ) : null}

          {/* Reactions */}
          <ReactionRow
            activityId={item.id}
            teamId={activeTeamId}
            reactions={item.reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={toggleReaction}
            showPicker={showPicker}
            onClosePicker={onClosePicker}
          />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function ActivityItem({ item, activeTeamId, currentUserId, isDemo, showPicker, onOpenPicker, onClosePicker }: { item: ActivityEvent; activeTeamId: string | null; currentUserId: string | undefined; isDemo: boolean; showPicker: boolean; onOpenPicker: () => void; onClosePicker: () => void }) {
  const queryClient = useQueryClient();

  const { mutate: toggleReaction } = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/api/teams/${activeTeamId}/activity/${item.id}/react`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      onClosePicker();
    },
  });

  if (item.type === "task_milestone") {
    return <CelebrationCard item={item} activeTeamId={activeTeamId} currentUserId={currentUserId} isDemo={isDemo} showPicker={showPicker} onOpenPicker={onOpenPicker} onClosePicker={onClosePicker} />;
  }

  if (item.type === "personal_best") {
    return <PersonalBestCard item={item} activeTeamId={activeTeamId} currentUserId={currentUserId} isDemo={isDemo} showPicker={showPicker} onOpenPicker={onOpenPicker} onClosePicker={onClosePicker} />;
  }

  if (item.type === "celebration") {
    return <CelebrationPostCard item={item} activeTeamId={activeTeamId} currentUserId={currentUserId} isDemo={isDemo} showPicker={showPicker} onOpenPicker={onOpenPicker} onClosePicker={onClosePicker} />;
  }

  const config = EVENT_CONFIG[item.type] ?? {
    label: item.type,
    color: "#64748B",
    bg: "#F1F5F9",
    Icon: Activity,
    getMessage: () => "Activity occurred",
  };
  const { Icon } = config;

  return (
    <Pressable
      onLongPress={isDemo ? undefined : onOpenPicker}
      style={{ paddingHorizontal: 20, paddingVertical: 14 }}
      testID={`activity-item-${item.id}`}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        {/* Avatar */}
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#F1F5F9",
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {item.user?.image ? (
            <ExpoImage
              source={{ uri: item.user.image }}
              style={{ width: 40, height: 40 }}
              contentFit="cover"
            />
          ) : (
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#94A3B8" }}>
              {(item.user?.name ?? "?")[0].toUpperCase()}
            </Text>
          )}
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {/* Badge + time row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: config.bg,
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}>
              <Icon size={11} color={config.color} />
              <Text style={{ fontSize: 11, fontWeight: "700", color: config.color, letterSpacing: 0.3 }}>
                {config.label}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{timeAgo(item.createdAt)}</Text>
          </View>

          {/* Message */}
          <Text style={{ fontSize: 14, color: "#334155", lineHeight: 20 }}>
            {config.getMessage(item)}
          </Text>

          {/* Task assignees row (inline, no separate card) */}
          {item.type === "task_completed" && item.metadata?.assignees && item.metadata.assignees.length > 0 ? (() => {
            const assignees = item.metadata.assignees!;
            const visible = assignees.slice(0, 3);
            const overflow = assignees.length - 3;
            const names = assignees.length <= 2
              ? assignees.map((a) => a.name).join(" & ")
              : assignees.length === 3
                ? `${assignees[0]!.name}, ${assignees[1]!.name} & ${assignees[2]!.name}`
                : `${assignees[0]!.name}, ${assignees[1]!.name} & ${overflow + 1} others`;
            return (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {visible.map((a, i) => (
                    <View
                      key={a.id}
                      style={{
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: "#4361EE",
                        borderWidth: 1.5, borderColor: "white",
                        alignItems: "center", justifyContent: "center",
                        overflow: "hidden",
                        marginLeft: i === 0 ? 0 : -5,
                      }}
                    >
                      {a.image ? (
                        <ExpoImage source={{ uri: a.image }} style={{ width: 20, height: 20 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 8, fontWeight: "700", color: "white" }}>
                          {a.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                  ))}
                  {overflow > 0 ? (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#94A3B8", borderWidth: 1.5, borderColor: "white", alignItems: "center", justifyContent: "center", marginLeft: -5 }}>
                      <Text style={{ fontSize: 7, fontWeight: "700", color: "white" }}>+{overflow}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 12, color: "#64748B" }}>{names}</Text>
              </View>
            );
          })() : null}

          {/* Event date/time + video badge */}
          {item.type === "calendar_event_added" && item.metadata?.startDate ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                backgroundColor: "#F5F3FF", borderRadius: 8,
                paddingHorizontal: 7, paddingVertical: 3,
                borderWidth: 1, borderColor: "#DDD6FE",
              }}>
                <Calendar size={11} color="#8B5CF6" />
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#7C3AED" }}>
                  {new Date(item.metadata.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {!item.metadata.allDay
                    ? `  ·  ${new Date(item.metadata.startDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
                    : null}
                </Text>
              </View>
              {item.metadata.isVideoMeeting ? (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 4,
                  backgroundColor: "#EEF2FF", borderRadius: 8,
                  paddingHorizontal: 7, paddingVertical: 3,
                  borderWidth: 1, borderColor: "#C7D2FE",
                }}>
                  <Video size={11} color="#4361EE" />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#4361EE" }}>Video</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ paddingLeft: 52 }}>
        <ReactionRow
          activityId={item.id}
          teamId={activeTeamId}
          reactions={item.reactions ?? {}}
          currentUserId={currentUserId}
          onToggleReaction={toggleReaction}
          showPicker={showPicker}
          onClosePicker={onClosePicker}
        />
      </View>
    </Pressable>
  );
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const currentUserId = session?.user?.id;
  const [showReactionHint, setShowReactionHint] = useState<boolean>(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [showCelebrateModal, setShowCelebrateModal] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTarget, setCelebrateTarget] = useState<{ id: string; name: string; image: string | null } | null>(null);
  const [celebrateType, setCelebrateType] = useState<string>(CELEBRATION_TYPES[0]!.key);
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewItems, setPreviewItems] = useState<ActivityEvent[]>([]);
  const [previewCounter, setPreviewCounter] = useState<number>(0);
  const [previewPanelOpen, setPreviewPanelOpen] = useState<boolean>(false);
  const [tickNow, setTickNow] = useState<number>(Date.now());

  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  const { data: meetings = [] } = useQuery<UpcomingMeeting[]>({
    queryKey: ["upcoming-video-meetings"],
    queryFn: () => api.get<UpcomingMeeting[]>("/api/video/upcoming"),
    enabled: !!session?.user,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  const activeMeeting = meetings.find(m => {
    const startMs = new Date(m.event.startDate).getTime();
    const endMs = m.event.endDate ? new Date(m.event.endDate).getTime() : startMs + 60 * 60 * 1000;
    return startMs <= tickNow && tickNow < endMs;
  }) ?? null;

  useEffect(() => {
    AsyncStorage.getItem(REACTION_HINT_KEY).then((val) => {
      if (val !== "1") setShowReactionHint(true);
    });
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showReactionHint) {
      hintTimerRef.current = setTimeout(() => {
        setShowReactionHint(false);
        AsyncStorage.setItem(REACTION_HINT_KEY, "1");
      }, 4000);
    }
  }, [showReactionHint]);

  useEffect(() => {
    if (!openPickerId) return;
    const timer = setTimeout(() => setOpenPickerId(null), 10000);
    return () => clearTimeout(timer);
  }, [openPickerId]);

  const { data: activities = [], isLoading, refetch } = useQuery({
    queryKey: ["activity", activeTeamId],
    queryFn: () => api.get<ActivityEvent[]>(`/api/teams/${activeTeamId}/activity`),
    enabled: !!activeTeamId,
    refetchInterval: 15000,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-feed", activeTeamId],
    queryFn: async () => {
      const team = await api.get<{ members: { userId: string; user: { id: string; name: string; image: string | null } }[] }>(`/api/teams/${activeTeamId}`);
      return (team.members ?? []).filter((m) => m.userId !== currentUserId);
    },
    enabled: !!activeTeamId && showCelebrateModal,
  });

  const celebrateMutation = useMutation({
    mutationFn: (payload: { targetUserId: string; celebrationType: string; message?: string }) =>
      api.post(`/api/teams/${activeTeamId}/activity/celebrate`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity", activeTeamId] });
      setShowCelebrateModal(false);
      setCelebrateStep(1);
      setCelebrateTarget(null);
      setCelebrateType(CELEBRATION_TYPES[0]!.key);
      setCelebrateMessage("");
    },
  });

  const now = new Date();

  if (!activeTeamId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={[]} testID="activity-screen">
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "800", flex: 1 }}>Activity</Text>
          <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 30, width: 104, resizeMode: "contain" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {!isDemo ? (
              <TouchableOpacity
                testID="celebrate-button"
                onPress={() => { setShowCelebrateModal(true); setCelebrateStep(1); }}
                style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Text style={{ fontSize: 12 }}>🎉</Text>
                <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>Celebrate</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {/* Preview panel */}
      <View testID="preview-panel" style={{ backgroundColor: "#F8FAFC", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", paddingHorizontal: 12, paddingVertical: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
          <TouchableOpacity
            testID="preview-panel-toggle"
            onPress={() => setPreviewPanelOpen((v) => !v)}
            style={{ backgroundColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text style={{ fontSize: 11 }}>🎨</Text>
            <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B" }}>Preview</Text>
            <Text style={{ fontSize: 11, color: "#94A3B8" }}>{previewPanelOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>
        </View>
        {previewPanelOpen ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingVertical: 6, gap: 6, flexDirection: "row" }}>
            {([
              { label: "🏆 M1", type: "task_milestone" as const, variant: 0 },
              { label: "🏆 M2", type: "task_milestone" as const, variant: 1 },
              { label: "🏆 M3", type: "task_milestone" as const, variant: 2 },
              { label: "🏆 M4", type: "task_milestone" as const, variant: 3 },
              { label: "💪 PB1", type: "personal_best" as const, variant: 0 },
              { label: "💪 PB2", type: "personal_best" as const, variant: 1 },
              { label: "💪 PB3", type: "personal_best" as const, variant: 2 },
            ]).map((btn) => (
              <TouchableOpacity
                key={btn.label}
                testID={`preview-btn-${btn.label}`}
                onPress={() => {
                  const c = previewCounter;
                  const newId = `preview-${c * 10 + btn.variant}`;
                  const newItem: ActivityEvent = {
                    id: newId,
                    type: btn.type,
                    createdAt: new Date().toISOString(),
                    metadata: { count: 25 },
                    user: { id: "preview-user", name: "You", image: null },
                    reactions: {},
                  };
                  setPreviewItems((prev) => [newItem, ...prev]);
                  setPreviewCounter((n) => n + 1);
                }}
                style={{ backgroundColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155" }}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              testID="preview-btn-clear"
              onPress={() => setPreviewItems([])}
              style={{ backgroundColor: "#FEE2E2", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#DC2626" }}>🗑 Clear</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </View>

      {/* Celebrate modal */}
      <Modal visible={showCelebrateModal} transparent animationType="slide" onRequestClose={() => setShowCelebrateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} activeOpacity={1} onPress={() => setShowCelebrateModal(false)} />
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" }}>
            {/* Modal header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <TouchableOpacity onPress={celebrateStep === 2 ? () => setCelebrateStep(1) : () => setShowCelebrateModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 14, color: "#64748B", fontWeight: "600" }}>{celebrateStep === 2 ? "← Back" : "Cancel"}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B" }}>
                {celebrateStep === 1 ? "Who to celebrate? 🎉" : `Celebrate ${celebrateTarget?.name ?? ""}`}
              </Text>
              <TouchableOpacity onPress={() => setShowCelebrateModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {celebrateStep === 1 ? (
              /* Step 1 — pick team member */
              <ScrollView contentContainerStyle={{ paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
                {teamMembers.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <ActivityIndicator color="#4361EE" />
                  </View>
                ) : teamMembers.map((m) => (
                  <TouchableOpacity
                    key={m.userId}
                    testID={`celebrate-member-${m.userId}`}
                    onPress={() => { setCelebrateTarget(m.user); setCelebrateStep(2); }}
                    style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" }}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginRight: 14, overflow: "hidden" }}>
                      {m.user.image ? (
                        <ExpoImage source={{ uri: m.user.image }} style={{ width: 44, height: 44 }} contentFit="cover" />
                      ) : (
                        <Text style={{ fontSize: 18, fontWeight: "700", color: "#4361EE" }}>{m.user.name[0]?.toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B", flex: 1 }}>{m.user.name}</Text>
                    <Text style={{ fontSize: 18 }}>→</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              /* Step 2 — pick celebration type + message */
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Choose a celebration</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                  {CELEBRATION_TYPES.map((ct) => {
                    const selected = celebrateType === ct.key;
                    return (
                      <TouchableOpacity
                        key={ct.key}
                        testID={`celebrate-type-${ct.key}`}
                        onPress={() => setCelebrateType(ct.key)}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 6,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: selected ? ct.color : "#F1F5F9",
                          borderWidth: 1.5, borderColor: selected ? ct.color : "transparent",
                        }}
                      >
                        <ct.Icon size={16} color={selected ? "white" : "#64748B"} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? "white" : "#64748B" }}>{ct.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Message <Text style={{ color: "#EF4444" }}>*</Text></Text>
                <TextInput
                  testID="celebrate-message-input"
                  value={celebrateMessage}
                  onChangeText={setCelebrateMessage}
                  placeholder={`Say something nice about ${celebrateTarget?.name ?? "them"}...`}
                  placeholderTextColor="#CBD5E1"
                  multiline
                  maxLength={300}
                  style={{ backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#1E293B", minHeight: 80, maxHeight: 140, marginBottom: 20 }}
                />

                <TouchableOpacity
                  testID="celebrate-submit"
                  onPress={() => {
                    if (!celebrateTarget) return;
                    celebrateMutation.mutate({
                      targetUserId: celebrateTarget.id,
                      celebrationType: celebrateType,
                      message: celebrateMessage.trim(),
                    });
                  }}
                  disabled={celebrateMutation.isPending || !celebrateMessage.trim()}
                  style={{ backgroundColor: celebrateMessage.trim() ? "#4361EE" : "#CBD5E1", borderRadius: 14, paddingVertical: 15, alignItems: "center", shadowColor: "#4361EE", shadowOpacity: celebrateMessage.trim() ? 0.4 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
                >
                  {celebrateMutation.isPending ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>🎉 Post Celebration</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : previewItems.length === 0 && activities.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="empty-state">
          <Activity size={48} color="#CBD5E1" />
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#94A3B8", marginTop: 16, textAlign: "center" }}>
            No activity yet
          </Text>
          <Text style={{ fontSize: 14, color: "#CBD5E1", marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            Team events like completed tasks and new members will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...previewItems, ...activities]}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={activeMeeting ? <ActivityMeetingRow meeting={activeMeeting} now={tickNow} /> : null}
          renderItem={({ item, index }) => (
            <>
              <ActivityItem item={item} activeTeamId={activeTeamId} currentUserId={currentUserId} isDemo={isDemo} showPicker={openPickerId === item.id} onOpenPicker={() => setOpenPickerId(item.id)} onClosePicker={() => setOpenPickerId(null)} />
              {index === 0 && showReactionHint ? (
                <Text style={{ fontSize: 10, color: "rgba(100,116,139,0.7)", textAlign: "center", marginTop: 2 }}>
                  Long press to react
                </Text>
              ) : null}
            </>
          )}
          ItemSeparatorComponent={({ leadingItem }: { leadingItem: ActivityEvent }) =>
            leadingItem.type === "task_milestone" ? null : (
              <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 72 }} />
            )
          }
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
          showsVerticalScrollIndicator={false}
          testID="activity-list"
        />
      )}
    </SafeAreaView>
  );
}
