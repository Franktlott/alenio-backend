import React, { useCallback, useMemo, useRef, useState } from "react";
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
  Dimensions,
} from "react-native";
import { toast } from "burnt";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  UserPlus,
  Clock,
  X,
  Crown,
  Camera,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  QrCode,
} from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { uploadFile } from "@/lib/upload";
import { api } from "@/lib/api/api";
import { formatDaysSinceCheckIn, computeTeamCompliancePercentages, formatTeamCompliancePercent, teamComplianceColor } from "@/lib/member-stats-display";
import {
  memberStandardsBadges,
  mergeWorkplaceStandards,
  type MemberStatsPayload,
  type MemberStandardsCompliance,
} from "@/lib/workplace-standards";
import { StandardsStatusKey } from "@/components/StandardsStatusKey";
import { TeamMemberRow, TeamMemberRowSkeleton, teamMemberListBottomPadding, TEAM_MEMBER_ROW_GAP } from "@/components/TeamMemberRow";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import QRCode from "react-native-qrcode-svg";
import { router, useFocusEffect } from "expo-router";
import { reconcileActiveTeamAfterRemoval } from "@/lib/workspace-switch";
import type { Team, TeamMember, Task } from "@/lib/types";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import { AddMemberModal } from "@/components/AddMemberModal";
import { PendingInvitesChip, PendingInvitesSheet } from "@/components/PendingInvitesSheet";
import { PendingJoinRequestsSheet } from "@/components/PendingJoinRequestsSheet";
import { TeamOverviewTasksSheet, type TeamOverviewTaskFilter } from "@/components/TeamOverviewTasksSheet";
import { AppTabHeader } from "@/components/AppTabHeader";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";
import {
  cancelTeamInvite,
  fetchTeamInvites,
  inviteMemberByEmail,
  resendTeamInvite,
  type TeamInvite,
} from "@/lib/team-invites-api";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { tabBarClearance } from "@/lib/tab-bar";
import Svg, { Path, Circle, Line, Text as SvgText, Polyline } from "react-native-svg";

type JoinRequest = {
  id: string;
  status: string;
  teamId: string;
  team: { id: string; name: string; image: string | null };
  user?: { id: string; name: string; email: string; image: string | null };
  createdAt: string;
};

// ------------------------------------------------------------------
// Line chart component
// ------------------------------------------------------------------
const yTicks = [60, 80, 100];

type FormerMemberRow = {
  userId: string;
  user: TeamMember["user"];
  isFormer: true;
};

function isTaskAssignedToUser(task: Task, userId: string): boolean {
  if (!userId) return false;
  return (task.assignments ?? []).some((assignment) => assignment.userId === userId);
}

function personalCheckInMetricColor(status: MemberStandardsCompliance["checkInStatus"] | undefined): string {
  if (status === "on_track") return "#10B981";
  if (status === "due_soon") return "#F59E0B";
  if (status === "overdue") return "#EF4444";
  return "#94A3B8";
}

function personalGoalsMetricColor(status: MemberStandardsCompliance["goalsStatus"] | undefined): string {
  if (status === "on_track") return "#10B981";
  if (status === "missing_goals") return "#4F46E5";
  return "#94A3B8";
}

function sortMembersWithSelfFirst<T extends { userId: string; user: { name?: string | null } }>(
  members: T[],
  myId: string,
): T[] {
  const byName = (a: T, b: T) => (a.user.name ?? "").localeCompare(b.user.name ?? "");
  if (!myId) return [...members].sort(byName);
  const self = members.find((member) => member.userId === myId);
  const others = members.filter((member) => member.userId !== myId).sort(byName);
  return self ? [self, ...others] : others;
}

function PerformanceChart({ data, dark }: { data: Array<{ label: string; completionPct: number | null }>; dark?: boolean }) {
  const screenW = Dimensions.get("window").width;
  // Card: marginHorizontal 12 + paddingLeft 16 + paddingRight 20 → inset from screen edges for SVG width
  const chartW = Math.max(300, Math.min(screenW - 60, 440));
  const chartH = 120;
  const padL = 40;
  const padB = 28;
  const padT = 22;
  /** Extra room so top-of-dot labels like "100%" are not clipped at the SVG edge */
  const padR = 30;

  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const minY = 55;
  const maxY = 105;

  const count = data.length;
  const toX = (i: number) => (count > 1 ? padL + (i / (count - 1)) * plotW : padL + plotW / 2);
  const toY = (v: number) => padT + plotH - ((v - minY) / (maxY - minY)) * plotH;

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
    <Svg width={chartW} height={chartH}>
      {/* Y-axis grid lines and labels */}
      {yTicks.map((tick) => {
        const cy = toY(tick);
        return (
          <React.Fragment key={tick}>
            <Line
              x1={padL}
              y1={cy}
              x2={chartW - padR}
              y2={cy}
              stroke={dark ? "rgba(255,255,255,0.08)" : "#E0E7FF"}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <SvgText
              x={padL - 4}
              y={cy + 4}
              fontSize={10}
              fill={dark ? "rgba(255,255,255,0.35)" : "#94A3B8"}
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
            stroke={dark ? "#60A5FA" : "#4361EE"}
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
          fill={k === nonNullPoints.length - 1 ? (dark ? "#60A5FA" : "#4361EE") : (dark ? "#0A1628" : "white")}
          stroke={dark ? "#60A5FA" : "#4361EE"}
          strokeWidth={2}
        />
      ))}

      {/* % labels above each dot */}
      {nonNullPoints.map((p, k) => (
        <SvgText
          key={k}
          x={p.x}
          y={p.y - 7}
          fontSize={8}
          fontWeight="700"
          fill={k === nonNullPoints.length - 1 ? (dark ? "#60A5FA" : "#4361EE") : (dark ? "rgba(255,255,255,0.45)" : "#64748B")}
          textAnchor="middle"
        >
          {data[p.index]?.completionPct}%
        </SvgText>
      ))}

      {/* X-axis labels — always shown */}
      {data.map((d, i) => (
        <SvgText
          key={i}
          x={toX(i)}
          y={chartH - 4}
          fontSize={10}
          fill={dark ? "rgba(255,255,255,0.35)" : "#94A3B8"}
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
  const TAB_BAR_CLEARANCE = tabBarClearance(insets.bottom);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
    staleTime: 0,
  });

  useFocusEffect(
    useCallback(() => {
      if (!session?.user || !activeTeamId) return;
      void reconcileActiveTeamAfterRemoval(activeTeamId, setActiveTeamId, queryClient);
    }, [session?.user, activeTeamId, setActiveTeamId, queryClient]),
  );

  const currentMembership = team?.members?.find((m) => m.userId === session?.user?.id);
  const myRole = currentMembership?.role ?? (team as Team & { role?: string } | undefined)?.role;
  const myId = session?.user?.id ?? "";
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader" || myRole === "admin";
  const canViewMemberProfile = (targetUserId: string, targetRole: string) => {
    if (!myId || targetUserId === myId) return true;
    if (targetRole === "owner") return false;
    return myRole === "owner" || myRole === "team_leader";
  };
  const canManageMember = (targetUserId: string, targetRole: string) => {
    if (!myRole || (myRole !== "owner" && myRole !== "team_leader")) return false;
    if (targetRole === "owner") return false;
    if (myRole === "team_leader" && targetRole !== "member") return false;
    return targetUserId !== myId;
  };

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
    if (!activeTeamId) return;
    setUploadingTeamImage(true);
    try {
      const uploaded = await uploadFile(result.assets[0].uri, "team-photo.jpg", "image/jpeg", {
        purpose: "team",
        teamId: activeTeamId,
      });
      updateTeamImageMutation.mutate(uploaded.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      Alert.alert("Failed to upload photo", message);
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

  const { data: allTeams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<(Team & { role?: string })[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });

  const manageableTeams = useMemo(
    () => allTeams.filter((t) => t.role === "owner" || t.role === "team_leader"),
    [allTeams],
  );

  type ApiJoinRequest = {
    id: string;
    status: string;
    teamId: string;
    createdAt: string;
    user?: { id: string; name: string; email: string; image: string | null };
  };

  type GoLoginRequest = {
    id: string;
    status: string;
    teamId: string;
    deviceId: string;
    deviceLabel: string | null;
    createdAt: string;
    teamName?: string;
  };

  const joinRequestQueries = useQueries({
    queries: manageableTeams.map((t) => ({
      queryKey: ["team-join-requests", t.id] as const,
      queryFn: () => api.get<ApiJoinRequest[]>(`/api/teams/${t.id}/join-requests`),
      enabled: manageableTeams.length > 0,
      staleTime: 0,
      refetchInterval: 15000,
      refetchOnMount: "always" as const,
    })),
  });

  const goLoginRequestQueries = useQueries({
    queries: manageableTeams.map((t) => ({
      queryKey: ["team-go-login-requests", t.id] as const,
      queryFn: () => api.get<GoLoginRequest[]>(`/api/teams/${t.id}/go-login-requests`),
      enabled: manageableTeams.length > 0,
      staleTime: 0,
      refetchInterval: 15000,
      refetchOnMount: "always" as const,
    })),
  });

  // Also keep a direct active-team fetch so the button never depends only on the teams list race.
  const { data: activeTeamJoinRequests = [] } = useQuery({
    queryKey: ["team-join-requests", activeTeamId],
    queryFn: () => api.get<ApiJoinRequest[]>(`/api/teams/${activeTeamId}/join-requests`),
    enabled: !!activeTeamId && isOwnerOrLeader,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
  });

  const { data: activeTeamGoLoginRequests = [] } = useQuery({
    queryKey: ["team-go-login-requests", activeTeamId],
    queryFn: () => api.get<GoLoginRequest[]>(`/api/teams/${activeTeamId}/go-login-requests`),
    enabled: !!activeTeamId && isOwnerOrLeader,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
  });

  const incomingRequests = useMemo(() => {
    const byId = new Map<string, JoinRequest>();
    const upsert = (req: ApiJoinRequest, teamRow: { id: string; name: string; image?: string | null }) => {
      if (req.status && req.status !== "pending") return;
      byId.set(req.id, {
        ...req,
        teamId: req.teamId || teamRow.id,
        team: { id: teamRow.id, name: teamRow.name, image: teamRow.image ?? null },
      });
    };

    manageableTeams.forEach((teamRow, index) => {
      const data = joinRequestQueries[index]?.data;
      if (!Array.isArray(data)) return;
      for (const req of data) upsert(req, teamRow);
    });

    if (activeTeamId && Array.isArray(activeTeamJoinRequests)) {
      const activeMeta =
        manageableTeams.find((t) => t.id === activeTeamId) ??
        (team ? { id: team.id, name: team.name, image: team.image } : { id: activeTeamId, name: "Workspace", image: null });
      for (const req of activeTeamJoinRequests) upsert(req, activeMeta);
    }

    return Array.from(byId.values());
  }, [manageableTeams, joinRequestQueries, activeTeamId, activeTeamJoinRequests, team]);

  const incomingGoLoginRequests = useMemo(() => {
    const byId = new Map<string, GoLoginRequest>();
    const upsert = (req: GoLoginRequest, teamName: string, teamId: string) => {
      if (req.status && req.status !== "pending") return;
      byId.set(req.id, { ...req, teamId: req.teamId || teamId, teamName });
    };

    manageableTeams.forEach((teamRow, index) => {
      const data = goLoginRequestQueries[index]?.data;
      if (!Array.isArray(data)) return;
      for (const req of data) upsert(req, teamRow.name, teamRow.id);
    });

    if (activeTeamId && Array.isArray(activeTeamGoLoginRequests)) {
      const name = team?.name ?? "Workspace";
      for (const req of activeTeamGoLoginRequests) upsert(req, name, activeTeamId);
    }

    return Array.from(byId.values());
  }, [manageableTeams, goLoginRequestQueries, activeTeamId, activeTeamGoLoginRequests, team]);

  const pendingApprovalCount = incomingRequests.length + incomingGoLoginRequests.length;

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {}),
    onMutate: ({ requestId }) => setJoinRequestActionId(requestId),
    onSettled: () => setJoinRequestActionId(null),
    onSuccess: (_data, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      if (teamId === activeTeamId) {
        queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {}),
    onMutate: ({ requestId }) => setJoinRequestActionId(requestId),
    onSettled: () => setJoinRequestActionId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
    },
  });

  const approveGoLoginMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/go-login-requests/${requestId}/approve`, {}),
    onMutate: ({ requestId }) => setJoinRequestActionId(requestId),
    onSettled: () => setJoinRequestActionId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] }),
  });

  const rejectGoLoginMutation = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/go-login-requests/${requestId}/reject`, {}),
    onMutate: ({ requestId }) => setJoinRequestActionId(requestId),
    onSettled: () => setJoinRequestActionId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] }),
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["team-invites", activeTeamId],
    queryFn: () => fetchTeamInvites(activeTeamId!),
    enabled: !!activeTeamId && isOwnerOrLeader,
    refetchInterval: 30000,
  });

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [pendingInvitesOpen, setPendingInvitesOpen] = useState(false);
  const [overviewTasksSheet, setOverviewTasksSheet] = useState<TeamOverviewTaskFilter | null>(null);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [joinRequestActionId, setJoinRequestActionId] = useState<string | null>(null);

  const inviteMemberMutation = useMutation({
    mutationFn: (email: string) => inviteMemberByEmail(activeTeamId!, email),
    onSuccess: (result) => {
      setAddMemberError(null);
      setAddMemberOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team-invites", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      if (result.added && result.user) {
        toast({ title: `${result.user.name} added to the team`, preset: "done" });
      } else if (result.emailSent) {
        toast({ title: "Invite email sent", preset: "done" });
      } else {
        toast({ title: "Invite created (email not sent — check server email config)", preset: "none" });
      }
    },
    onError: (err: Error) => {
      const msg = err.message;
      setAddMemberError(
        msg.includes("404")
          ? "Could not reach the invite service. Restart your backend dev server so it picks up the latest code."
          : msg,
      );
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (inviteId: string) => cancelTeamInvite(activeTeamId!, inviteId),
    onMutate: (inviteId) => setInviteActionId(inviteId),
    onSettled: () => setInviteActionId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-invites", activeTeamId] }),
  });

  const resendInviteMutation = useMutation({
    mutationFn: (inviteId: string) => resendTeamInvite(activeTeamId!, inviteId),
    onMutate: (inviteId) => setInviteActionId(inviteId),
    onSettled: () => setInviteActionId(null),
    onSuccess: () => toast({ title: "Invite resent", preset: "done" }),
    onError: (err: Error) => toast({ title: err.message, preset: "error" }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [formerMembersOpen, setFormerMembersOpen] = useState(false);
  const membersListRef = useRef<ScrollView>(null);

  const { data: memberStatsPayload, isLoading: memberStatsLoading } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<MemberStatsPayload>(`/api/teams/${activeTeamId}/tasks/member-stats`),
    enabled: !!activeTeamId && isPaid,
  });
  const memberStats = memberStatsPayload?.stats;
  const workplaceStandards = mergeWorkplaceStandards(memberStatsPayload?.workplaceStandards);

  const { data: formerMembers = [] } = useQuery({
    queryKey: ["former-members", activeTeamId],
    queryFn: () => api.get<FormerMemberRow[]>(`/api/teams/${activeTeamId}/former-members`),
    enabled: !!activeTeamId && isPaid && isOwnerOrLeader,
  });

  const { data: teamTasksData } = useQuery({
    queryKey: ["team-overview-tasks", activeTeamId],
    queryFn: () =>
      api.get<{ tasks: Task[]; nextCursor: string | null }>(
        `/api/teams/${activeTeamId}/tasks?activeOnly=true&limit=500`,
      ),
    enabled: !!activeTeamId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["former-members", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["team-overview-tasks", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["team-invites", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
    await queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] });
    setRefreshing(false);
  };

  const toggleFormerMembers = () => {
    setFormerMembersOpen((open) => {
      const next = !open;
      if (next) {
        setTimeout(() => {
          membersListRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
      return next;
    });
  };

  const handleCopyCode = async () => {
    if (team?.inviteCode) await Clipboard.setStringAsync(team.inviteCode);
  };

  const handleShareCode = () => {
    if (team?.inviteCode) {
      Share.share({ message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}` });
    }
  };

  // Derived overview stats from actual team tasks
  const teamTasks = teamTasksData?.tasks ?? [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);
  const isTaskDone = (t: Task) => t.status === "done";
  const isTaskOverdue = (t: Task) => !isTaskDone(t) && !!t.dueDate && new Date(t.dueDate) < todayStart;
  const isTaskDueToday = (t: Task) => {
    if (isTaskDone(t) || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    return due >= todayStart && due <= todayEnd;
  };

  const showTeamOverview = isOwnerOrLeader;
  const overviewSourceTasks = showTeamOverview
    ? teamTasks
    : teamTasks.filter((t) => isTaskAssignedToUser(t, myId));
  const myMemberStats = memberStats?.[myId];
  const myCompliance = myMemberStats?.standardsCompliance;
  const members = team?.members ?? [];
  const teamCompliance = computeTeamCompliancePercentages({
    memberUserIds: members.filter((m) => m.role !== "owner").map((m) => m.userId),
    memberStats,
    workplaceStandards,
  });

  const totalOpen = overviewSourceTasks.filter((t) => !isTaskDone(t)).length;
  const openTasks = overviewSourceTasks
    .filter((t) => !isTaskDone(t))
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  const dueTodayTasks = overviewSourceTasks
    .filter((t) => isTaskDueToday(t))
    .sort((a, b) => a.title.localeCompare(b.title));
  const totalDueToday = dueTodayTasks.length;
  const overdueTasks = overviewSourceTasks
    .filter((t) => isTaskOverdue(t))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const totalOverdue = overdueTasks.length;
  const hasTappableTaskStats = totalOpen > 0 || totalDueToday > 0 || totalOverdue > 0;
  const overviewComplianceMetrics = showTeamOverview
    ? ([
        {
          key: "checkIn",
          value: formatTeamCompliancePercent(teamCompliance.checkInCompliancePct),
          label: "Check-in compliance",
          color: teamComplianceColor(teamCompliance.checkInCompliancePct),
        },
        {
          key: "devPlan",
          value: formatTeamCompliancePercent(teamCompliance.developmentPlanCompliancePct),
          label: "Development plan compliance",
          color: teamComplianceColor(teamCompliance.developmentPlanCompliancePct),
        },
      ] as const)
    : ([
        {
          key: "checkIn",
          value: formatDaysSinceCheckIn(myMemberStats?.daysSinceLastOneOnOne),
          label: "Last check-in",
          color: personalCheckInMetricColor(myCompliance?.checkInStatus),
        },
        {
          key: "goals",
          value: myCompliance?.goalsDisplay ?? "—",
          label: "Goals",
          color: personalGoalsMetricColor(myCompliance?.goalsStatus),
        },
      ] as const);

  const overviewSheetTasks =
    overviewTasksSheet === "open"
      ? openTasks
      : overviewTasksSheet === "dueToday"
        ? dueTodayTasks
        : overviewTasksSheet === "overdue"
          ? overdueTasks
          : [];

  // Logged-in user first, then everyone else alphabetically
  const sortedMembers = sortMembersWithSelfFirst(members, myId);
  const showMemberSkeletons = isLoading || (isPaid && memberStatsLoading && !memberStatsPayload && !refreshing);

  // ------------------------------------------------------------------
  // Guard states
  // ------------------------------------------------------------------
  if (!hasHydrated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F3F7", alignItems: "center", justifyContent: "center" }} edges={["top"]}>
        <ActivityIndicator color="#4361EE" size="large" />
      </SafeAreaView>
    );
  }

  if (!activeTeamId) {
    const myRequest = myPendingRequests[0] ?? null;
    if (myRequest) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={[]}>
          <AppTabHeader topInset={insets.top} testID="team-header" />
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
              Your Request
            </Text>
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <UserAvatar
                  user={{ name: session?.user?.name, image: session?.user?.image }}
                  size={44}
                  radius={22}
                  backgroundColor="#EEF2FF"
                  textColor="#4361EE"
                  fontSize={18}
                />
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
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={[]} testID="team-screen">

      <AppTabHeader topInset={insets.top} testID="team-header" />

      <View style={{ flex: 1, paddingBottom: TAB_BAR_CLEARANCE }}>
        {/* ── Team info card (fixed) ── */}
        <View style={{
          marginHorizontal: 12,
          marginTop: 12,
          borderRadius: 20,
          overflow: "hidden",
          shadowColor: "#4361EE",
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        }}>
          <LinearGradient
            colors={["#4361EE", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ padding: 14 }}
          >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {/* Avatar */}
            <TouchableOpacity
              onPress={() => isOwnerOrLeader ? setPhotoMenuOpen(true) : undefined}
              disabled={uploadingTeamImage}
              testID="team-photo-button"
              style={{ position: "relative" }}
            >
              <View style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(255,255,255,0.22)",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}>
                {uploadingTeamImage ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <WorkspaceTeamAvatar
                    team={{ name: team?.name ?? "Workspace", image: team?.image ?? null }}
                    size={64}
                    radius={32}
                    backgroundColor="rgba(255,255,255,0.22)"
                    textColor="#FFFFFF"
                    borderColor="transparent"
                  />
                )}
              </View>
              {isOwnerOrLeader ? (
                <View style={{
                  position: "absolute", bottom: 1, right: 1,
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center",
                  borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)",
                }}>
                  <Camera size={10} color="white" />
                </View>
              ) : null}
            </TouchableOpacity>

            {/* Middle: team name (primary) + invite code + subtitle */}
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 20, fontWeight: "800", color: "white", letterSpacing: -0.3 }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {team?.name ?? "Team"}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.92)", letterSpacing: 2, marginTop: 6 }}>
                {team?.inviteCode}
              </Text>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
                Share this code to invite team members
              </Text>
            </View>

            {/* Right: icon buttons */}
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setQrModalOpen(true)}
                style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}
                testID="qr-invite-code"
              >
                <QrCode size={20} color="white" />
              </Pressable>
              <Pressable
                onPress={handleShareCode}
                style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" }}
                testID="share-invite-code"
              >
                <UserPlus size={20} color="white" />
              </Pressable>
            </View>
          </View>
          </LinearGradient>
        </View>

        {/* ── 2. AT A GLANCE CARD (paid only, unified) ──────────────── */}
        {isPaid ? (
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 16,
              marginHorizontal: 12,
              marginTop: 8,
              paddingTop: 10,
              paddingBottom: 8,
              paddingHorizontal: 14,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 3 },
              elevation: 3,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A", marginBottom: 6 }}>
              {showTeamOverview ? "Team Overview" : "My Overview"}
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
              {(
                [
                  { key: "open" as const, value: totalOpen, label: "Open", color: "#10B981" },
                  { key: "dueToday" as const, value: totalDueToday, label: "Due today", color: "#F59E0B" },
                  { key: "overdue" as const, value: totalOverdue, label: "Overdue", color: "#EF4444" },
                ] as const
              ).map(({ key, value, label, color }) => {
                const statContent = (
                  <>
                    <Text style={{ fontSize: 20, fontWeight: "900", color, lineHeight: 22 }}>{value}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 10, color: "#64748B", marginTop: 1, textAlign: "center" }}>
                      {label}
                    </Text>
                  </>
                );

                if (value > 0) {
                  return (
                    <Pressable
                      key={key}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}
                      onPress={() => setOverviewTasksSheet(key)}
                      testID={`team-overview-${key}`}
                    >
                      {statContent}
                    </Pressable>
                  );
                }

                return (
                  <View key={key} style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
                    {statContent}
                  </View>
                );
              })}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
              {overviewComplianceMetrics.map(({ key, value, label, color }) => (
                <View key={key} style={{ flex: 1, alignItems: "center", paddingVertical: 2 }}>
                  <Text
                    numberOfLines={showTeamOverview ? 1 : 2}
                    style={
                      showTeamOverview
                        ? { fontSize: 20, fontWeight: "900", color, lineHeight: 22, textAlign: "center" }
                        : { fontSize: 13, fontWeight: "700", color, lineHeight: 16, textAlign: "center" }
                    }
                  >
                    {value}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 10, color: "#64748B", marginTop: 1, textAlign: "center", lineHeight: 13 }}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            {hasTappableTaskStats ? (
              <Text
                numberOfLines={1}
                style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}
              >
                Tap a number to view tasks
              </Text>
            ) : null}
          </View>
        ) : null}


        {/* ── 4. TEAM MEMBERS CARD ──────────────────────────────────── */}
        <View
          style={{
            flex: 1,
            minHeight: 0,
            marginHorizontal: 12,
            marginTop: 8,
            marginBottom: 4,
            borderRadius: 20,
            backgroundColor: "white",
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
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 8,
              gap: 8,
              zIndex: 2,
            }}
          >
            <View style={{ flexShrink: 1, minWidth: 0, paddingRight: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>
                  Team Members
                </Text>
                {isPaid ? <StandardsStatusKey iconSize={16} /> : null}
              </View>
            </View>
            {isOwnerOrLeader ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {pendingApprovalCount > 0 ? (
                  <Pressable
                    onPress={() => setJoinRequestsOpen(true)}
                    hitSlop={8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginRight: 6,
                      backgroundColor: "#4338CA",
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 8,
                      minHeight: 32,
                    }}
                    testID="pending-join-requests-chip"
                    accessibilityRole="button"
                    accessibilityLabel={`${pendingApprovalCount} pending approval${pendingApprovalCount !== 1 ? "s" : ""}, tap to review`}
                  >
                    <UserPlus size={13} color="#FFFFFF" />
                    <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "800", color: "#FFFFFF" }}>
                      {pendingApprovalCount === 1 ? "1 request" : `${pendingApprovalCount} requests`}
                    </Text>
                  </Pressable>
                ) : null}
                <PendingInvitesChip count={pendingInvites.length} onPress={() => setPendingInvitesOpen(true)} />
                <Pressable
                  onPress={() => {
                    setAddMemberError(null);
                    setAddMemberOpen(true);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginLeft: pendingApprovalCount > 0 || pendingInvites.length > 0 ? 6 : 0,
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#C7D2FE",
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 8,
                    minHeight: 32,
                  }}
                  testID="add-member-button"
                >
                  <UserPlus size={13} color="#4361EE" />
                  <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: "700", color: "#4361EE" }}>Add</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Member cards (scrollable) */}
          <ScrollView
            ref={membersListRef}
            style={{ flex: 1, overflow: "hidden", borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 10,
              paddingBottom: teamMemberListBottomPadding(formerMembers.length > 0),
              gap: TEAM_MEMBER_ROW_GAP,
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
            }
            testID="members-list"
          >
          {showMemberSkeletons ? (
            Array.from({ length: 4 }, (_, index) => (
              <TeamMemberRowSkeleton key={`member-skeleton-${index}`} paid={isPaid} />
            ))
          ) : (
          sortedMembers.map((item: TeamMember) => {
            const stats = memberStats?.[item.userId];
            const compliance = stats?.standardsCompliance;
            const complianceBadges = compliance
              ? memberStandardsBadges(compliance, stats?.daysSinceLastOneOnOne)
              : [];
            const primaryBadge = complianceBadges[0] ?? null;
            const isCurrentUser = item.userId === myId;
            const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
            const canOpenProfile = hasProfilePermission;
            const canOpenManagement = !isPaid && canManageMember(item.userId, item.role);
            const isPressable = canOpenProfile || canOpenManagement;

            return (
              <TeamMemberRow
                key={item.id}
                name={item.user.name ?? "Member"}
                role={item.role}
                image={item.user.image}
                isCurrentUser={isCurrentUser}
                showMetrics={isPaid}
                hasProfilePermission={hasProfilePermission}
                checkInValue={formatDaysSinceCheckIn(stats?.daysSinceLastOneOnOne)}
                goalsValue={compliance?.goalsDisplay ?? "—"}
                statusBadge={primaryBadge}
                onPress={
                  isPressable
                    ? () =>
                        router.push({
                          pathname: "/member-profile",
                          params: { teamId: activeTeamId ?? "", memberUserId: item.userId },
                        })
                    : undefined
                }
                testID={`member-row-${item.userId}`}
              />
            );
          })
          )}

          {!showMemberSkeletons && sortedMembers.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 13, color: "#94A3B8" }}>No members yet</Text>
            </View>
          ) : null}

          {isOwnerOrLeader && formerMembers.length > 0 ? (
            <View
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
              }}
            >
              <Pressable
                onPress={toggleFormerMembers}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
                testID="former-members-toggle"
              >
                <Text style={{ fontSize: 10, color: "#CBD5E1" }}>
                  Former members ({formerMembers.length})
                </Text>
                <ChevronDown
                  size={14}
                  color="#CBD5E1"
                  style={{ transform: [{ rotate: formerMembersOpen ? "180deg" : "0deg" }] }}
                />
              </Pressable>
              {formerMembersOpen ? (
                <View style={{ marginTop: 4, paddingBottom: 2 }}>
                  {formerMembers.map((former, index) => (
                    <Pressable
                      key={former.userId}
                      onPress={() =>
                        router.push({
                          pathname: "/member-profile",
                          params: { teamId: activeTeamId ?? "", memberUserId: former.userId },
                        })
                      }
                      style={{
                        paddingVertical: 6,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: "#F8FAFC",
                      }}
                      testID={`former-member-row-${former.userId}`}
                    >
                      <Text style={{ fontSize: 12, color: "#94A3B8" }} numberOfLines={1}>
                        {former.user.name ?? former.user.email ?? "Member"}
                        <Text style={{ color: "#CBD5E1" }}> · archived check-ins</Text>
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
          </ScrollView>
        </View>

        {isPaid && isOwnerOrLeader ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 4,
              flexShrink: 0,
              backgroundColor: "#EEF2FF",
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#BFDBFE",
            }}
          >
            <Crown size={14} color="#4361EE" />
            <Text style={{ fontSize: 12, color: "#4361EE", fontWeight: "600", flex: 1 }}>
              Tap a member to view their profile, growth plan, and check-in history.
            </Text>
            <ChevronRight size={16} color="#4361EE" />
          </View>
        ) : isPaid ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 4,
              flexShrink: 0,
              backgroundColor: "#F8FAFC",
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>
              Tap your name to view your profile, growth plan, and check-in history.
            </Text>
          </View>
        ) : !isPaid && isOwnerOrLeader ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 4,
              flexShrink: 0,
              backgroundColor: "#F8FAFC",
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>
              Tap a member to change their role or remove them from the workplace.
            </Text>
          </View>
        ) : !isPaid ? (
          <View
            style={{
              marginHorizontal: 12,
              marginTop: 4,
              flexShrink: 0,
              backgroundColor: "#F8FAFC",
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600" }}>
              Team access is required to view growth plans and check-in history. Open Workplace Access to upgrade.
            </Text>
          </View>
        ) : null}
      </View>

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

      <AddMemberModal
        visible={addMemberOpen}
        teamId={activeTeamId ?? ""}
        teamName={team?.name ?? "Team"}
        confirming={inviteMemberMutation.isPending}
        error={addMemberError}
        onClose={() => {
          setAddMemberError(null);
          setAddMemberOpen(false);
        }}
        onClearError={() => setAddMemberError(null)}
        onConfirm={(email) => inviteMemberMutation.mutate(email)}
      />

      <PendingJoinRequestsSheet
        visible={joinRequestsOpen}
        requests={incomingRequests}
        goLoginRequests={incomingGoLoginRequests}
        activeTeamId={activeTeamId}
        busyRequestId={joinRequestActionId}
        onClose={() => setJoinRequestsOpen(false)}
        onApprove={(req) => approveMutation.mutate({ teamId: req.teamId || req.team.id, requestId: req.id })}
        onDecline={(req) => rejectMutation.mutate({ teamId: req.teamId || req.team.id, requestId: req.id })}
        onApproveGo={(req) =>
          approveGoLoginMutation.mutate({ teamId: req.teamId || activeTeamId!, requestId: req.id })
        }
        onDeclineGo={(req) =>
          rejectGoLoginMutation.mutate({ teamId: req.teamId || activeTeamId!, requestId: req.id })
        }
      />

      <PendingInvitesSheet
        visible={pendingInvitesOpen}
        invites={pendingInvites}
        busyInviteId={inviteActionId}
        onClose={() => setPendingInvitesOpen(false)}
        onCancel={(invite) => cancelInviteMutation.mutate(invite.id)}
        onResend={(invite) => resendInviteMutation.mutate(invite.id)}
      />

      <TeamOverviewTasksSheet
        visible={overviewTasksSheet !== null}
        filter={overviewTasksSheet ?? "open"}
        tasks={overviewSheetTasks}
        onClose={() => setOverviewTasksSheet(null)}
        onTaskPress={(task) => {
          setOverviewTasksSheet(null);
          router.push({ pathname: "/task-detail", params: { taskId: task.id, teamId: activeTeamId! } });
        }}
      />

    </SafeAreaView>
  );
}
