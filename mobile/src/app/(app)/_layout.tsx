import { Tabs } from "expo-router";
import { CheckSquare, Users, User, MessageCircle, Activity } from "lucide-react-native";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Conversation } from "@/lib/types";

const TABS = [
  { name: "feed", label: "Feed", Icon: Activity },
  { name: "chat", label: "Chat", Icon: MessageCircle },
  { name: "index", label: "Tasks", Icon: CheckSquare },
  { name: "team", label: "Team", Icon: Users },
  { name: "profile", label: "Profile", Icon: User },
] as const;

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

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
  const { data: teamGeneralMessages = [] } = useQuery({
    queryKey: ["messages", activeTeamId, "general", "preview"],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/messages?topicId=general&limit=1`),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const currentUserId = session?.user?.id ?? "";
  const unreadCount = conversations.filter(
    (conv) =>
      conv.lastMessage &&
      conv.lastMessage.sender.id !== currentUserId &&
      lastReadIds[conv.id] !== conv.lastMessage.id
  ).length;

  const teamUnreadCount = [
    teamGeneralMessages[0] && teamGeneralMessages[0].sender.id !== currentUserId && lastReadIds[`team:${activeTeamId}`] !== teamGeneralMessages[0].id ? 1 : 0,
    ...topics.map((t: any) => t.lastMessage && t.lastMessage.sender.id !== currentUserId && lastReadIds[`topic:${t.id}`] !== t.lastMessage?.id ? 1 : 0),
  ].reduce((a: number, b: number) => a + b, 0);

  const visibleRoutes = state.routes.filter((r: any) => {
    const opts = descriptors[r.key]?.options;
    return opts?.href !== null && opts?.href !== undefined ? false : r.name !== "calendar";
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
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const { Icon, label, name } = tab;
        const isChat = name === "chat";
        const badge = isChat && (unreadCount + teamUnreadCount) > 0 ? (unreadCount + teamUnreadCount) : null;

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
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="feed" options={{}} />
      <Tabs.Screen name="chat" options={{}} />
      <Tabs.Screen name="index" options={{ title: "Tasks" }} />
      <Tabs.Screen name="team" options={{ title: "Team" }} />
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
