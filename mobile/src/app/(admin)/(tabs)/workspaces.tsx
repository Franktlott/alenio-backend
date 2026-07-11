import { useState } from "react";
import { View, Text, ScrollView, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminHeader, PlanBadge } from "@/components/admin/AdminUI";
import { useAdminTeams } from "@/lib/admin/admin-api";
import { tabBarClearance } from "@/lib/tab-bar";

export default function AdminWorkspacesTab() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: teams, isLoading } = useAdminTeams();

  const query = search.trim().toLowerCase();
  const canSearch = query.length >= 3;
  const filteredTeams = canSearch
    ? (teams?.filter((t) => t.name.toLowerCase().includes(query)) ?? [])
    : [];

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <AdminHeader title="Workspaces" subtitle="Find and review workplaces" />

      <View className="px-4 pt-4">
        <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-2.5 mb-3">
          <Search size={16} color="#94A3B8" />
          <TextInput
            className="flex-1 ml-2 text-slate-900 text-sm"
            placeholder="Type at least 3 characters..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            testID="workspace-search-input"
          />
        </View>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom) }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["admin", "teams"] })}
            tintColor="#4361EE"
          />
        }
      >
        <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#4361EE" />
            </View>
          ) : !canSearch ? (
            <View className="py-12 items-center px-6">
              <Text className="text-slate-400 text-sm text-center">
                Type at least 3 characters to search workspaces
              </Text>
            </View>
          ) : filteredTeams.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-slate-400 text-sm">No workspaces found</Text>
            </View>
          ) : (
            filteredTeams.map((team, index) => (
              <View key={team.id}>
                {index > 0 ? <View className="h-px bg-slate-100 mx-4" /> : null}
                <View className="flex-row items-center px-4 py-3" testID={`team-row-${team.id}`}>
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                    style={{ backgroundColor: "#7C3AED20" }}
                  >
                    <Building2 size={18} color="#7C3AED" />
                  </View>
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-slate-900 text-sm font-semibold flex-1" numberOfLines={1}>
                        {team.name}
                      </Text>
                      <PlanBadge plan={team.subscription.plan} />
                    </View>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      {team.memberCount} member{team.memberCount !== 1 ? "s" : ""} · {team.taskCount} task
                      {team.taskCount !== 1 ? "s" : ""}
                    </Text>
                    {team.owner?.email ? (
                      <Text className="text-slate-300 text-xs mt-0.5" numberOfLines={1}>
                        Owner: {team.owner.email}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
