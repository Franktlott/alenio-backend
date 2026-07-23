import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Smartphone, UserPlus, Mail, Settings, X } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import {
  cancelTeamInvite,
  fetchTeamInvites,
  resendTeamInvite,
  type TeamInvite,
} from "@/lib/team-invites-api";

type JoinRequest = {
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
};

type MyJoinRequest = {
  id: string;
  status: string;
  createdAt: string;
  team: { id: string; name: string; image: string | null };
};

type PendingEvent = {
  id: string;
  title: string;
  startDate: string;
  teamId?: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ActionPair({
  busy,
  onDecline,
  onApprove,
  testIdPrefix,
}: {
  busy: boolean;
  onDecline: () => void;
  onApprove: () => void;
  testIdPrefix: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Pressable
        onPress={onDecline}
        disabled={busy}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: "#F8FAFC",
          borderWidth: 1,
          borderColor: "#E2E8F0",
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.5 : 1,
        }}
        testID={`${testIdPrefix}-decline`}
      >
        <X size={15} color="#64748B" />
      </Pressable>
      <Pressable
        onPress={onApprove}
        disabled={busy}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: "#4361EE",
          alignItems: "center",
          justifyContent: "center",
          opacity: busy ? 0.5 : 1,
        }}
        testID={`${testIdPrefix}-approve`}
      >
        {busy ? <ActivityIndicator size="small" color="white" /> : <Check size={15} color="white" />}
      </Pressable>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: "#94A3B8",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        marginBottom: 2,
      }}
    >
      {children}
    </Text>
  );
}

export function HeaderNotificationsButton({ testID = "header-notifications-button" }: { testID?: string }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 60_000,
  });

  const manageableTeams = useMemo(
    () => teams.filter((t) => t.role === "owner" || t.role === "team_leader" || t.role === "admin"),
    [teams],
  );
  const manageableIds = useMemo(() => manageableTeams.map((t) => t.id), [manageableTeams]);
  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teams) map.set(t.id, t.name);
    return map;
  }, [teams]);

  const joinQueries = useQueries({
    queries: manageableIds.map((teamId) => ({
      queryKey: ["team-join-requests", teamId] as const,
      queryFn: () => api.get<JoinRequest[]>(`/api/teams/${teamId}/join-requests`),
      enabled: manageableIds.length > 0,
      staleTime: 15_000,
      refetchInterval: 25_000,
    })),
  });

  const goQueries = useQueries({
    queries: manageableIds.map((teamId) => ({
      queryKey: ["team-go-login-requests", teamId] as const,
      queryFn: () => api.get<GoLoginRequest[]>(`/api/teams/${teamId}/go-login-requests`),
      enabled: manageableIds.length > 0,
      staleTime: 15_000,
      refetchInterval: 25_000,
    })),
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["team-invites", activeTeamId],
    queryFn: () => fetchTeamInvites(activeTeamId!),
    enabled: !!activeTeamId && manageableIds.includes(activeTeamId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const { data: myJoinRequests = [] } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<MyJoinRequest[]>("/api/join-requests/mine"),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const { data: pendingEvents = [] } = useQuery({
    queryKey: ["calendar-events-pending", activeTeamId],
    queryFn: () => api.get<PendingEvent[]>(`/api/teams/${activeTeamId}/events/pending`),
    enabled: !!activeTeamId && manageableIds.includes(activeTeamId),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const joinRequests = useMemo(() => {
    const rows: (JoinRequest & { teamName: string })[] = [];
    joinQueries.forEach((q, i) => {
      const teamId = manageableIds[i];
      if (!teamId || !Array.isArray(q.data)) return;
      for (const r of q.data) {
        if (r.status !== "pending") continue;
        rows.push({
          ...r,
          teamId: r.teamId || teamId,
          teamName: teamNameById.get(r.teamId || teamId) ?? "Workspace",
        });
      }
    });
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [joinQueries, manageableIds, teamNameById]);

  const goRequests = useMemo(() => {
    const rows: (GoLoginRequest & { teamName: string })[] = [];
    goQueries.forEach((q, i) => {
      const teamId = manageableIds[i];
      if (!teamId || !Array.isArray(q.data)) return;
      for (const r of q.data) {
        if (r.status !== "pending") continue;
        rows.push({
          ...r,
          teamId: r.teamId || teamId,
          teamName: teamNameById.get(r.teamId || teamId) ?? "Workspace",
        });
      }
    });
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [goQueries, manageableIds, teamNameById]);

  const outgoingPending = useMemo(
    () => myJoinRequests.filter((r) => r.status === "pending"),
    [myJoinRequests],
  );

  const openInvites = useMemo(
    () => pendingInvites.filter((i) => i.status === "pending"),
    [pendingInvites],
  );

  const badgeCount =
    joinRequests.length +
    goRequests.length +
    openInvites.length +
    outgoingPending.length +
    pendingEvents.length;

  const approveJoin = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/approve`, {}),
    onMutate: ({ requestId }) => setBusyId(requestId),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });

  const rejectJoin = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/join-requests/${requestId}/reject`, {}),
    onMutate: ({ requestId }) => setBusyId(requestId),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-join-requests"] }),
  });

  const approveGo = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/go-login-requests/${requestId}/approve`, {}),
    onMutate: ({ requestId }) => setBusyId(requestId),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] }),
  });

  const rejectGo = useMutation({
    mutationFn: ({ teamId, requestId }: { teamId: string; requestId: string }) =>
      api.post(`/api/teams/${teamId}/go-login-requests/${requestId}/reject`, {}),
    onMutate: ({ requestId }) => setBusyId(requestId),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-go-login-requests"] }),
  });

  const withdrawMine = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onMutate: (requestId) => setBusyId(requestId),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
  });

  const cancelInvite = useMutation({
    mutationFn: (invite: TeamInvite) => cancelTeamInvite(invite.teamId, invite.id),
    onMutate: (invite) => setBusyId(invite.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-invites"] }),
  });

  const resendInvite = useMutation({
    mutationFn: (invite: TeamInvite) => resendTeamInvite(invite.teamId, invite.id),
    onMutate: (invite) => setBusyId(invite.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-invites"] }),
  });

  const approveEvent = useMutation({
    mutationFn: (event: PendingEvent) =>
      api.post(`/api/teams/${event.teamId || activeTeamId}/events/${event.id}/approve`, {}),
    onMutate: (event) => setBusyId(event.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events-pending"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });

  const rejectEvent = useMutation({
    mutationFn: (event: PendingEvent) =>
      api.post(`/api/teams/${event.teamId || activeTeamId}/events/${event.id}/reject`, {}),
    onMutate: (event) => setBusyId(event.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-events-pending"] }),
  });

  const empty = badgeCount === 0;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          badgeCount > 0 ? `Approvals and requests, ${badgeCount} pending` : "Approvals and requests"
        }
        testID={testID}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.16)",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Bell size={18} color="white" strokeWidth={2.25} />
        {badgeCount > 0 ? (
          <View
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 4,
              backgroundColor: "#EF4444",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: "#5B21B6",
            }}
          >
            <Text style={{ color: "white", fontSize: 9, fontWeight: "800" }}>
              {badgeCount > 9 ? "9+" : String(badgeCount)}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <AlenioBottomSheet
        visible={open}
        title="Approvals & requests"
        subtitle="Join requests, invites, and items that need your attention"
        onClose={() => setOpen(false)}
        compact
        showCloseButton
        testID="header-notifications-sheet"
        footer={
          <>
            <Pressable
              onPress={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 10,
              }}
              testID="header-notifications-settings"
            >
              <Settings size={14} color="#64748B" />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Notification settings</Text>
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={[alenioSheetStyles.cancelButton, { paddingVertical: 2 }]}>
              <Text style={alenioSheetStyles.cancelButtonText}>Close</Text>
            </Pressable>
          </>
        }
      >
        {empty ? (
          <AlenioSheetCard tint="slate" compact>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#334155", textAlign: "center" }}>
              You&apos;re all caught up
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", marginTop: 4, lineHeight: 17 }}>
              Join requests, Alenio Go logins, invites, and calendar approvals will show up here.
            </Text>
          </AlenioSheetCard>
        ) : null}

        {joinRequests.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Pending members</SectionLabel>
            {joinRequests.map((req) => (
              <AlenioSheetCard key={req.id} compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {req.user?.image ? (
                      <Image source={{ uri: req.user.image }} style={{ width: 32, height: 32 }} />
                    ) : (
                      <UserPlus size={15} color="#4361EE" />
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {req.user?.name ?? "Someone"}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#64748B" }} numberOfLines={1}>
                      Join {req.teamName} · {formatDate(req.createdAt)}
                    </Text>
                  </View>
                  <ActionPair
                    busy={busyId === req.id}
                    testIdPrefix={`notif-join-${req.id}`}
                    onApprove={() => approveJoin.mutate({ teamId: req.teamId, requestId: req.id })}
                    onDecline={() => rejectJoin.mutate({ teamId: req.teamId, requestId: req.id })}
                  />
                </View>
              </AlenioSheetCard>
            ))}
          </View>
        ) : null}

        {goRequests.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Alenio Go logins</SectionLabel>
            {goRequests.map((req) => (
              <AlenioSheetCard key={req.id} compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Smartphone size={15} color="#4361EE" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {req.deviceLabel || "Tablet device"}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#64748B" }} numberOfLines={1}>
                      {req.teamName} · {formatDate(req.createdAt)}
                    </Text>
                  </View>
                  <ActionPair
                    busy={busyId === req.id}
                    testIdPrefix={`notif-go-${req.id}`}
                    onApprove={() => approveGo.mutate({ teamId: req.teamId, requestId: req.id })}
                    onDecline={() => rejectGo.mutate({ teamId: req.teamId, requestId: req.id })}
                  />
                </View>
              </AlenioSheetCard>
            ))}
          </View>
        ) : null}

        {pendingEvents.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Calendar approvals</SectionLabel>
            {pendingEvents.map((event) => (
              <AlenioSheetCard key={event.id} compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#64748B" }} numberOfLines={1}>
                      {formatDate(event.startDate)}
                    </Text>
                  </View>
                  <ActionPair
                    busy={busyId === event.id}
                    testIdPrefix={`notif-event-${event.id}`}
                    onApprove={() => approveEvent.mutate(event)}
                    onDecline={() => rejectEvent.mutate(event)}
                  />
                </View>
              </AlenioSheetCard>
            ))}
          </View>
        ) : null}

        {openInvites.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Pending invites</SectionLabel>
            {openInvites.map((invite) => (
              <AlenioSheetCard key={invite.id} compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: "#F8FAFC",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Mail size={15} color="#64748B" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {invite.email}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#64748B" }} numberOfLines={1}>
                      Invited {formatDate(invite.createdAt)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => resendInvite.mutate(invite)}
                    disabled={busyId === invite.id}
                    style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#4361EE" }}>Resend</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => cancelInvite.mutate(invite)}
                    disabled={busyId === invite.id}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                    }}
                  >
                    {busyId === invite.id ? (
                      <ActivityIndicator size="small" color="#64748B" />
                    ) : (
                      <X size={15} color="#64748B" />
                    )}
                  </Pressable>
                </View>
              </AlenioSheetCard>
            ))}
          </View>
        ) : null}

        {outgoingPending.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionLabel>Your join requests</SectionLabel>
            {outgoingPending.map((req) => (
              <AlenioSheetCard key={req.id} tint="slate" compact>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
                      {req.team.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#64748B" }}>Waiting for approval</Text>
                  </View>
                  <Pressable
                    onPress={() => withdrawMine.mutate(req.id)}
                    disabled={busyId === req.id}
                    style={{ paddingHorizontal: 8, paddingVertical: 6 }}
                  >
                    {busyId === req.id ? (
                      <ActivityIndicator size="small" color="#64748B" />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#EF4444" }}>Withdraw</Text>
                    )}
                  </Pressable>
                </View>
              </AlenioSheetCard>
            ))}
          </View>
        ) : null}
      </AlenioBottomSheet>
    </>
  );
}
