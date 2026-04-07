import { Tabs } from "expo-router";
import { CheckSquare, Users, User, MessageCircle, Activity } from "lucide-react-native";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useTaskStore } from "@/lib/state/task-store";
import { useEffect, useMemo } from "react";
import type { Conversation, Team } from "@/lib/types";

const DEMO_EMAIL = "demo@alenio.app";

export const unstable_settings = {
  initialRouteName: "team",
};

const ALL_TABS = [
  { name: "feed", label: "Feed", Icon: Activity, proOnly: true },
  { name: "chat", label: "Chat", Icon: MessageCircle, proOnly: false },
  { name: "index", label: "Tasks", Icon: CheckSquare, proOnly: true },
  { name: "team", label: "Team", Icon: Users, proOnly: false },
  { name: "profile", label: "Profile", Icon: User, proOnly: false },
] as const;

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const isPro = useSubscriptionStore((s) => s.isPro);
  const acknowledgedCounts = useTaskStore((s) => s.acknowledgedCounts);

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
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
    refetchInterval: 30000,
  });

  const visibleRoutes = state.routes.filter((r: any) => {
    if (r.name === "calendar") return false;
    const tab = ALL_TABS.find((t) => t.name === r.name);
    if (!tab) return false;
    if (tab.proOnly && !isPro) return false;
    return true;
  });

  return (
    <View style={{
      position: "absolute",
      bottom: insets.bottom + 12,
      left: 20,
      right: 20,
      backgroundColor: "white",
      borderRadius: 40,
      height: 64,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 12,
    }}>
      {visibleRoutes.map((route: any) => {
        const isFocused = state.index === state.routes.indexOf(route);
        const tab = ALL_TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const { Icon, label, name } = tab;
        const isChat = name === "chat";
        const isTasks = name === "index";
        const acknowledgedCount = acknowledgedCounts[activeTeamId ?? ""] ?? 0;
        const newTaskCount = Math.max(0, taskCount - acknowledgedCount);
        const badge = isChat && (unreadCount + teamUnreadCount) > 0 ? (unreadCount + teamUnreadCount)
          : isTasks && newTaskCount > 0 ? newTaskCount
          : null;

        return (
          <Pressable
            key={route.key}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
            testID={`tab-${name}`}
          >
            <View style={{
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isFocused ? "#4361EE" : "transparent",
              borderRadius: 20,
              paddingHorizontal: isFocused ? 14 : 10,
              paddingVertical: 6,
            }}>
              <View>
                <Icon size={20} color={isFocused ? "white" : "#94A3B8"} strokeWidth={isFocused ? 2.5 : 1.8} />
                {badge ? (
                  <View style={{
                    position: "absolute",
                    top: -4,
                    right: -6,
                    backgroundColor: "#EF4444",
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                  }}>
                    <Text style={{ color: "white", fontSize: 9, fontWeight: "700" }}>{badge}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={{ color: isFocused ? "#4361EE" : "#94A3B8", fontSize: 10, fontWeight: isFocused ? "700" : "500" }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AppLayout() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const isPro = useSubscriptionStore((s) => s.isPro);
  const setIsPro = useSubscriptionStore((s) => s.setIsPro);
  const { data: session } = useSession();
  const isDemo = session?.user?.email === DEMO_EMAIL;

  // Keep persisted pro status in sync with the server
  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (subscription) setIsPro(subscription.plan === "pro");
  }, [subscription]);

  useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].id);
    }
  }, [teams, activeTeamId]);

  // isPro is read synchronously from AsyncStorage — no loading state, no flicker
  // Demo users get all tabs unlocked so they can explore every feature
  const hideProTabs = !isPro && !isDemo;

  return (
    <>
      <Tabs
        initialRouteName="team"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: '#fff' } }}
      >
        <Tabs.Screen name="feed" options={{ href: hideProTabs ? null : undefined }} />
        <Tabs.Screen name="chat" options={{}} />
        <Tabs.Screen name="index" options={{ title: "Tasks", href: hideProTabs ? null : undefined }} />
        <Tabs.Screen name="team" options={{ title: "Team" }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
    </>
  );
}
