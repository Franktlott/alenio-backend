import { Tabs } from "expo-router";
import { CheckSquare, Users, UserRound, MessageCircle, Activity, Sparkles } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
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
import { useTaskStore } from "@/lib/state/task-store";
import { useContext, useEffect, useMemo, useState } from "react";
import { BottomTabBarHeightCallbackContext } from "expo-router/js-tabs";
import type { CalendarEvent, Conversation, Team, Task } from "@/lib/types";
import MeetingBanner from "@/components/MeetingBanner";
import { ContextualActionLauncher } from "@/components/seneca/SenecaFloatingLauncher";
import { SenecaAssistantSheet } from "@/components/seneca/SenecaAssistantSheet";
import { AppReleaseGate } from "@/components/AppReleaseGate";
import { resolveActiveTeamId } from "@/lib/no-workspace-routing";
import { realtimeClient, userRealtimeChannel } from "@/lib/realtime-client";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { hasTeamPlan, isPersistedPaidPlan } from "@/lib/plan-access-copy";

export const unstable_settings = {
  initialRouteName: "chat",
};

const ALL_TABS = [
  { name: "activity", label: "Activity", Icon: Activity },
  { name: "chat", label: "Chat", Icon: MessageCircle },
  { name: "execute", label: "Workspace", Icon: CheckSquare },
  { name: "team", label: "People", Icon: Users },
  { name: "profile", label: "Profile", Icon: UserRound },
] as const;

function FixedTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const queryClient = useQueryClient();
  const [senecaOpen, setSenecaOpen] = useState(false);

  // Fixed bar overlays content — screens pad with tabBarClearance().
  useEffect(() => {
    onTabBarHeightChange?.(0);
  }, [onTabBarHeightChange]);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const persistedPlan = useSubscriptionStore((s) => s.plan);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
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

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () =>
      api.get<{ plan: string; status: string; hasTeamFeatures?: boolean }>(
        `/api/teams/${activeTeamId}/subscription`,
      ),
    enabled: !!activeTeamId && !!session?.user,
    staleTime: 1000 * 60 * 5,
  });

  const activeRole = teamsList.find((team) => team.id === activeTeamId)?.role;
  const hasSenecaPlan = subscription
    ? hasTeamPlan(subscription)
    : isPersistedPaidPlan(persistedPlan);
  const canOpenSeneca =
    !!session?.user &&
    !!activeTeamId &&
    (activeRole === "owner" || activeRole === "team_leader") &&
    hasSenecaPlan;

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

  // Account-first navigation: all five destinations remain visible for every
  // authenticated user. Each screen adapts to workspace membership and role.
  const visibleRoutes = state.routes.filter((r: any) => {
    const tab = ALL_TABS.find((t) => t.name === r.name);
    return !!tab;
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
    if (routeName === "execute") {
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
          adjustsFontSizeToFit
          minimumFontScale={0.78}
        >
          {label}
        </Text>
      </Pressable>
    );
  });

  return (
    <>
      <View
        style={[
          tabBarStyles.container,
          { bottom: Math.max(insets.bottom, 8) },
        ]}
        pointerEvents="box-none"
        testID="fixed-tab-bar"
      >
        <View style={tabBarStyles.depthShadow} pointerEvents="none" />
        <View style={tabBarStyles.row}>
          {tabs}
          <Pressable
            onPress={() => {
              if (!canOpenSeneca) return;
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSenecaOpen(true);
            }}
            style={({ pressed }) => [
              tabBarStyles.senecaTab,
              !canOpenSeneca ? tabBarStyles.senecaTabDisabled : null,
              pressed && canOpenSeneca ? tabBarStyles.senecaTabPressed : null,
            ]}
            testID="tab-seneca"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canOpenSeneca, expanded: senecaOpen }}
            accessibilityLabel="Open Seneca leadership assistant"
          >
            <LinearGradient
              colors={["#5368F5", "#8447EF"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={tabBarStyles.senecaPill}
            >
              <Sparkles size={12} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={tabBarStyles.senecaLabel} numberOfLines={1}>
                Seneca
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      {canOpenSeneca && activeTeamId ? (
        <SenecaAssistantSheet
          open={senecaOpen}
          onClose={() => setSenecaOpen(false)}
          teamId={activeTeamId}
        />
      ) : null}
    </>
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
  senecaTab: {
    width: 70,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  senecaTabDisabled: {
    opacity: 0.55,
  },
  senecaTabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  senecaPill: {
    width: 66,
    height: 34,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowColor: "#5B47D6",
    shadowOpacity: 0.24,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  senecaLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: "#FFFFFF",
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
  const { data: session } = useSession();

  useWorkspaceAccess(activeTeamId);

  const { data: teams, isFetched: teamsFetched } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });

  // Zero workspaces is a supported state, not an error: the account itself is the
  // home. Only clear a stale active workspace so tabs do not render another team's data.
  useEffect(() => {
    if (!session?.user || !teamsFetched) return;
    if ((!teams || teams.length === 0) && activeTeamId) setActiveTeamId(null);
  }, [activeTeamId, session?.user, setActiveTeamId, teams, teamsFetched]);

  useEffect(() => {
    if (!teams || teams.length === 0) return;
    const nextTeamId = resolveActiveTeamId(teams, activeTeamId);
    if (nextTeamId && nextTeamId !== activeTeamId) {
      setActiveTeamId(nextTeamId);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

  if (!teamsFetched) {
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
        }}
      >
        <Tabs.Screen name="activity" options={{}} />
        <Tabs.Screen name="chat" options={{}} />
        <Tabs.Screen name="execute" options={{ title: "Workspace" }} />
        <Tabs.Screen name="team" options={{ title: "Team" }} />
        <Tabs.Screen name="profile" options={{ title: "Settings" }} />
      </Tabs>
      <MeetingBanner />
      <ContextualActionLauncher />
      <AppReleaseGate enabled={!!session?.user} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
