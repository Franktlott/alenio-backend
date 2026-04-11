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
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  QrCode,
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
import { useSubscriptionStore } from "@/lib/state/subscription-store";
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
const CHART_H = 80;
const CHART_PAD_L = 36;
const CHART_PAD_B = 24;
const CHART_PAD_T = 6;
const CHART_PAD_R = 12;

const yTicks = [60, 80, 100];

function PerformanceChart({ data }: { data: Array<{ label: string; completionPct: number | null }> }) {
  const plotW = CHART_W - CHART_PAD_L - CHART_PAD_R;
  const plotH = CHART_H - CHART_PAD_T - CHART_PAD_B;
  const minY = 55;
  const maxY = 105;

  const count = data.length;
  const toX = (i: number) => count > 1 ? CHART_PAD_L + (i / (count - 1)) * plotW : CHART_PAD_L + plotW / 2;
  const toY = (v: number) => CHART_PAD_T + plotH - ((v - minY) / (maxY - minY)) * plotH;

  // Build array of { x, y, index } only for non-null points
  const nonNullPoints = data
    .map((d, i) => d.completionPct !== null ? { x: toX(i), y: toY(d.completionPct), index: i } : null)
    .filter((p): p is { x: number; y: number; index: number } => p !== null);

  // Build consecutive segments for line and fill
  type Segment = Array<{ x: number; y: number; index: number }>;
  const segments: Segment[] = [];
  if (nonNullPoints.length > 0) {
    let current: Segment = [nonNullPoints[0]];
    for (let k = 1; k < nonNullPoints.length; k++) {
      if (nonNullPoints[k].index === nonNullPoints[k - 1].index + 1) {
        current.push(nonNullPoints[k]);
      } else {
        segments.push(current);
        current = [nonNullPoints[k]];
      }
    }
    segments.push(current);
  }

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

      {/* Fill area — one path per segment */}
      {segments.map((seg, si) => {
        if (seg.length < 2) return null;
        const firstPt = seg[0];
        const lastPt = seg[seg.length - 1];
        const fillPath =
          `M ${firstPt.x},${toY(minY)} ` +
          seg.map((p) => `L ${p.x},${p.y}`).join(" ") +
          ` L ${lastPt.x},${toY(minY)} Z`;
        return <Path key={si} d={fillPath} fill="#4361EE" fillOpacity={0.08} />;
      })}

      {/* Line — one polyline per segment */}
      {segments.map((seg, si) => {
        if (seg.length < 2) return null;
        const polylinePoints = seg.map((p) => `${p.x},${p.y}`).join(" ");
        return (
          <Polyline
            key={si}
            points={polylinePoints}
            fill="none"
            stroke="#4361EE"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}

      {/* Dots — only for non-null points */}
      {nonNullPoints.map((p, k) => (
        <Circle
          key={k}
          cx={p.x}
          cy={p.y}
          r={k === nonNullPoints.length - 1 ? 5 : 3.5}
          fill={k === nonNullPoints.length - 1 ? "#4361EE" : "white"}
          stroke="#4361EE"
          strokeWidth={2}
        />
      ))}

      {/* X-axis labels — always shown */}
      {data.map((d, i) => (
        <SvgText
          key={i}
          x={toX(i)}
          y={CHART_H - 4}
          fontSize={9}
          fill="#94A3B8"
          textAnchor="middle"
        >
          {d.label}
        </SvgText>
      ))}
    </Svg>
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
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: memberStats } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<Record<string, { activeTasks: number; overdueTasks: number; completedTasks: number; streak: number; personalBestStreak: number }>>(
        `/api/teams/${activeTeamId}/tasks/member-stats`
      ),
    enabled: !!activeTeamId,
  });

  const { data: monthlyStats } = useQuery({
    queryKey: ["monthly-completion", activeTeamId],
    queryFn: () =>
      api.get<Array<{ label: string; year: number; completionPct: number | null; done: number; total: number }>>(
        `/api/teams/${activeTeamId}/tasks/monthly-completion`
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
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null);
  const selectedMember = team?.members?.find((m) => m.userId === selectedMemberId) ?? null;
  const selectedStats = selectedMemberId ? memberStats?.[selectedMemberId] : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["monthly-completion", activeTeamId] });
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

  const weekCompletionPct = (totalCompleted + totalOverdue) > 0
    ? Math.round((totalCompleted / (totalCompleted + totalOverdue)) * 100)
    : 0;

  const monthTotal = monthlyStats?.length ?? 0;
  const monthIdx = selectedMonthIndex !== null ? selectedMonthIndex : monthTotal - 1;
  const selectedMonthStats = monthlyStats ? monthlyStats[monthIdx] ?? null : null;
  const monthCompletionPct = selectedMonthStats?.completionPct ?? null;
  const monthDone = selectedMonthStats?.done ?? 0;
  const monthLabel = selectedMonthStats?.label ?? "";

  // Alphabetically sorted member list
  const members = team?.members ?? [];
  const sortedMembers = [...members].sort((a, b) =>
    (a.user.name ?? "").localeCompare(b.user.name ?? "")
  );

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
  // Derived: avg completion pct across all months
  // ------------------------------------------------------------------
  const nonNullPcts = (monthlyStats ?? []).map((m) => m.completionPct).filter((p): p is number => p !== null);
  const avgCompletionPct = nonNullPcts.length > 0
    ? Math.round(nonNullPcts.reduce((a, b) => a + b, 0) / nonNullPcts.length)
    : null;

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F0F4FF" }} edges={["top"]} testID="team-screen">
      {/* ── HEADER: gradient rounded block containing title + team card ── */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          paddingTop: 14,
          paddingBottom: 20,
          paddingHorizontal: 16,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
        }}
      >
        {/* Title row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <View>
            <Text style={{ color: "white", fontWeight: "700", fontSize: 22 }}>Team</Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>
              {team?.name ?? ""}
            </Text>
          </View>
          {isPaid ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: "white", fontSize: 28, fontWeight: "900", lineHeight: 32 }}>{weekCompletionPct}%</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" }}>this week</Text>
            </View>
          ) : null}
        </View>

        {/* Team info card — white card inside the gradient */}
        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.92)",
            borderRadius: 18,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {/* Avatar */}
            <TouchableOpacity
              onPress={() => isOwner && !isDemo ? setPhotoMenuOpen(true) : undefined}
              disabled={uploadingTeamImage}
              testID="team-photo-button"
              style={{ position: "relative" }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: "#C7D2FE",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {uploadingTeamImage ? (
                  <ActivityIndicator color="#4361EE" />
                ) : team?.image ? (
                  <Image source={{ uri: team.image }} style={{ width: 60, height: 60 }} resizeMode="cover" />
                ) : (
                  <Text style={{ color: "#4361EE", fontWeight: "900", fontSize: 24 }}>
                    {team?.name?.[0]?.toUpperCase() ?? "T"}
                  </Text>
                )}
              </View>
              {isOwner && !isDemo ? (
                <View
                  style={{
                    position: "absolute",
                    bottom: 1,
                    right: 1,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: "#4361EE",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: "white",
                  }}
                >
                  <Camera size={10} color="white" />
                </View>
              ) : null}
            </TouchableOpacity>

            {/* Middle: invite code + name + subtitle */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", letterSpacing: 3 }}>
                {team?.inviteCode}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#1E293B", marginTop: 2 }}>
                {team?.name ?? "Team"}
              </Text>
              <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                Share this code to invite team members
              </Text>
            </View>

            {/* Right: icon buttons */}
            {!isDemo ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => setQrModalOpen(true)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: "#EEF2FF",
                    borderWidth: 1,
                    borderColor: "#C7D2FE",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  testID="qr-invite-code"
                >
                  <QrCode size={18} color="#4361EE" />
                </Pressable>
                <Pressable
                  onPress={handleShareCode}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: "#4361EE",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  testID="share-invite-code"
                >
                  <UserPlus size={18} color="white" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
        }
        testID="members-list"
      >

        {/* ── Pending join requests (owner only) ────────────────────── */}
        {isOwner && incomingRequests.length > 0 ? (
          <View style={{ marginTop: 12, marginBottom: 4 }}>
            <Text style={{ paddingHorizontal: 16, fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Pending Requests ({incomingRequests.length})
            </Text>
            {incomingRequests.map((req) => (
              <View
                key={req.id}
                style={{
                  backgroundColor: "white",
                  marginHorizontal: 12,
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

        {/* ── 2. AT A GLANCE CARD (paid only, unified) ──────────────── */}
        {isPaid ? (
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 20,
              marginHorizontal: 12,
              marginTop: 10,
              padding: 16,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            {/* Header row: label + month navigator */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 10, fontWeight: "800", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1.2 }}>
                AT A GLANCE
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Pressable
                  onPress={() => setSelectedMonthIndex(Math.max(0, monthIdx - 1))}
                  disabled={monthIdx === 0}
                  style={{ padding: 4 }}
                  testID="month-prev"
                >
                  <ChevronLeft size={16} color={monthIdx === 0 ? "#CBD5E1" : "#4361EE"} />
                </Pressable>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE", minWidth: 80, textAlign: "center" }}>
                  {monthLabel}
                </Text>
                <Pressable
                  onPress={() => setSelectedMonthIndex(Math.min(monthTotal - 1, monthIdx + 1))}
                  disabled={monthIdx === monthTotal - 1}
                  style={{ padding: 4 }}
                  testID="month-next"
                >
                  <ChevronRight size={16} color={monthIdx === monthTotal - 1 ? "#CBD5E1" : "#4361EE"} />
                </Pressable>
              </View>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <View style={{ backgroundColor: "#EEF2FF", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>{monthLabel}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Check size={13} color="#22C55E" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#15803D" }}>{monthDone}</Text>
                <Text style={{ fontSize: 11, color: "#16A34A", fontWeight: "600" }}>tasks completed</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <AlertTriangle size={12} color={totalOverdue > 0 ? "#EF4444" : "#94A3B8"} />
                <Text style={{ fontSize: 13, fontWeight: "800", color: totalOverdue > 0 ? "#DC2626" : "#94A3B8" }}>{totalOverdue}</Text>
                <Text style={{ fontSize: 11, color: totalOverdue > 0 ? "#EF4444" : "#94A3B8", fontWeight: "600" }}>overdue</Text>
              </View>
            </View>

            {/* Chart */}
            <View style={{ alignItems: "center", marginTop: 12 }}>
              <PerformanceChart data={monthlyStats ?? []} />
            </View>

            {/* Footer: avg completion rate + progress bar */}
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 12, color: "#64748B" }}>
                Last 6 months completion rate{" "}
                <Text style={{ fontWeight: "800", color: "#0F172A" }}>
                  {avgCompletionPct !== null ? `${avgCompletionPct}%` : "—"}
                </Text>
              </Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: "#EEF2FF", overflow: "hidden" }}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "#22C55E",
                    width: `${avgCompletionPct ?? 0}%`,
                  }}
                />
              </View>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#F0FDF4", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={14} color="#22C55E" />
              </View>
            </View>
          </View>
        ) : null}

        {/* ── 3. NEEDS ATTENTION BANNER ─────────────────────────────── */}
        {totalOverdue > 0 ? (
          <Pressable
            style={{
              marginHorizontal: 12,
              marginTop: 8,
              borderRadius: 14,
              backgroundColor: "#FFF7ED",
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
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

        {/* ── 4. TEAM MEMBERS CARD ──────────────────────────────────── */}
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            borderRadius: 20,
            backgroundColor: "white",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {/* Header row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Team Members</Text>
            {!isDemo ? (
              <Pressable
                onPress={handleShareCode}
                style={{
                  backgroundColor: "#4361EE",
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
                testID="add-member-button"
              >
                <UserPlus size={13} color="white" />
                <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>Add Member</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Member rows */}
          {sortedMembers.map((item: TeamMember) => {
            const stats = memberStats?.[item.userId];
            const completed = stats?.completedTasks ?? 0;
            const overdue = stats?.overdueTasks ?? 0;
            const streak = stats?.streak ?? 0;
            const isCurrentUser = item.userId === session?.user?.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedMemberId(item.userId)}
                testID={`member-row-${item.userId}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: "#F0F4FF",
                  backgroundColor: isCurrentUser ? "#F0F4FF" : "white",
                }}
              >
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
                  }}
                >
                  {item.user.image ? (
                    <Image source={{ uri: item.user.image }} style={{ width: 38, height: 38 }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
                      {item.user.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>

                {/* Name */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>
                    {item.user.name}{isCurrentUser ? " (you)" : ""}
                  </Text>
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                    {item.role === "owner" ? "Owner" : item.role === "team_leader" ? "Team Leader" : "Member"}
                  </Text>
                </View>

                {/* Metrics */}
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={12} color="#22C55E" />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>{completed}</Text>
                    {overdue > 0 ? (
                      <>
                        <AlertCircle size={12} color="#EF4444" />
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#EF4444" }}>{overdue}</Text>
                      </>
                    ) : null}
                  </View>
                  {streak > 0 ? (
                    <Text style={{ fontSize: 11, color: "#F97316", fontWeight: "600" }}>{streak}-day streak</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {sortedMembers.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94A3B8" }}>No members yet</Text>
            </View>
          ) : null}
        </View>

        {/* ── Owner hint row ─────────────────────────────────────────── */}
        {isOwner && !isDemo ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 8,
              marginBottom: 8,
              borderRadius: 12,
              backgroundColor: "#EEF2FF",
              padding: 10,
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

              {isPaid ? (
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
              ) : null}

              {isPaid ? (
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
              ) : null}

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
