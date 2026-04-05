import { View, Text, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { CheckCircle, UserPlus, UserMinus, Calendar, Activity, UserCheck, Trophy } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image as ExpoImage } from "expo-image";

type ActivityEvent = {
  id: string;
  type: "task_completed" | "member_joined" | "member_removed" | "calendar_event_added" | "task_assigned" | "task_milestone";
  createdAt: string;
  metadata: { taskTitle?: string; userName?: string; eventTitle?: string; count?: number; incognito?: boolean } | null;
  user: { id: string; name: string; image: string | null } | null;
};

const EVENT_CONFIG = {
  task_completed: {
    label: "Task Done",
    color: "#10B981",
    bg: "#ECFDF5",
    Icon: CheckCircle,
    getMessage: (e: ActivityEvent) =>
      e.metadata?.taskTitle
        ? `${e.user?.name ?? "Someone"} completed "${e.metadata.taskTitle}"`
        : `${e.user?.name ?? "Someone"} completed an incognito task 🕵️`,
  },
  member_joined: {
    label: "Joined",
    color: "#4361EE",
    bg: "#EEF2FF",
    Icon: UserPlus,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? e.metadata?.userName ?? "Someone"} joined the team`,
  },
  member_removed: {
    label: "Left",
    color: "#F59E0B",
    bg: "#FFFBEB",
    Icon: UserMinus,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? e.metadata?.userName ?? "Someone"} left the team`,
  },
  calendar_event_added: {
    label: "Event Added",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    Icon: Calendar,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? "Someone"} added "${e.metadata?.eventTitle ?? "an event"}"`,
  },
  task_assigned: {
    label: "Assigned",
    color: "#4361EE",
    bg: "#EEF2FF",
    Icon: UserCheck,
    getMessage: (e: ActivityEvent) =>
      `${e.user?.name ?? "Someone"} was assigned "${e.metadata?.taskTitle ?? "a task"}"`,
  },
  task_milestone: {
    label: "Milestone",
    color: "#F59E0B",
    bg: "#FFFBEB",
    Icon: Trophy,
    getMessage: (e: ActivityEvent) =>
      e.metadata?.incognito
        ? `Someone 🕵️ completed ${e.metadata?.count ?? 10} tasks on time!`
        : `${e.user?.name ?? "Someone"} completed ${e.metadata?.count ?? 10} tasks on time!`,
  },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CelebrationCard({ item }: { item: ActivityEvent }) {
  const count = item.metadata?.count ?? 10;
  const isIncognito = item.metadata?.incognito === true;
  const name = isIncognito ? "Someone 🕵️" : (item.user?.name ?? "Someone");
  return (
    <View style={{ marginHorizontal: 16, marginVertical: 8 }} testID={`milestone-card-${item.id}`}>
      <LinearGradient
        colors={["#F59E0B", "#EF4444"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: 18, padding: 2 }}
      >
        <View style={{ backgroundColor: "#FFFBEB", borderRadius: 16, padding: 16, gap: 10 }}>
          {/* Top row: trophy + time */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                <Trophy size={18} color="#F59E0B" />
              </View>
              <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#D97706", letterSpacing: 0.3 }}>MILESTONE</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: "#94A3B8" }}>{timeAgo(item.createdAt)}</Text>
          </View>

          {/* Count badge */}
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ fontSize: 48, fontWeight: "800", color: "#F59E0B", lineHeight: 52 }}>{count}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400E", marginTop: 2 }}>tasks completed on time</Text>
          </View>

          {/* Avatar + name */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 10 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FDE68A", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {item.user?.image ? (
                <ExpoImage source={{ uri: item.user.image }} style={{ width: 32, height: 32 }} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#D97706" }}>{name[0].toUpperCase()}</Text>
              )}
            </View>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#92400E", flex: 1 }}>
              {name} is on a roll! 🎉
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function ActivityItem({ item }: { item: ActivityEvent }) {
  if (item.type === "task_milestone") {
    return <CelebrationCard item={item} />;
  }

  const config = EVENT_CONFIG[item.type] ?? {
    label: item.type,
    color: "#64748B",
    bg: "#F1F5F9",
    Icon: Activity,
    getMessage: () => "Activity occurred",
  };
  const { Icon } = config;

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 12,
    }}>
      {/* Avatar */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "#F1F5F9",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {item.user?.image ? (
          <ExpoImage
            source={{ uri: item.user.image }}
            style={{ width: 40, height: 40 }}
            contentFit="cover"
          />
        ) : (
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#94A3B8" }}>
            {(item.user?.name ?? "?")[0].toUpperCase()}
          </Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {/* Badge + time row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: config.bg,
            borderRadius: 12,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}>
            <Icon size={11} color={config.color} />
            <Text style={{ fontSize: 11, fontWeight: "700", color: config.color, letterSpacing: 0.3 }}>
              {config.label}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: "#94A3B8" }}>{timeAgo(item.createdAt)}</Text>
        </View>

        {/* Message */}
        <Text style={{ fontSize: 14, color: "#334155", lineHeight: 20 }}>
          {config.getMessage(item)}
        </Text>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);

  const { data: activities = [], isLoading, refetch } = useQuery({
    queryKey: ["activity", activeTeamId],
    queryFn: () => api.get<ActivityEvent[]>(`/api/teams/${activeTeamId}/activity`),
    enabled: !!activeTeamId,
    refetchInterval: 15000,
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="feed-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Feed</Text>
          <ExpoImage
            source={require("@/assets/alenio-icon.png")}
            style={{ width: 30, height: 30, borderRadius: 6 }}
            contentFit="cover"
          />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} testID="loading-indicator">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : activities.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 }} testID="empty-state">
          <Activity size={48} color="#CBD5E1" />
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#94A3B8", marginTop: 16, textAlign: "center" }}>
            No activity yet
          </Text>
          <Text style={{ fontSize: 14, color: "#CBD5E1", marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            Team events like completed tasks and new members will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ActivityItem item={item} />}
          ItemSeparatorComponent={({ leadingItem }: { leadingItem: ActivityEvent }) =>
            leadingItem.type === "task_milestone" ? null : (
              <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 72 }} />
            )
          }
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
          showsVerticalScrollIndicator={false}
          testID="activity-list"
        />
      )}
    </SafeAreaView>
  );
}
