import { View, Text, FlatList, ActivityIndicator, Pressable, ScrollView, Modal, TouchableOpacity, Image, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { CheckCircle, UserPlus, UserMinus, Calendar, Activity, UserCheck, Trophy, Flame, Clock, Video, PartyPopper, X } from "lucide-react-native";
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

type ActivityEvent = {
  id: string;
  type: "task_completed" | "member_joined" | "member_removed" | "calendar_event_added" | "task_assigned" | "task_milestone" | "personal_best" | "celebration";
  createdAt: string;
  metadata: { taskTitle?: string; taskTitles?: string[]; taskCount?: number; eventTitle?: string; eventTitles?: string[]; eventCount?: number; startDate?: string; allDay?: boolean; userName?: string; count?: number; incognito?: boolean; assigneeName?: string; isVideoMeeting?: boolean; targetUserId?: string; targetName?: string; celebrationType?: string; message?: string | null } | null;
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
    gradient: [string, string, string];
    badgeGradient: [string, string, string];
    badgeBg: string;
    badgeTextColor: string;
    emoji: string;
    particleColor: string;
    headline: string;
    sub: string;
  };

  let theme: CelebrationTheme;
  switch (variant) {
    case 1:
      theme = {
        gradient: ["#C084FC", "#A855F7", "#7C3AED"] as [string, string, string],
        badgeGradient: ["#F3E8FF", "#DDD6FE", "#C4B5FD"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "🚀",
        particleColor: "#F3E8FF",
        headline: `${name} is absolutely CRUSHING IT! 🚀💜`,
        sub: "Top performer streak!",
      };
      break;
    case 2:
      theme = {
        gradient: ["#34D399", "#10B981", "#059669"] as [string, string, string],
        badgeGradient: ["#ECFDF5", "#A7F3D0", "#6EE7B7"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "💎",
        particleColor: "#D1FAE5",
        headline: `${name} is playing at a LEGENDARY level! 💎`,
        sub: "Consistency is power 🌿",
      };
      break;
    case 3:
      theme = {
        gradient: ["#FB7185", "#F43F5E", "#E11D48"] as [string, string, string],
        badgeGradient: ["#FFE4E6", "#FECDD3", "#FDA4AF"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "⚡",
        particleColor: "#FFE4E6",
        headline: `${name} is UNSTOPPABLE right now! ⚡🔥`,
        sub: "On fire, no breaks! 💥",
      };
      break;
    default:
      theme = {
        gradient: ["#FBBF24", "#F59E0B", "#D97706"] as [string, string, string],
        badgeGradient: ["#FEF9C3", "#FEF08A", "#FDE047"] as [string, string, string],
        badgeBg: "rgba(255,255,255,0.25)",
        badgeTextColor: "#ffffff",
        emoji: "⭐",
        particleColor: "#FEF9C3",
        headline: `${name} hit an INSANE milestone! 🏆✨`,
        sub: "New Alenio record!",
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
      <LinearGradient
        colors={theme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, overflow: "hidden" }}
      >
        {/* Sparkle particles */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
          {[
            { top: 12, left: 24, size: 10, opacity: 0.6 },
            { top: 28, left: 60, size: 7, opacity: 0.4 },
            { top: 8, right: 32, size: 9, opacity: 0.5 },
            { top: 20, right: 70, size: 6, opacity: 0.35 },
            { top: 50, left: 16, size: 6, opacity: 0.3 },
            { top: 44, right: 20, size: 8, opacity: 0.45 },
            { bottom: 48, left: 40, size: 7, opacity: 0.3 },
            { bottom: 32, right: 50, size: 6, opacity: 0.35 },
          ].map((s, i) => (
            <Text key={i} style={{ position: "absolute", top: (s as any).top, left: (s as any).left, right: (s as any).right, bottom: (s as any).bottom, fontSize: s.size, opacity: s.opacity, color: theme.particleColor }}>✦</Text>
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
            <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "500" }}>tasks in a row</Text>
            <Text style={{ fontSize: 14, fontWeight: "800", color: "white", textAlign: "center" }}>
              {theme.headline}
            </Text>
            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{theme.sub}</Text>
          </View>

          {/* Footer: avatar + time */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "#FFD70040", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
                {item.user?.image ? (
                  <ExpoImage source={{ uri: item.user.image }} style={{ width: 24, height: 24 }} contentFit="cover" />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: "700", color: theme.badgeTextColor }}>{name[0].toUpperCase()}</Text>
                )}
              </View>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{name}</Text>
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
  { key: "shoutout",   emoji: "⭐", label: "Shoutout",        color: "#D97706", bg: "#FFFBEB", gradient: ["#D97706", "#B45309"] as [string,string] },
  { key: "mvp",        emoji: "🏆", label: "MVP",             color: "#7C3AED", bg: "#EEF2FF", gradient: ["#7C3AED", "#6D28D9"] as [string,string] },
  { key: "beyond",     emoji: "💪", label: "Above & Beyond",  color: "#059669", bg: "#ECFDF5", gradient: ["#059669", "#047857"] as [string,string] },
  { key: "rockstar",   emoji: "🚀", label: "Rockstar",        color: "#EA580C", bg: "#FFF7ED", gradient: ["#EA580C", "#C2410C"] as [string,string] },
  { key: "clutch",     emoji: "🎯", label: "Clutch",          color: "#DC2626", bg: "#FEF2F2", gradient: ["#DC2626", "#B91C1C"] as [string,string] },
  { key: "teamplayer", emoji: "🤝", label: "Team Player",     color: "#1D4ED8", bg: "#EFF6FF", gradient: ["#1D4ED8", "#1E40AF"] as [string,string] },
  { key: "bigbrain",   emoji: "💡", label: "Big Brain",       color: "#0891B2", bg: "#ECFEFF", gradient: ["#0891B2", "#0E7490"] as [string,string] },
  { key: "onfire",     emoji: "🔥", label: "On Fire",         color: "#4338CA", bg: "#EEF2FF", gradient: ["#4338CA", "#3730A3"] as [string,string] },
  { key: "milestone",  emoji: "🎉", label: "Milestone",       color: "#7C3AED", bg: "#F5F3FF", gradient: ["#7C3AED", "#5B21B6"] as [string,string] },
  { key: "grateful",   emoji: "❤️", label: "Grateful",        color: "#E11D48", bg: "#FDF2F8", gradient: ["#E11D48", "#BE123C"] as [string,string] },
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
        style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" }}
      >
        <View style={{ padding: 16, gap: 10 }}>
          {/* Badge row */}
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 15 }}>{celebType.emoji}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.9)", letterSpacing: 0.4 }}>{celebType.label.toUpperCase()}</Text>
            </View>
            <View style={{ marginLeft: "auto", alignItems: "flex-end", gap: 6 }}>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{timeAgo(item.createdAt)}</Text>
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={{ width: 26, height: 26, borderRadius: 6, opacity: 0.9 }}
              />
            </View>
          </View>

          {/* Main text */}
          <View>
            <Text style={{ fontSize: 20, fontWeight: "800", color: "white" }}>{toName} 🎊</Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>celebrated by {fromName}</Text>
          </View>

          {/* Custom message */}
          {meta?.message ? (
            <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20, fontStyle: "italic" }}>"{meta.message}"</Text>
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

export default function FeedScreen() {
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="feed-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Feed</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {!isDemo ? (
              <TouchableOpacity
                testID="celebrate-button"
                onPress={() => { setShowCelebrateModal(true); setCelebrateStep(1); }}
                style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Text style={{ fontSize: 14 }}>🎉</Text>
                <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>Celebrate</Text>
              </TouchableOpacity>
            ) : null}
            <ExpoImage
              source={require("@/assets/alenio-icon.png")}
              style={{ width: 30, height: 30, borderRadius: 6 }}
              contentFit="cover"
            />
          </View>
        </View>
      </LinearGradient>

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
                        <Text style={{ fontSize: 16 }}>{ct.emoji}</Text>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: selected ? "white" : "#64748B" }}>{ct.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Add a message (optional)</Text>
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
                      message: celebrateMessage.trim() || undefined,
                    });
                  }}
                  disabled={celebrateMutation.isPending}
                  style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 15, alignItems: "center", shadowColor: "#4361EE", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
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
      ) : activities.length === 0 ? (
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
          data={activities}
          keyExtractor={(item) => item.id}

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
