import { Tabs } from "expo-router";
import { CheckSquare, House, Users, MessageCircle } from "lucide-react-native";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  TAB_BAR_ACTIVE_COLOR,
  TAB_BAR_HEIGHT,
  TAB_BAR_HORIZONTAL_INSET,
  TAB_BAR_ICON_SIZE,
  TAB_BAR_INACTIVE_COLOR,
  TAB_BAR_LABEL_SIZE,
  TAB_BAR_DIVIDER_COLOR,
  TAB_BAR_ACTIVE_HIGHLIGHT,
  SENECA_FAB_VISIBLE_SIZE,
} from "@/lib/tab-bar";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { colors, radii } from "@/theme";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore, buildDmLastReadMap } from "@/lib/state/unread-store";
import { useTaskStore } from "@/lib/state/task-store";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { BottomTabBarHeightCallbackContext } from "expo-router/js-tabs";
import type { CalendarEvent, ConnectionsResponse, Conversation, Team, Task } from "@/lib/types";
import MeetingBanner from "@/components/MeetingBanner";
import { ProfileSheet } from "@/components/profile/ProfileSheet";
import { SenecaAssistantSheet } from "@/components/seneca/SenecaAssistantSheet";
import { ConnectionsIcon } from "@/components/ConnectionsIcon";
import { GradientTabIcon } from "@/components/GradientTabIcon";
import { AppReleaseGate } from "@/components/AppReleaseGate";
import { resolveActiveTeamId } from "@/lib/no-workspace-routing";
import { realtimeClient, userRealtimeChannel } from "@/lib/realtime-client";
import { useTeamTaskRealtime } from "@/lib/use-team-task-realtime";
import { useWorkspaceAccess } from "@/lib/workspace-access";
import { useSenecaSheetStore } from "@/lib/state/seneca-sheet-store";

export const unstable_settings = {
  initialRouteName: "home",
};

const ALL_TABS = [
  { name: "home", label: "Home", Icon: House },
  { name: "chat", label: "Chat", Icon: MessageCircle },
  { name: "execute", label: "Workspace", Icon: CheckSquare },
  { name: "team", label: "My Network", Icon: Users },
] as const;

/**
 * Wide screens swap the bottom bar for a side rail. On iPhone Duo the system
 * already owns one vertical edge, so `railEdge` puts ours on the other one.
 */
function NavigationRail({
  descriptors,
  onTabPress,
  senecaOpen,
  onSenecaPress,
  edge,
  width,
  insets,
}: {
  descriptors: any[];
  onTabPress: (route: any, isFocused: boolean) => void;
  senecaOpen: boolean;
  onSenecaPress: () => void;
  edge: "left" | "right";
  width: number;
  insets: { top: number; bottom: number; left: number; right: number };
}) {
  const edgeInset = edge === "left" ? insets.left : insets.right;
  const items = descriptors.map((descriptor) => {
    const { route, tab, isFocused, isTeamTab, badge } = descriptor;
    const { Icon, label, name } = tab;
    return (
      <Pressable
        key={route.key}
        onPress={() => onTabPress(route, isFocused)}
        style={railStyles.item}
        testID={`tab-${name}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        <View
          style={[
            railStyles.itemInner,
            isFocused ? railStyles.itemInnerActive : null,
          ]}
        >
          <View style={tabBarStyles.iconWrap}>
            {isTeamTab ? (
              <ConnectionsIcon
                size={TAB_BAR_ICON_SIZE}
                color={TAB_BAR_INACTIVE_COLOR}
                active={isFocused}
              />
            ) : (
              <GradientTabIcon
                Icon={Icon}
                size={TAB_BAR_ICON_SIZE}
                active={isFocused}
                inactiveColor={TAB_BAR_INACTIVE_COLOR}
              />
            )}
            {badge ? (
              <View style={tabBarStyles.badge}>
                <Text style={tabBarStyles.badgeText}>
                  {badge > 99 ? "99+" : badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              tabBarStyles.label,
              {
                color: isFocused
                  ? TAB_BAR_ACTIVE_COLOR
                  : TAB_BAR_INACTIVE_COLOR,
                fontWeight: isFocused ? "700" : "500",
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    );
  });

  // Seneca keeps its middle slot, but as a flat rail item — the raised disc is
  // a bottom-bar affordance and reads as a stray FAB in a vertical list.
  const senecaItem = (
    <Pressable
      key="seneca"
      onPress={onSenecaPress}
      style={railStyles.item}
      testID="tab-seneca"
      accessibilityRole="button"
      accessibilityLabel="Open Seneca leadership assistant"
      accessibilityState={{ selected: senecaOpen }}
    >
      <View
        style={[
          railStyles.itemInner,
          senecaOpen ? railStyles.itemInnerActive : null,
        ]}
      >
        <Image
          source={require("@/assets/seneca-button-icon.png")}
          style={railStyles.senecaIcon}
          resizeMode="cover"
        />
        <Text
          style={[
            tabBarStyles.label,
            {
              color: senecaOpen ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR,
              fontWeight: "700",
            },
          ]}
          numberOfLines={1}
        >
          Seneca
        </Text>
      </View>
    </Pressable>
  );

  const middle = Math.ceil(items.length / 2);
  const railItems = [...items.slice(0, middle), senecaItem, ...items.slice(middle)];

  return (
    <View
      style={[
        railStyles.rail,
        edge === "left" ? { left: 0 } : { right: 0 },
        edge === "left"
          ? { borderRightWidth: StyleSheet.hairlineWidth }
          : { borderLeftWidth: StyleSheet.hairlineWidth },
        {
          width: width + edgeInset,
          paddingLeft: edge === "left" ? insets.left : 0,
          paddingRight: edge === "right" ? insets.right : 0,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        },
      ]}
      testID="navigation-rail"
    >
      {railItems}
    </View>
  );
}

/**
 * Closed Duo: the five destinations sit under the clock, icons only. The
 * workspace switcher stays in the page, so both bars are on screen together.
 */
function DuoIconRail({
  descriptors,
  onTabPress,
  senecaOpen,
  onSenecaPress,
  edge,
  width,
  bottomInset,
}: {
  descriptors: any[];
  onTabPress: (route: any, isFocused: boolean) => void;
  senecaOpen: boolean;
  onSenecaPress: () => void;
  edge: "left" | "right";
  width: number;
  bottomInset: number;
}) {
  const iconFor = (descriptor: any) => {
    const { route, tab, isFocused, isTeamTab, badge } = descriptor;
    const { Icon, label, name } = tab;
    return (
      <Pressable
        key={route.key}
        onPress={() => onTabPress(route, isFocused)}
        style={iconRailStyles.item}
        testID={`tab-${name}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        <View style={[iconRailStyles.disc, isFocused ? iconRailStyles.discActive : null]}>
          {isTeamTab ? (
            <ConnectionsIcon
              size={22}
              color={TAB_BAR_INACTIVE_COLOR}
              active={isFocused}
            />
          ) : (
            <GradientTabIcon
              Icon={Icon}
              size={22}
              active={isFocused}
              inactiveColor={TAB_BAR_INACTIVE_COLOR}
            />
          )}
          {badge ? (
            <View style={tabBarStyles.badge}>
              <Text style={tabBarStyles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const items = descriptors.map(iconFor);
  const middle = Math.ceil(items.length / 2);
  const senecaItem = (
    <Pressable
      key="seneca"
      onPress={onSenecaPress}
      style={iconRailStyles.item}
      testID="tab-seneca"
      accessibilityRole="button"
      accessibilityLabel="Open Seneca leadership assistant"
      accessibilityState={{ selected: senecaOpen }}
    >
      <View style={[iconRailStyles.disc, senecaOpen ? iconRailStyles.discActive : null]}>
        <Image
          source={require("@/assets/seneca-button-icon.png")}
          style={iconRailStyles.seneca}
          resizeMode="cover"
        />
      </View>
    </Pressable>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        iconRailStyles.rail,
        edge === "left" ? { left: 0 } : { right: 0 },
        { width, paddingBottom: bottomInset + 16 },
      ]}
      testID="duo-icon-rail"
    >
      <View style={iconRailStyles.dock} testID="duo-icon-dock">
        {[...items.slice(0, middle), senecaItem, ...items.slice(middle)]}
      </View>
    </View>
  );
}

function FixedTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { showRail, railEdge, railWidth, iconRailEdge, iconRailWidth } = useAdaptiveLayout();
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const queryClient = useQueryClient();
  const senecaOpen = useSenecaSheetStore((store) => store.open);
  const openSeneca = useSenecaSheetStore((store) => store.openSheet);
  const closeSeneca = useSenecaSheetStore((store) => store.closeSheet);

  // Fixed bar overlays content — screens pad with tabBarClearance().
  useEffect(() => {
    onTabBarHeightChange?.(0);
  }, [onTabBarHeightChange]);
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);
  const acknowledgedEventCounts = useTaskStore((s) => s.acknowledgedEventCounts);
  useTeamTaskRealtime(activeTeamId);

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
  const { data: personalConnections } = useQuery({
    queryKey: ["connections", session?.user?.id ?? "anonymous"],
    queryFn: () => api.get<ConnectionsResponse>("/api/connections"),
    enabled: !!session?.user,
    staleTime: 15_000,
    refetchInterval: 25_000,
  });
  const incomingConnectionRequestCount = personalConnections?.incoming.length ?? 0;

  // Keep unread badges in sync the moment a message arrives (even when not in that chat).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const channel = userRealtimeChannel(userId);
    realtimeClient.subscribe([channel]);
    const offInbox = realtimeClient.onInboxUpdated((event) => {
      void queryClient.invalidateQueries({ queryKey: ["dm-unread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
      if (event.kind === "team") {
        void queryClient.invalidateQueries({ queryKey: ["teams"] });
        void queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] });
        void queryClient.invalidateQueries({
          queryKey: ["upcoming-video-meetings"],
        });
        void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
        void queryClient.invalidateQueries({
          queryKey: ["planned-one-on-ones"],
        });
      }
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

  // Account-first navigation: main destinations stay in the tab bar. Profile
  // opens from the header photo. Each screen adapts to workspace membership.
  const visibleRoutes = state.routes.filter((r: any) => {
    const tab = ALL_TABS.find((t) => t.name === r.name);
    return !!tab;
  });

  const prefetchRouteData = (routeName: string) => {
    if (!session?.user) return;
    const ignoreCancel = (promise: Promise<unknown>) => {
      void promise.catch(() => {});
    };
    if (routeName === "chat") {
      ignoreCancel(
        queryClient.prefetchQuery({
          queryKey: ["dms"],
          queryFn: () => api.get<Conversation[]>("/api/dms"),
        }),
      );
      return;
    }
    if (!activeTeamId) return;
    if (routeName === "execute") {
      ignoreCancel(
        queryClient.prefetchQuery({
          queryKey: ["tasks", activeTeamId, "mine", "active"],
          queryFn: () =>
            api.get<{ tasks: Task[]; nextCursor: string | null }>(
              `/api/teams/${activeTeamId}/tasks?myTasks=true&activeOnly=true&limit=200`,
            ),
        }),
      );
      ignoreCancel(
        queryClient.prefetchQuery({
          queryKey: ["calendar-events", activeTeamId],
          queryFn: () =>
            api.get<CalendarEvent[]>(`/api/teams/${activeTeamId}/events`),
        }),
      );
      return;
    }
    if (routeName === "team") {
      ignoreCancel(
        queryClient.prefetchQuery({
          queryKey: ["team", activeTeamId],
          queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
        }),
      );
    }
  };

  const activeRouteName = state.routes[state.index]?.name;

  const onTabPress = (route: any, isFocused: boolean) => {
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (isFocused || event.defaultPrevented) return;
    prefetchRouteData(route.name);
    navigation.navigate(route.name);
  };

  const toggleSeneca = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (senecaOpen) closeSeneca();
    else openSeneca();
  };

  const tabDescriptors = visibleRoutes
    .map((route: any) => {
      const tab = ALL_TABS.find((t) => t.name === route.name);
      if (!tab) return null;
      const isFocused = activeRouteName === route.name;
      const { name } = tab;
      const isChat = name === "chat";
      const isTasks = name === "execute";
      const isTeamTab = name === "team";
      const acknowledgedCount = acknowledgedCounts[activeTeamId ?? ""] ?? 0;
      const acknowledgedEventCount =
        acknowledgedEventCounts[activeTeamId ?? ""] ?? 0;
      const newTaskCount = Math.max(0, taskCount - acknowledgedCount);
      const newEventCount = Math.max(0, eventCount - acknowledgedEventCount);
      const workspaceBadge = newTaskCount + newEventCount;
      const badge =
        isChat && unreadCount > 0
          ? unreadCount
          : isTasks && workspaceBadge > 0
            ? workspaceBadge
            : isTeamTab &&
                  pendingJoinRequestCount + incomingConnectionRequestCount > 0
              ? pendingJoinRequestCount + incomingConnectionRequestCount
              : null;
      return { route, tab, isFocused, isTeamTab, badge };
    })
    .filter(Boolean);

  if (iconRailEdge) {
    return (
      <>
        <DuoIconRail
          descriptors={tabDescriptors}
          onTabPress={onTabPress}
          senecaOpen={senecaOpen}
          onSenecaPress={toggleSeneca}
          edge={iconRailEdge}
          width={iconRailWidth}
          bottomInset={insets.bottom}
        />
        <SenecaAssistantSheet open={senecaOpen} onClose={closeSeneca} />
      </>
    );
  }

  if (showRail) {
    return (
      <>
        <NavigationRail
          descriptors={tabDescriptors}
          onTabPress={onTabPress}
          senecaOpen={senecaOpen}
          onSenecaPress={toggleSeneca}
          edge={railEdge}
          width={railWidth}
          insets={insets}
        />
        <SenecaAssistantSheet open={senecaOpen} onClose={closeSeneca} />
      </>
    );
  }

  const tabs = tabDescriptors.map((descriptor: any) => {
    const { route, tab, isFocused, isTeamTab, badge } = descriptor;
    const { Icon, label, name } = tab;

    return (
      <Pressable
        key={route.key}
        onPress={() => onTabPress(route, isFocused)}
        style={tabBarStyles.tab}
        testID={`tab-${name}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
      >
        <View style={tabBarStyles.iconWrap}>
          {isTeamTab ? (
            <ConnectionsIcon
              size={TAB_BAR_ICON_SIZE}
              color={TAB_BAR_INACTIVE_COLOR}
              active={isFocused}
            />
          ) : (
            <GradientTabIcon
              Icon={Icon}
              size={TAB_BAR_ICON_SIZE}
              active={isFocused}
              inactiveColor={TAB_BAR_INACTIVE_COLOR}
            />
          )}
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

  const leftTabs = tabs.slice(0, 2);
  const rightTabs = tabs.slice(2);
  const senecaLift = 16;

  return (
    <>
      <View
        style={[
          tabBarStyles.container,
          {
            height: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) + senecaLift,
          },
        ]}
        pointerEvents="box-none"
        testID="fixed-tab-bar"
      >
        <View
          style={[
            tabBarStyles.barSurface,
            { height: TAB_BAR_HEIGHT + Math.max(insets.bottom, 8) },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            tabBarStyles.row,
            { bottom: Math.max(insets.bottom, 8) },
          ]}
        >
          {leftTabs}
          <View style={tabBarStyles.tab} pointerEvents="none" />
          {rightTabs}
        </View>
        <Pressable
          onPress={toggleSeneca}
          style={[
            tabBarStyles.senecaSlot,
            { bottom: Math.max(insets.bottom, 8) },
          ]}
          testID="tab-seneca"
          accessibilityRole="button"
          accessibilityLabel="Open Seneca leadership assistant"
          accessibilityState={{ selected: senecaOpen }}
        >
          <View
            style={[
              tabBarStyles.senecaDisc,
              senecaOpen ? tabBarStyles.senecaDiscOpen : null,
            ]}
          >
            <Image
              source={require("@/assets/seneca-button-icon.png")}
              style={tabBarStyles.senecaIcon}
              resizeMode="cover"
            />
          </View>
          <Text
            style={[
              tabBarStyles.senecaLabel,
              { color: senecaOpen ? TAB_BAR_ACTIVE_COLOR : TAB_BAR_INACTIVE_COLOR },
            ]}
            numberOfLines={1}
          >
            Seneca
          </Text>
        </Pressable>
      </View>
      <SenecaAssistantSheet
        open={senecaOpen}
        onClose={closeSeneca}
      />
    </>
  );
}

const tabBarStyles = StyleSheet.create({
  container: {
    position: "absolute",
    left: TAB_BAR_HORIZONTAL_INSET,
    right: TAB_BAR_HORIZONTAL_INSET,
    bottom: 0,
    zIndex: 10100,
    elevation: 10100,
    backgroundColor: "transparent",
    overflow: "visible",
  },
  barSurface: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(20, 30, 60, 0.10)",
    backgroundColor: "#FFFFFF",
  },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  tab: {
    width: "20%",
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
  senecaSlot: {
    position: "absolute",
    left: "50%",
    marginLeft: -38,
    width: 76,
    height: TAB_BAR_HEIGHT + 16,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    zIndex: 10102,
    elevation: 14,
  },
  senecaDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(105, 71, 232, 0.12)",
    shadowColor: "#33218A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  senecaDiscOpen: {
    borderColor: "#4361EE",
  },
  senecaIcon: {
    width: SENECA_FAB_VISIBLE_SIZE + 2,
    height: SENECA_FAB_VISIBLE_SIZE + 2,
    borderRadius: (SENECA_FAB_VISIBLE_SIZE + 2) / 2,
  },
  senecaLabel: {
    fontSize: TAB_BAR_LABEL_SIZE,
    fontWeight: "700",
  },
});

const iconRailStyles = StyleSheet.create({
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 10100,
    elevation: 10100,
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "#FFFFFF",
  },
  dock: {
    width: 56,
    paddingVertical: 8,
    gap: 2,
    borderRadius: 28,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16, 24, 40, 0.1)",
    shadowColor: "#101828",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
  },
  item: {
    width: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  disc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  discActive: {
    backgroundColor: TAB_BAR_ACTIVE_HIGHLIGHT,
  },
  seneca: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});

const railStyles = StyleSheet.create({
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 10100,
    elevation: 10100,
    backgroundColor: colors.surface,
    borderColor: TAB_BAR_DIVIDER_COLOR,
    alignItems: "stretch",
    justifyContent: "center",
    gap: 6,
  },
  item: {
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 4,
  },
  itemInner: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 6,
  },
  itemInnerActive: {
    backgroundColor: TAB_BAR_ACTIVE_HIGHLIGHT,
  },
  senecaIcon: {
    width: TAB_BAR_ICON_SIZE + 6,
    height: TAB_BAR_ICON_SIZE + 6,
    borderRadius: (TAB_BAR_ICON_SIZE + 6) / 2,
  },
});

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { showRail, railEdge, railWidth, iconRailEdge, iconRailWidth } = useAdaptiveLayout();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const { data: session } = useSession();

  useWorkspaceAccess(activeTeamId);

  const { data: teams, isFetched: teamsFetched } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
    refetchInterval: (query) => {
      const currentTeams = query.state.data as Team[] | undefined;
      return !currentTeams || currentTeams.length === 0 ? 3000 : false;
    },
    refetchOnWindowFocus: "always",
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
        initialRouteName="home"
        tabBar={(props) => <FixedTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: "none",
          // Scenes stop where the rail starts; the rail itself is a sibling of
          // this container, so it keeps its full-height edge position.
          sceneStyle: {
            backgroundColor: "transparent",
            flex: 1,
            paddingLeft:
              iconRailEdge === "left"
                ? iconRailWidth
                : showRail && railEdge === "left"
                  ? railWidth + insets.left
                  : 0,
            paddingRight:
              iconRailEdge === "right"
                ? iconRailWidth
                : showRail && railEdge === "right"
                  ? railWidth + insets.right
                  : 0,
          },
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
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="chat" options={{}} />
        <Tabs.Screen name="execute" options={{ title: "Workspace" }} />
        <Tabs.Screen name="team" options={{ title: "Team" }} />
        <Tabs.Screen name="profile" options={{ href: null, title: "Settings" }} />
      </Tabs>
      <MeetingBanner />
      <ProfileSheet />
      <AppReleaseGate enabled={!!session?.user} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
