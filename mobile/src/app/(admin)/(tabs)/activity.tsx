import { View, Text, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell } from "lucide-react-native";
import { AdminHeader, AdminAlertRow, MetricsGroup, openAdminAlert } from "@/components/admin/AdminUI";
import { useAdminStats } from "@/lib/admin/admin-api";
import { tabBarClearance } from "@/lib/tab-bar";

export default function AdminActivityTab() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useAdminStats();
  const alerts = stats?.recentAlerts ?? [];

  const weekRows = [
    { label: "New users", value: stats?.usersThisWeek ?? 0 },
    { label: "New workspaces", value: stats?.teamsThisWeek ?? 0 },
    { label: "Check-ins this week", value: stats?.checkInsThisWeek ?? 0 },
    { label: "Alerts today", value: stats?.alertsToday ?? 0 },
  ];

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <AdminHeader title="Activity" subtitle="Alerts for users, workplaces, and billing" />

      <ScrollView
        className="flex-1 px-4 pt-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["admin", "stats"] })}
            tintColor="#4361EE"
          />
        }
      >
        <MetricsGroup title="This week" rows={weekRows} loading={isLoading} />

        <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3 px-0.5">
          Recent alerts
        </Text>
        <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          {isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#4361EE" />
            </View>
          ) : !alerts.length ? (
            <View className="py-10 items-center px-6">
              <Bell size={28} color="#CBD5E1" />
              <Text className="text-slate-400 text-sm text-center mt-3">
                Nothing yet. You’ll see new signups, workplaces, members, and subscription changes here.
              </Text>
            </View>
          ) : (
            alerts.map((alert, index) => (
              <AdminAlertRow
                key={alert.id}
                alert={alert}
                isLast={index === alerts.length - 1}
                onPress={() => openAdminAlert(alert)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
