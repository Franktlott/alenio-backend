import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell } from "lucide-react-native";
import { AdminHeader, AdminAlertRow, MetricsGroup, openAdminAlert } from "@/components/admin/AdminUI";
import { useAdminStats } from "@/lib/admin/admin-api";
import { tabBarClearance } from "@/lib/tab-bar";

export default function AdminDashboardTab() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useAdminStats();
  const alerts = stats?.recentAlerts ?? [];
  const previewAlerts = alerts.slice(0, 6);

  const platformRows = [
    { label: "Users", value: stats?.users ?? 0, testId: "stat-users" },
    { label: "Workspaces", value: stats?.teams ?? 0, testId: "stat-teams" },
    { label: "Paid workspaces", value: stats?.activeSubscriptions ?? 0, testId: "stat-paid" },
    { label: "Tasks", value: stats?.tasks ?? 0, testId: "stat-tasks" },
    { label: "Messages", value: stats?.messages ?? 0, testId: "stat-messages" },
  ];
  const weekRows = [
    { label: "New users", value: stats?.usersThisWeek ?? 0, testId: "stat-users-week" },
    { label: "New workspaces", value: stats?.teamsThisWeek ?? 0, testId: "stat-teams-week" },
    { label: "Check-ins", value: stats?.checkInsThisWeek ?? 0, testId: "stat-checkins-week" },
    { label: "Alerts today", value: stats?.alertsToday ?? 0, testId: "stat-alerts-today" },
  ];

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <AdminHeader title="Dashboard" subtitle="Overview of your platform activity" />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["admin"] })}
            tintColor="#4361EE"
          />
        }
      >
        <View className="px-4 pt-5">
          <MetricsGroup title="Platform overview" rows={platformRows} loading={isLoading} />
          <MetricsGroup title="This week" rows={weekRows} loading={isLoading} />
        </View>

        <View className="px-4 pt-2 pb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Admin alerts
            </Text>
            <Pressable onPress={() => router.push("/(admin)/(tabs)/activity")} testID="view-all-alerts">
              <Text className="text-indigo-600 text-sm font-semibold">See all</Text>
            </Pressable>
          </View>
          <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {isLoading ? (
              <View className="py-10 items-center">
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : !previewAlerts.length ? (
              <View className="py-10 items-center px-6">
                <Bell size={28} color="#CBD5E1" />
                <Text className="text-slate-400 text-sm text-center mt-3">
                  No recent alerts. New users, workplaces, and subscriptions will show up here.
                </Text>
              </View>
            ) : (
              previewAlerts.map((alert, index) => (
                <AdminAlertRow
                  key={alert.id}
                  alert={alert}
                  isLast={index === previewAlerts.length - 1}
                  onPress={() => openAdminAlert(alert)}
                />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
