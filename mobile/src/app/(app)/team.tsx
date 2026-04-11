import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  Modal,
  RefreshControl,
} from "react-native";
import { toast } from "burnt";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  UserPlus,
  MessageCircle,
  AlertCircle,
  UserMinus,
  Clock,
  X,
  Check,
  ListChecks,
  Flame,
  Crown,
  Camera,
  Trash2,
  Star,
  ChevronRight,
  CalendarDays,
  QrCode,
  Zap,
  Download,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/lib/upload";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { useDemoMode, showDemoAlert } from "@/lib/useDemo";
import Svg, { Path, Circle, Line, Text as SvgText, Polyline } from "react-native-svg";

type JoinRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
  user?: { id: string; name: string; email: string; image: string | null };
  createdAt: string;
};

// ------------------------------------------------------------------
// Line chart component
// ------------------------------------------------------------------
const CHART_W = 280;
const CHART_H = 110;
const CHART_PAD_L = 36;
const CHART_PAD_B = 24;
const CHART_PAD_T = 10;
const CHART_PAD_R = 12;

const weeklyData = [60, 65, 77, 79, 84, 98];
const weekLabels = ["W1", "W2", "W3", "W4", "W5", "W6"];
const yTicks = [60, 80, 100];

function PerformanceChart() {
  const plotW = CHART_W - CHART_PAD_L - CHART_PAD_R;
  const plotH = CHART_H - CHART_PAD_T - CHART_PAD_B;
  const minY = 55;
  const maxY = 105;

  const toX = (i: number) => CHART_PAD_L + (i / (weeklyData.length - 1)) * plotW;
  const toY = (v: number) => CHART_PAD_T + plotH - ((v - minY) / (maxY - minY)) * plotH;

  const points = weeklyData.map((v, i) => ({ x: toX(i), y: toY(v) }));

  // Build smooth polyline points string
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Build gradient fill path
  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const fillPath =
    `M ${firstPt.x},${toY(minY)} ` +
    points.map((p) => `L ${p.x},${p.y}`).join(" ") +
    ` L ${lastPt.x},${toY(minY)} Z`;

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Y-axis grid lines and labels */}
      {yTicks.map((tick) => {
        const cy = toY(tick);
        return (
          <React.Fragment key={tick}>
            <Line
              x1={CHART_PAD_L}
              y1={cy}
              x2={CHART_W - CHART_PAD_R}
              y2={cy}
              stroke="#E0E7FF"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <SvgText
              x={CHART_PAD_L - 4}
              y={cy + 4}
              fontSize={9}
              fill="#94A3B8"
              textAnchor="end"
            >
              {tick}%
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Fill area */}
      <Path d={fillPath} fill="#4361EE" fillOpacity={0.08} />

      {/* Line */}
      <Polyline
        points={polylinePoints}
        fill="none"
        stroke="#4361EE"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {points.map((p, i) => (
        <Circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 5 : 3.5}
          fill={i === points.length - 1 ? "#4361EE" : "white"}
          stroke="#4361EE"
          strokeWidth={2}
        />
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => (
        <SvgText
          key={i}
          x={p.x}
          y={CHART_H - 4}
          fontSize={9}
          fill="#94A3B8"
          textAnchor="middle"
        >
          {weekLabels[i]}
        </SvgText>
      ))}
    </Svg>
  );
}

// ------------------------------------------------------------------
// Leaderboard member row
// ------------------------------------------------------------------
function LeaderboardRow({
  member,
  rank,
  stats,
  isCurrentUser,
  onPress,
}: {
  member: TeamMember;
  rank: number;
  stats?: { activeTasks: number; overdueTasks: number; streak: number; personalBestStreak?: number };
  isCurrentUser: boolean;
  onPress: () => void;
}) {
  const completed = stats?.activeTasks ?? 0;
  const overdue = stats?.overdueTasks ?? 0;
  const streak = stats?.streak ?? 0;
  const total = completed + overdue;
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const rankColors: Record<number, string> = { 1: "#F59E0B", 2: "#94A3B8", 3: "#CD7C3F" };
  const rankColor = rankColors[rank] ?? "#4361EE";
  const isTop3 = rank <= 3;

  return (
    <Pressable
      onPress={onPress}
      testID={`leaderboard-row-${member.userId}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#F0F4FF",
        backgroundColor: isCurrentUser ? "#F0F4FF" : "white",
      }}
    >
      {/* Rank badge */}
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: isTop3 ? rankColor + "22" : "#F1F5F9",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "800", color: isTop3 ? rankColor : "#94A3B8" }}>
          #{rank}
        </Text>
      </View>

      {/* Avatar */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: "#4361EE",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginRight: 10,
          borderWidth: isTop3 ? 2 : 0,
          borderColor: rankColor,
        }}
      >
        {member.user.image ? (
          <Image source={{ uri: member.user.image }} style={{ width: 38, height: 38 }} resizeMode="cover" />
        ) : (
          <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
            {member.user.name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        )}
      </View>

      {/* Name + subtitle */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
          {member.user.name}
          {isCurrentUser ? " (you)" : ""}
        </Text>
        {overdue > 0 ? (
          <Text style={{ fontSize: 11, color: "#EF4444", fontWeight: "600" }}>
            {overdue} overdue task{overdue !== 1 ? "s" : ""}
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: "#F97316", fontWeight: "600" }}>
            {streak > 0 ? `🔥 ${streak}-day streak` : "No active streak"}
          </Text>
        )}
      </View>

      {/* Completion badge */}
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <CheckCircle2 size={13} color="#22C55E" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>{completed} completed</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 11, color: completionPct >= 70 ? "#22C55E" : "#EF4444", fontWeight: "700" }}>
            {completionPct}%
          </Text>
          {isTop3 ? (
            <Text style={{ fontSize: 12 }}>{rank === 1 ? "🔥" : rank === 2 ? "🔥" : "🔥"}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ------------------------------------------------------------------
// Main screen
// ------------------------------------------------------------------
export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const { data: session } = useSession();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: memberStats } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<Record<string, { activeTasks: number; overdueTasks: number; streak: number; personalBestStreak: number }>>(
        `/api/teams/${activeTeamId}/tasks/member-stats`
      ),
    enabled: !!activeTeamId,
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string } | null }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push({ pathname: "/dm-chat", params: { conversationId: conv.id, recipientName: conv.recipient?.name ?? "Direct Message" } });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/teams/${activeTeamId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/api/teams/${activeTeamId}/members/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      toast({ title: "Role updated", preset: "done" });
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/teams/${activeTeamId}/transfer-ownership`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      setSelectedMemberId(null);
      toast({ title: "Ownership transferred", preset: "done" });
    },
    onError: () => {
      toast({ title: "Transfer failed", preset: "error" });
    },
  });

  const handleRemove = (member: TeamMember) => {
    Alert.alert(
      "Remove Member",
      `Remove ${member.user.name} from the team?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMutation.mutate(member.userId),
        },
      ]
    );
  };

  const currentMembership = team?.members?.find((m) => m.userId === session?.user?.id);
  const isOwner = currentMembership?.role === "owner" || currentMembership?.role === "team_leader";

  const [uploadingTeamImage, setUploadingTeamImage] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<"top" | "attention">("top");

  const updateTeamImageMutation = useMutation({
    mutationFn: (image: string | null) =>
      api.patch(`/api/teams/${activeTeamId}`, { image }),
    onSuccess: (_data, image) => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      toast({ title: image === null ? "Photo removed" : "Photo updated", preset: "done" });
      setPhotoMenuOpen(false);
    },
    onError: () => toast({ title: "Failed to update photo", preset: "error" }),
  });

  const handlePickTeamPhoto = async () => {
    setPhotoMenuOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingTeamImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg");
      updateTeamImageMutation.mutate(uploaded.url);
    } catch {
      toast({ title: "Failed to upload photo", preset: "error" });
    } finally {
      setUploadingTeamImage(false);
    }
  };

  const { data: myPendingRequests = [] } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<JoinRequest[]>("/api/join-requests/mine"),
    enabled: !activeTeamId,
    refetchInterval: 10000,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["team-join-requests", activeTeamId],
    queryFn: () => api.get<JoinRequest[]>(`/api/teams/${activeTeamId}/join-requests`),
    enabled: !!activeTeamId && isOwner,
    refetchInterval: 15000,
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${activeTeamId}/join-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-join-requests", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${activeTeamId}/join-requests/${requestId}/reject`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-join-requests", activeTeamId] }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const selectedMember = team?.members?.find((m) => m.userId === selectedMemberId) ?? null;
  const selectedStats = selectedMemberId ? memberStats?.[selectedMemberId] : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    setRefreshing(false);
  };

  const handleCopyCode = async () => {
    if (team?.inviteCode) await Clipboard.setStringAsync(team.inviteCode);
  };

  const handleShareCode = () => {
    if (team?.inviteCode) {
      Share.share({ message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}` });
    }
  };

  // Derived stats from real memberStats
  const totalCompleted = memberStats
    ? Object.values(memberStats).reduce((sum, s) => sum + s.activeTasks, 0)
    : 0;
  const totalOverdue = memberStats
    ? Object.values(memberStats).reduce((sum, s) => sum + s.overdueTasks, 0)
    : 0;

  // Sorted member lists for leaderboard
  const members = team?.members ?? [];
  const topPerformers = [...members].sort((a, b) => {
    const sa = memberStats?.[a.userId];
    const sb = memberStats?.[b.userId];
    const streakA = sa?.streak ?? 0;
    const streakB = sb?.streak ?? 0;
    const completedA = sa?.activeTasks ?? 0;
    const completedB = sb?.activeTasks ?? 0;
    if (completedB !== completedA) return completedB - completedA;
    return streakB - streakA;
  });

  const needsAttention = [...members].sort((a, b) => {
    const sa = memberStats?.[a.userId];
    const sb = memberStats?.[b.userId];
    const overdueA = sa?.overdueTasks ?? 0;
    const overdueB = sb?.overdueTasks ?? 0;
    const completedA = sa?.activeTasks ?? 0;
    const completedB = sb?.activeTasks ?? 0;
    const totalA = completedA + overdueA;
    const totalB = completedB + overdueB;
    const pctA = totalA > 0 ? completedA / totalA : 1;
    const pctB = totalB > 0 ? completedB / totalB : 1;
    if (overdueB !== overdueA) return overdueB - overdueA;
    return pctA - pctB;
  });

  const leaderboardMembers = leaderboardTab === "top" ? topPerformers : needsAttention;

  // ------------------------------------------------------------------
  // Guard states
  // ------------------------------------------------------------------
  if (!hasHydrated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4FF", alignItems: "center", justifyContent: "center" }} edges={["top"]}>
        <ActivityIndicator color="#4361EE" size="large" />
      </SafeAreaView>
    );
  }

  if (!activeTeamId) {
    const myRequest = myPendingRequests[0] ?? null;
    if (myRequest) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
          <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Team</Text>
            </View>
          </LinearGradient>
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
              Your Request
            </Text>
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  {session?.user?.image ? (
                    <Image source={{ uri: session.user.image }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#4361EE" }}>
                      {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{session?.user?.name ?? "You"}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#FED7AA" }}>
                  <Clock size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>Pending</Text>
                </View>
              </View>
              <View style={{ backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 2 }}>Requested to join</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{myRequest.team.name}</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Waiting for a Team Leader to approve</Text>
              </View>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Cancel Request",
                  `Are you sure you want to cancel your request to join ${myRequest.team.name}?`,
                  [
                    { text: "Keep Request", style: "cancel" },
                    {
                      text: "Cancel Request",
                      style: "destructive",
                      onPress: () => cancelMutation.mutate(myRequest.id),
                    },
                  ]
                )
              }
              disabled={cancelMutation.isPending}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: "#EF4444", paddingVertical: 13, borderRadius: 14 }}
              testID="cancel-request-button"
            >
              {cancelMutation.isPending ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <>
                  <X size={15} color="#EF4444" />
                  <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 15 }}>Cancel Request</Text>
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4FF" }} edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4FF", alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4FF" }} edges={["top"]} testID="team-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
        }
        testID="members-list"
      >
        {/* ── 1. HEADER CARD ─────────────────────────────────────────── */}
        <View
          style={{
            margin: 16,
            borderRadius: 24,
            backgroundColor: "#E0E9FF",
            padding: 20,
            shadowColor: "#4361EE",
            shadowOpacity: 0.1,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          {/* Team avatar */}
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <TouchableOpacity
              onPress={() => isOwner && !isDemo ? setPhotoMenuOpen(true) : undefined}
              disabled={uploadingTeamImage}
              testID="team-photo-button"
              style={{ position: "relative" }}
            >
              <View
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 44,
                  backgroundColor: "#4361EE30",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderWidth: 3,
                  borderColor: "#4361EE50",
                }}
              >
                {uploadingTeamImage ? (
                  <ActivityIndicator color="#4361EE" />
                ) : team?.image ? (
                  <Image source={{ uri: team.image }} style={{ width: 88, height: 88 }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: "#4361EE", fontWeight: "900", fontSize: 36 }}>
                    {team?.name?.[0]?.toUpperCase() ?? "T"}
                  </Text>
                )}
              </View>
              {isOwner && !isDemo ? (
                <View
                  style={{
                    position: "absolute",
                    bottom: 2,
                    right: 2,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: "#4361EE",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "#E0E9FF",
                  }}
                >
                  <Camera size={13} color="white" />
                </View>
              ) : null}
            </TouchableOpacity>

            <Text style={{ fontSize: 22, fontWeight: "900", color: "#1E293B", marginTop: 10, textAlign: "center" }}>
              {team?.name ?? "Team"}
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              {members.length} member{members.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* Invite code */}
          <View
            style={{
              backgroundColor: "rgba(67,97,238,0.1)",
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: "rgba(67,97,238,0.18)",
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#4361EE", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>
              Invite Code
            </Text>
            <Text style={{ fontSize: 30, fontWeight: "900", color: "#4361EE", letterSpacing: 6, textAlign: "center" }}>
              {team?.inviteCode}
            </Text>
          </View>

          {/* 3 icon buttons */}
          {!isDemo ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={handleCopyCode}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: "white", borderWidth: 1, borderColor: "#C7D2FE" }}
                testID="copy-invite-code"
              >
                <Copy size={16} color="#4361EE" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={() => setQrModalOpen(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: "white", borderWidth: 1, borderColor: "#C7D2FE" }}
                testID="qr-invite-code"
              >
                <QrCode size={16} color="#4361EE" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>QR</Text>
              </Pressable>
              <Pressable
                onPress={handleShareCode}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: "#4361EE" }}
                testID="share-invite-code"
              >
                <UserPlus size={16} color="white" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>Invite</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ── Pending join requests (owner only) ────────────────────── */}
        {isOwner && incomingRequests.length > 0 ? (
          <View style={{ marginBottom: 4 }}>
            <Text style={{ paddingHorizontal: 16, fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Pending Requests ({incomingRequests.length})
            </Text>
            {incomingRequests.map((req) => (
              <View
                key={req.id}
                style={{
                  backgroundColor: "white",
                  marginHorizontal: 16,
                  marginBottom: 8,
                  borderRadius: 14,
                  padding: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.04,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {req.user?.image ? (
                      <Image source={{ uri: req.user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: "700", color: "#4361EE" }}>
                        {req.user?.name?.[0]?.toUpperCase() ?? "?"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{req.user?.name ?? "Unknown"}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#FED7AA" }}>
                    <Clock size={11} color="#F59E0B" />
                    <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400E" }}>Pending</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => rejectMutation.mutate(req.id)}
                    disabled={rejectMutation.isPending || approveMutation.isPending}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#E2E8F0" }}
                    testID={`reject-request-${req.id}`}
                  >
                    <X size={14} color="#64748B" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => approveMutation.mutate(req.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#4361EE" }}
                    testID={`approve-request-${req.id}`}
                  >
                    {approveMutation.isPending ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Check size={14} color="white" />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>Approve</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── 2. THIS WEEK AT A GLANCE ───────────────────────────────── */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            borderRadius: 20,
            backgroundColor: "white",
            padding: 18,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>
            This Week at a Glance
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: "#F0FDF4",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#22C55E20", alignItems: "center", justifyContent: "center" }}>
                <Check size={18} color="#22C55E" />
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "900", color: "#15803D" }}>{totalCompleted}</Text>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#16A34A" }}>tasks completed</Text>
              </View>
            </View>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: totalOverdue > 0 ? "#FEF2F2" : "#F8FAFC",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: totalOverdue > 0 ? "#EF444420" : "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={18} color={totalOverdue > 0 ? "#EF4444" : "#94A3B8"} />
              </View>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "900", color: totalOverdue > 0 ? "#DC2626" : "#94A3B8" }}>{totalOverdue}</Text>
                <Text style={{ fontSize: 11, fontWeight: "600", color: totalOverdue > 0 ? "#EF4444" : "#94A3B8" }}>overdue</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. TEAM PERFORMANCE CHART ─────────────────────────────── */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            borderRadius: 20,
            backgroundColor: "white",
            paddingTop: 18,
            paddingBottom: 16,
            paddingHorizontal: 16,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2 }}>
                Team Performance
              </Text>
              <Text style={{ fontSize: 11, color: "#CBD5E1", marginTop: 1 }}>Last 6 weeks</Text>
            </View>
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderWidth: 1,
                borderColor: "#C7D2FE",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
              testID="download-summary-button"
            >
              <Download size={13} color="#4361EE" />
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE" }}>Download Summary</Text>
            </Pressable>
          </View>

          <View style={{ alignItems: "center" }}>
            <PerformanceChart />
          </View>

          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: "#F0FDF4",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 14, color: "#22C55E" }}>↑</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#15803D" }}>
              12% improvement over last 3 weeks
            </Text>
          </View>
        </View>

        {/* ── 4. KPI METRIC CARDS ───────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}
        >
          {/* Completion Rate */}
          <View
            style={{
              width: 150,
              backgroundColor: "white",
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <CheckCircle2 size={18} color="#22C55E" />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Completion Rate
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>87%</Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>this week</Text>
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0FDF4", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#22C55E" }}>▲ +5%</Text>
            </View>
            <Text style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>vs last week</Text>
          </View>

          {/* Execution Speed */}
          <View
            style={{
              width: 150,
              backgroundColor: "white",
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Zap size={18} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Execution Speed
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>2.3h</Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>per task</Text>
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0FDF4", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#22C55E" }}>▲ 18%</Text>
            </View>
            <Text style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>faster</Text>
          </View>

          {/* Consistency */}
          <View
            style={{
              width: 150,
              backgroundColor: "white",
              borderRadius: 18,
              padding: 16,
              marginBottom: 12,
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFF1F0", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Flame size={18} color="#F97316" />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              Consistency
            </Text>
            <Text style={{ fontSize: 22, fontWeight: "900", color: "#0F172A" }}>4-day</Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>streak</Text>
            <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FFF7ED", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: "#F97316" }}>Best: 6 days</Text>
            </View>
          </View>
        </ScrollView>

        {/* ── 5. NEEDS ATTENTION BANNER ─────────────────────────────── */}
        {totalOverdue > 0 ? (
          <Pressable
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 16,
              backgroundColor: "#FFF7ED",
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              gap: 10,
              borderWidth: 1,
              borderColor: "#FED7AA",
            }}
            testID="needs-attention-banner"
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFEDD5", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={18} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#C2410C", textTransform: "uppercase", letterSpacing: 1 }}>
                Needs Attention
              </Text>
              <Text style={{ fontSize: 12, color: "#9A3412", marginTop: 2 }}>
                {totalOverdue} overdue task{totalOverdue !== 1 ? "s" : ""} across the team
              </Text>
            </View>
            <ChevronRight size={18} color="#F97316" />
          </Pressable>
        ) : null}

        {/* ── 6. TEAM LEADERBOARD ───────────────────────────────────── */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            borderRadius: 20,
            backgroundColor: "white",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 12 }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2 }}>
              Team Leaderboard
            </Text>
            {/* Toggle tabs */}
            <View style={{ flexDirection: "row", backgroundColor: "#F1F5F9", borderRadius: 10, padding: 2 }}>
              <Pressable
                onPress={() => setLeaderboardTab("top")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: leaderboardTab === "top" ? "white" : "transparent",
                  shadowColor: leaderboardTab === "top" ? "#000" : "transparent",
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: leaderboardTab === "top" ? 1 : 0,
                }}
                testID="leaderboard-top-tab"
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: leaderboardTab === "top" ? "#0F172A" : "#94A3B8" }}>
                  Top performers
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setLeaderboardTab("attention")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: leaderboardTab === "attention" ? "white" : "transparent",
                  shadowColor: leaderboardTab === "attention" ? "#000" : "transparent",
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: leaderboardTab === "attention" ? 1 : 0,
                }}
                testID="leaderboard-attention-tab"
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: leaderboardTab === "attention" ? "#0F172A" : "#94A3B8" }}>
                  Need attention
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Member rows */}
          {leaderboardMembers.map((item, index) => (
            <LeaderboardRow
              key={item.id}
              member={item}
              rank={index + 1}
              stats={memberStats?.[item.userId]}
              isCurrentUser={item.userId === session?.user?.id}
              onPress={() => setSelectedMemberId(item.userId)}
            />
          ))}

          {leaderboardMembers.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94A3B8" }}>No members yet</Text>
            </View>
          ) : null}
        </View>

        {/* ── Owner management area: role/remove actions hint ────────── */}
        {isOwner && !isDemo ? (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 8,
              borderRadius: 14,
              backgroundColor: "#EEF2FF",
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Crown size={14} color="#4361EE" />
            <Text style={{ fontSize: 12, color: "#4361EE", fontWeight: "600", flex: 1 }}>
              Tap any member to manage their role or remove them.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── QR Code Modal ─────────────────────────────────────────────── */}
      <Modal visible={qrModalOpen} transparent animationType="fade" onRequestClose={() => setQrModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: 320, borderRadius: 28, overflow: "hidden" }}>
            <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 28, alignItems: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Team Invite</Text>
              <Text style={{ fontSize: 22, fontWeight: "800", color: "white", textAlign: "center" }}>{team?.name}</Text>
            </LinearGradient>
            <View style={{ backgroundColor: "white", padding: 32, alignItems: "center" }}>
              <View style={{ padding: 16, backgroundColor: "white", borderRadius: 16, shadowColor: "#4361EE", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
                <QRCode
                  value={`alenio://join/${team?.inviteCode}`}
                  size={180}
                  color="#0F172A"
                  backgroundColor="white"
                  logo={require("@/assets/alenio-icon.png")}
                  logoSize={36}
                  logoBackgroundColor="white"
                  logoBorderRadius={8}
                />
              </View>
              <View style={{ marginTop: 20, alignItems: "center" }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#94A3B8", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>Invite Code</Text>
                <Text style={{ fontSize: 28, fontWeight: "800", color: "#4361EE", letterSpacing: 6 }}>{team?.inviteCode}</Text>
              </View>
              <View style={{ marginTop: 20, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, width: "100%" }}>
                <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", lineHeight: 18 }}>
                  Point your camera at this code or enter the invite code manually in the Alenio app.
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: "white", borderTopWidth: 1, borderTopColor: "#F1F5F9", flexDirection: "row", gap: 10, padding: 16 }}>
              <TouchableOpacity
                onPress={() => { Clipboard.setStringAsync(team?.inviteCode ?? ""); toast({ title: "Code copied!", preset: "done" }); }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EEF2FF", borderRadius: 12, paddingVertical: 12 }}
                testID="qr-copy-code"
              >
                <Copy size={15} color="#4361EE" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Copy Code</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setQrModalOpen(false); handleShareCode(); }}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#4361EE", borderRadius: 12, paddingVertical: 12 }}
                testID="qr-share"
              >
                <UserPlus size={15} color="white" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setQrModalOpen(false)}
            style={{ marginTop: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}
            testID="qr-close"
          >
            <X size={20} color="white" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Team photo action sheet ─────────────────────────────────── */}
      <Modal visible={photoMenuOpen} transparent animationType="slide" onRequestClose={() => setPhotoMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }} onPress={() => setPhotoMenuOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: 32, paddingHorizontal: 16 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 20 }} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>Team Photo</Text>
              <TouchableOpacity
                onPress={handlePickTeamPhoto}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}
                testID="pick-team-photo"
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  <Camera size={18} color="#4361EE" />
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Choose from Library</Text>
              </TouchableOpacity>
              {team?.image ? (
                <TouchableOpacity
                  onPress={() => updateTeamImageMutation.mutate(null)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}
                  testID="remove-team-photo"
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" }}>
                    <Trash2 size={18} color="#EF4444" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#EF4444" }}>Remove Photo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Member Detail Modal ─────────────────────────────────────── */}
      <Modal visible={!!selectedMember} transparent animationType="slide" onRequestClose={() => setSelectedMemberId(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={() => setSelectedMemberId(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginTop: 12, marginBottom: 4 }} />
              <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ margin: 16, borderRadius: 18, padding: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {selectedMember?.user.image ? (
                      <Image source={{ uri: selectedMember.user.image }} style={{ width: 60, height: 60 }} resizeMode="cover" />
                    ) : (
                      <Text style={{ fontSize: 24, fontWeight: "800", color: "white" }}>{selectedMember?.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: "white" }}>{selectedMember?.user.name}</Text>
                    <View style={{ marginTop: 6, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "white" }}>
                        {selectedMember?.role === "owner" ? "Owner" : selectedMember?.role === "team_leader" ? "Team Leader" : "Member"}
                      </Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>

              <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: "#FFF7ED", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: "#F97316" }}>{selectedStats?.streak ?? 0}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Flame size={13} color="#F97316" />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#9A3412" }}>Streak</Text>
                  </View>
                </View>
                <View style={{ flex: 1, backgroundColor: "#F5F3FF", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: "#7C3AED" }}>{selectedStats?.personalBestStreak ?? 0}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Star size={13} color="#7C3AED" />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#4C1D95" }}>Personal Best</Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 }}>
                <View style={{ flex: 1, backgroundColor: "#EEF2FF", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: "#4361EE" }}>{selectedStats?.activeTasks ?? 0}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <ListChecks size={13} color="#4361EE" />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#3730A3" }}>Active</Text>
                  </View>
                </View>
                <View style={{ flex: 1, backgroundColor: (selectedStats?.overdueTasks ?? 0) > 0 ? "#FEF2F2" : "#F8FAFC", borderRadius: 16, padding: 14, alignItems: "center", gap: 4 }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: (selectedStats?.overdueTasks ?? 0) > 0 ? "#EF4444" : "#94A3B8" }}>{selectedStats?.overdueTasks ?? 0}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <AlertCircle size={13} color={(selectedStats?.overdueTasks ?? 0) > 0 ? "#EF4444" : "#94A3B8"} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: (selectedStats?.overdueTasks ?? 0) > 0 ? "#991B1B" : "#94A3B8" }}>Overdue</Text>
                  </View>
                </View>
              </View>

              {selectedMember?.joinedAt ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <CalendarDays size={16} color="#94A3B8" />
                  <Text style={{ fontSize: 13, color: "#64748B" }}>
                    Joined {new Date(selectedMember.joinedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                  </Text>
                </View>
              ) : null}

              {/* Owner manage actions (in member detail) */}
              {isOwner && !isDemo && selectedMember?.userId !== session?.user?.id && selectedMember?.role !== "owner" && selectedMember?.role !== "team_leader" ? (
                <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => handleRemove(selectedMember!)}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#FECACA" }}
                    testID={`remove-member-modal-${selectedMember?.userId}`}
                  >
                    <UserMinus size={14} color="#EF4444" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (!selectedMember) return;
                      const isLeader = selectedMember.role === "team_leader";
                      Alert.alert(
                        isLeader ? "Remove Team Leader" : "Make Team Leader",
                        isLeader
                          ? `Remove team leader role from ${selectedMember.user.name}?`
                          : `Give ${selectedMember.user.name} team leader access?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: isLeader ? "Remove" : "Confirm",
                            style: isLeader ? "destructive" : "default",
                            onPress: () => setRoleMutation.mutate({ userId: selectedMember.userId, role: isLeader ? "member" : "team_leader" }),
                          },
                        ]
                      );
                    }}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#EDE9FE" }}
                    testID={`role-change-modal-${selectedMember?.userId}`}
                  >
                    <Crown size={14} color="#7C3AED" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>Set Leader</Text>
                  </Pressable>
                </View>
              ) : null}

              {currentMembership?.role === "owner" && selectedMember?.userId !== session?.user?.id && selectedMember?.role !== "owner" ? (
                <Pressable
                  testID="transfer-ownership-button"
                  onPress={() => {
                    Alert.alert(
                      "Transfer Ownership",
                      `Give full ownership of this team to ${selectedMember?.user.name}? You will become a regular member and cannot undo this yourself.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Transfer",
                          style: "destructive",
                          onPress: () => transferOwnershipMutation.mutate(selectedMember!.userId),
                        },
                      ]
                    );
                  }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, backgroundColor: "#FFF7ED", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#FED7AA" }}
                >
                  <Crown size={18} color="#F97316" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#C2410C" }}>Transfer Ownership</Text>
                    <Text style={{ fontSize: 12, color: "#9A3412", marginTop: 1 }}>Make {selectedMember?.user.name} the new owner</Text>
                  </View>
                  <ChevronRight size={16} color="#F97316" />
                </Pressable>
              ) : null}

              <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
                {selectedMember?.userId !== session?.user?.id ? (
                  <Pressable
                    onPress={() => { setSelectedMemberId(null); dmMutation.mutate(selectedMember!.userId); }}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#4361EE", paddingVertical: 14, borderRadius: 14 }}
                    testID="member-detail-message"
                  >
                    <MessageCircle size={16} color="white" />
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Message</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => setSelectedMemberId(null)}
                  style={{ flex: selectedMember?.userId !== session?.user?.id ? 0 : 1, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F1F5F9", paddingVertical: 14, borderRadius: 14 }}
                  testID="member-detail-close"
                >
                  <Text style={{ color: "#64748B", fontWeight: "700", fontSize: 15 }}>Close</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
