import { Tabs, router } from "expo-router";
import { CheckSquare, Users, UserRound, MessageCircle, Activity } from "lucide-react-native";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TAB_BAR_ACTIVE_COLOR,
  TAB_BAR_HEIGHT,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INACTIVE_COLOR,
  TAB_BAR_LABEL_SIZE,
} from "@/lib/tab-bar";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore, buildDmLastReadMap } from "@/lib/state/unread-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { isPersistedPaidPlan, toPersistedPlan } from "@/lib/plan-access-copy";
import { useTaskStore } from "@/lib/state/task-store";
import { useContext, useEffect, useMemo } from "react";
import { BottomTabBarHeightCallbackContext } from "expo-router/js-tabs";
import type { CalendarEvent, Conversation, Team, Task } from "@/lib/types";
import MeetingBanner from "@/components/MeetingBanner";
import { SenecaFloatingLauncher } from "@/components/seneca/SenecaFloatingLauncher";
import { AppReleaseGate } from "@/components/AppReleaseGate";
import { NO_WORKSPACE_WELCOME_PATH, resolveActiveTeamId } from "@/lib/no-workspace-routing";
import { realtimeClient, userRealtimeChannel } from "@/lib/realtime-client";

export const unstable_settings = {
  initialRouteName: "chat",
};

const ALL_TABS = [
  { name: "activity", label: "Activity", Icon: Activity, paidOnly: false },
  { name: "chat", label: "Chat", Icon: MessageCircle, paidOnly: false },
  { name: "execute", label: "Workspace", Icon: CheckSquare, paidOnly: true },
  { name: "team", label: "Team", Icon: Users, paidOnly: false },
  { name: "profile", label: "Profile", Icon: UserRound, paidOnly: false },
] as const;

function FixedTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const queryClient = useQueryClient();

  // Fixed bar overlays content — screens pad with tabBarClearance().
  useEffect(() => {
    onTabBarHeightChange?.(0);
  }, [onTabBarHeightChange]);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = isPersistedPaidPlan(plan);
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);
  const acknowledgedEventCounts = useTaskStore((s) => s.acknowledgedEventCounts);

  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!session?.user,
    refetchInterval: 5000,
  });

  const dmUnreadLastReadIds = useMemo(
    () => buildDmLastReadMap(conversations, lastReadIds),
    [conversations, lastReadIds]
  );
  const { data: dmUnreadCounts = {} } = useQuery({
    queryKey: ["dm-unread-counts", dmUnreadLastReadIds],
    queryFn: () => api.post<Record<string, number>>("/api/dms/unread-counts", { lastReadIds: dmUnreadLastReadIds }),
    enabled: !!session?.user && conversations.length > 0,
    refetchInterval: 5000,
    staleTime: 0,
  });
  const unreadCount = Object.values(dmUnreadCounts).reduce((a, b) => a + b, 0);

  // Keep unread badges in sync the moment a message arrives (even when not in that chat).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const channel = userRealtimeChannel(userId);
    realtimeClient.subscribe([channel]);
    const offInbox = realtimeClient.onInboxUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: ["dm-unread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
    });
    return () => {
      offInbox();
      realtimeClient.unsubscribe([channel]);
    };
  }, [session?.user?.id, activeTeamId, queryClient]);

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
    if (routeName === "activity") {
      void queryClient.prefetchQuery({
        queryKey: ["activity", "all"],
        queryFn: () => api.get<unknown[]>(`/api/activity`),
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

  const tabs = visibleRoutes.map((route: any) => {
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
      isChat && unreadCount > 0
        ? unreadCount
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
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        <View style={tabBarStyles.iconWrap}>
          <Icon
            size={TAB_BAR_ICON_SIZE}
            color={isFocused ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR}
            strokeWidth={isFocused ? 2.5 : 1.8}
          />
          {badge ? (
            <View style={tabBarStyles.badge}>
              <Text style={tabBarStyles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            tabBarStyles.label,
            {
              color: isFocused ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR,
              fontWeight: isFocused ? "700" : "500",
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View
      style={[
        tabBarStyles.container,
        { bottom: Math.max(insets.bottom, 8) },
      ]}
      pointerEvents="box-none"
      testID="fixed-tab-bar"
    >
      <View style={tabBarStyles.depthShadow} pointerEvents="none" />
      <View style={tabBarStyles.row}>{tabs}</View>
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 10100,
    elevation: 10100,
    backgroundColor: "transparent",
  },
  depthShadow: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 2,
    bottom: 0,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.98)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "rgba(20, 30, 60, 0.06)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
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
    right: -10,
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
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
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
      setPlan(toPersistedPlan(subscription));
    }
  }, [subscription, activeTeamId, setPlan]);

  useEffect(() => {
    if (!teams || teams.length === 0) return;
    const nextTeamId = resolveActiveTeamId(teams, activeTeamId);
    if (nextTeamId && nextTeamId !== activeTeamId) {
      setActiveTeamId(nextTeamId);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  // Free: Activity + Chat + Team + Profile. Pro+: also Workspace.
  const isPaid = isPersistedPaidPlan(plan);

  if (!teamsFetched || !teams || teams.length === 0) {
    return (
      <View style={[styles.shell, { alignItems: "center", justifyContent: "center", backgroundColor: "transparent" }]}>
        <ActivityIndicator size="large" color="#4361EE" />
        <AppReleaseGate enabled={!!session?.user} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <Tabs
        initialRouteName="chat"
        tabBar={(props) => <FixedTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: "none",
          sceneStyle: { backgroundColor: "transparent", flex: 1 },
          // Full-bleed scenes under the fixed overlay tab bar
          tabBarStyle: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 0,
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
          },
          safeAreaInsets: { bottom: 0 },
        }}
      >
        <Tabs.Screen name="activity" options={{}} />
        <Tabs.Screen name="chat" options={{}} />
        <Tabs.Screen name="execute" options={{ title: "Workspace" }} />
        <Tabs.Screen name="team" options={{ title: "Team" }} />
        <Tabs.Screen name="profile" options={{ title: "Settings" }} />
      </Tabs>
      <MeetingBanner />
      <SenecaFloatingLauncher />
      <AppReleaseGate enabled={!!session?.user} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
