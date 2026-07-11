import { Tabs, router } from "expo-router";
import { BlurView } from "expo-blur";
import { CheckSquare, Users, User, MessageCircle, Activity } from "lucide-react-native";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TAB_BAR_ACTIVE_COLOR,
  TAB_BAR_DIVIDER_COLOR,
  TAB_BAR_HEIGHT,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INACTIVE_COLOR,
  TAB_BAR_LABEL_SIZE,
} from "@/lib/tab-bar";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTaskStore } from "@/lib/state/task-store";
import { useEffect, useMemo } from "react";
import type { CalendarEvent, Conversation, Team, Task } from "@/lib/types";
import MeetingBanner from "@/components/MeetingBanner";
import { SenecaFloatingLauncher } from "@/components/seneca/SenecaFloatingLauncher";
import { NO_WORKSPACE_WELCOME_PATH, resolveActiveTeamId } from "@/lib/no-workspace-routing";

export const unstable_settings = {
  initialRouteName: "chat",
};

const ALL_TABS = [
  { name: "activity", label: "Activity", Icon: Activity, paidOnly: true },
  { name: "chat", label: "Chat", Icon: MessageCircle, paidOnly: false },
  { name: "execute", label: "Workspace", Icon: CheckSquare, paidOnly: true },
  { name: "team", label: "Team", Icon: Users, paidOnly: false },
  { name: "profile", label: "Profile", Icon: User, paidOnly: false },
] as const;

function FixedTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const plan = useSubscriptionStore((s) => s.plan);
  const isPro = useSubscriptionStore((s) => s.isPro);
  const isPaid = plan === "team";
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);
  const acknowledgedEventCounts = useTaskStore((s) => s.acknowledgedEventCounts);

  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!session?.user,
    refetchInterval: 5000,
  });

  const { data: topics = [] } = useQuery({
    queryKey: ["topics", activeTeamId],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/topics`),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const dmUnreadLastReadIds = useMemo(
    () => Object.fromEntries(conversations.map((conv) => [conv.id, lastReadIds[conv.id] ?? ""])),
    [conversations, lastReadIds]
  );
  const { data: dmUnreadCounts = {} } = useQuery({
    queryKey: ["dm-unread-counts", dmUnreadLastReadIds],
    queryFn: () => api.post<Record<string, number>>("/api/dms/unread-counts", { lastReadIds: dmUnreadLastReadIds }),
    enabled: !!session?.user && conversations.length > 0,
    refetchInterval: 5000,
  });
  const unreadCount = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);

  const teamChannelLastReadIds = useMemo(
    (): Record<string, string> => ({
      [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "",
      ...Object.fromEntries(topics.map((t: any) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])),
    }),
    [activeTeamId, topics, lastReadIds]
  );
  const { data: teamUnreadCountsMap = {} } = useQuery({
    queryKey: ["team-unread-counts", activeTeamId, teamChannelLastReadIds],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${activeTeamId}/messages/unread-counts`, { lastReadIds: teamChannelLastReadIds }),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 15000,
  });
  const teamUnreadCount = Object.values(teamUnreadCountsMap).reduce((a: number, b: number) => a + b, 0);

  const { data: taskCount = 0 } = useQuery({
    queryKey: ["tasks-count", activeTeamId],
    queryFn: () => api.get<number>(`/api/teams/${activeTeamId}/tasks/count`),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendar-events", activeTeamId],
    queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const eventCount = calendarEvents.length;

  const { data: teamsList = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });

  const manageableTeamIds = useMemo(
    () => teamsList.filter((t) => t.role === "owner" || t.role === "team_leader").map((t) => t.id),
    [teamsList],
  );

  type JoinReqRow = { status: string };

  const joinRequestQueries = useQueries({
    queries: manageableTeamIds.map((teamId) => ({
      queryKey: ["team-join-requests", teamId] as const,
      queryFn: () => api.get<JoinReqRow[]>(`/api/teams/${teamId}/join-requests`),
      enabled: !!session?.user && manageableTeamIds.length > 0,
      staleTime: 15_000,
      refetchInterval: 25_000,
    })),
  });

  const goLoginRequestQueries = useQueries({
    queries: manageableTeamIds.map((teamId) => ({
      queryKey: ["team-go-login-requests", teamId] as const,
      queryFn: () => api.get<JoinReqRow[]>(`/api/teams/${teamId}/go-login-requests`),
      enabled: !!session?.user && manageableTeamIds.length > 0,
      staleTime: 15_000,
      refetchInterval: 25_000,
    })),
  });

  const pendingJoinRequestCount = useMemo(() => {
    let n = 0;
    for (const q of joinRequestQueries) {
      const rows = q.data;
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (r.status === "pending") n += 1;
      }
    }
    for (const q of goLoginRequestQueries) {
      const rows = q.data;
      if (!Array.isArray(rows)) continue;
      for (const r of rows) {
        if (r.status === "pending") n += 1;
      }
    }
    return n;
  }, [joinRequestQueries, goLoginRequestQueries]);

  const visibleRoutes = state.routes.filter((r: any) => {
    if (r.name === "calendar") return false;
    const tab = ALL_TABS.find((t) => t.name === r.name);
    if (!tab) return false;
    if (tab.paidOnly && (!isPaid || !activeTeamId)) return false;
    if (!activeTeamId && (r.name === "activity" || r.name === "execute")) return false;
    return true;
  });

  const prefetchRouteData = (routeName: string) => {
    if (!session?.user) return;
    if (routeName === "chat") {
      void queryClient.prefetchQuery({
        queryKey: ["dms"],
        queryFn: () => api.get<Conversation[]>("/api/dms"),
      });
      return;
    }
    if (!activeTeamId) return;
    if (routeName === "execute" && isPaid) {
      void queryClient.prefetchQuery({
        queryKey: ["tasks", activeTeamId, "mine", "active"],
        queryFn: () =>
          api.get<{ tasks: Task[]; nextCursor: string | null }>(
            `/api/teams/${activeTeamId}/tasks?myTasks=true&activeOnly=true&limit=200`,
          ),
      });
      void queryClient.prefetchQuery({
        queryKey: ["calendar-events", activeTeamId],
        queryFn: () => api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
      });
      return;
    }
    if (routeName === "activity" && isPaid) {
      void queryClient.prefetchQuery({
        queryKey: ["activity", activeTeamId],
        queryFn: () => api.get<unknown[]>(`/api/teams/${activeTeamId}/activity?limit=100`),
      });
      return;
    }
    if (routeName === "team") {
      void queryClient.prefetchQuery({
        queryKey: ["team", activeTeamId],
        queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
      });
    }
  };

  const activeRouteName = state.routes[state.index]?.name;

  return (
    <View style={tabBarStyles.container} pointerEvents="box-none">
      <BlurView intensity={16} tint="light" style={StyleSheet.absoluteFill} />
      <View style={tabBarStyles.overlay} />
      <View style={tabBarStyles.divider} />
      <View style={tabBarStyles.row}>
        {visibleRoutes.map((route: any) => {
          const isFocused = activeRouteName === route.name;
          const tab = ALL_TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const { Icon, label, name } = tab;
          const isChat = name === "chat";
          const isTasks = name === "execute";
          const isTeamTab = name === "team";
          const acknowledgedCount = acknowledgedCounts[activeTeamId ?? ""] ?? 0;
          const acknowledgedEventCount = acknowledgedEventCounts[activeTeamId ?? ""] ?? 0;
          const newTaskCount = Math.max(0, taskCount - acknowledgedCount);
          const newEventCount = Math.max(0, eventCount - acknowledgedEventCount);
          const workspaceBadge = newTaskCount + newEventCount;
          const badge =
            isChat && unreadCount + teamUnreadCount > 0
              ? unreadCount + teamUnreadCount
              : isTasks && workspaceBadge > 0
                ? workspaceBadge
                : isTeamTab && pendingJoinRequestCount > 0
                  ? pendingJoinRequestCount
                  : null;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (isFocused || event.defaultPrevented) return;
                prefetchRouteData(route.name);
                navigation.navigate(route.name);
              }}
              style={tabBarStyles.tab}
              testID={`tab-${name}`}
            >
              <View style={tabBarStyles.iconWrap}>
                <Icon
                  size={TAB_BAR_ICON_SIZE}
                  color={isFocused ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR}
                  strokeWidth={isFocused ? 2.5 : 1.8}
                />
                {badge ? (
                  <View style={tabBarStyles.badge}>
                    <Text style={tabBarStyles.badgeText}>{badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  tabBarStyles.label,
                  { color: isFocused ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR, fontWeight: isFocused ? "600" : "500" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: TAB_BAR_DIVIDER_COLOR,
  },
  row: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: TAB_BAR_LABEL_SIZE,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "white",
    fontSize: 9,
    fontWeight: "700",
  },
});

export default function AppLayout() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const setPlan = useSubscriptionStore((s) => s.setPlan);
  const plan = useSubscriptionStore((s) => s.plan);
  const { data: session } = useSession();

  // Keep plan in sync with server
  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: teams, isFetched: teamsFetched } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (!session?.user || !teamsFetched) return;
    if (!teams || teams.length === 0) {
      if (activeTeamId) setActiveTeamId(null);
      router.replace(NO_WORKSPACE_WELCOME_PATH);
    }
  }, [activeTeamId, session?.user, setActiveTeamId, teams, teamsFetched]);

  useEffect(() => {
    if (!activeTeamId) {
      setPlan("free");
      return;
    }
    if (subscription) {
      const plan = subscription.plan === "pro" ? "team" : subscription.plan;
      setPlan(plan === "team" ? "team" : "free");
    }
  }, [subscription, activeTeamId, setPlan]);

  useEffect(() => {
    if (!teams || teams.length === 0) return;
    const nextTeamId = resolveActiveTeamId(teams, activeTeamId);
    if (nextTeamId && nextTeamId !== activeTeamId) {
      setActiveTeamId(nextTeamId);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  // Free plan only gets chat, team, profile (paid tabs filtered in FixedTabBar)
  const isPaid = plan === "team";

  if (!teamsFetched || !teams || teams.length === 0) {
    return (
      <View style={[styles.shell, { alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }]}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Tabs
        initialRouteName="chat"
        tabBar={(props) => <FixedTabBar {...props} />}
        screenOptions={{ headerShown: false, animation: "none", sceneStyle: { backgroundColor: "#F2F3F7" } }}
      >
        <Tabs.Screen name="activity" options={{}} />
        <Tabs.Screen name="chat" options={{}} />
        <Tabs.Screen name="execute" options={{ title: "Workspace" }} />
        <Tabs.Screen name="team" options={{ title: "Team" }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
      <MeetingBanner />
      <SenecaFloatingLauncher />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
