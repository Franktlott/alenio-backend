import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";

export default function SelectTeamScreen() {
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });

  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-slate-900"
      testID="select-team-screen"
    >
      <View className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <Text className="text-lg font-bold text-slate-900 dark:text-white">
          Switch Team
        </Text>
      </View>
      {isLoading ? (
        <View
          className="flex-1 items-center justify-center"
          testID="loading-indicator"
        >
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="flex-row items-center px-4 py-4 border-b border-slate-100 dark:border-slate-800"
              onPress={() => {
                setActiveTeamId(item.id);
                router.back();
              }}
              testID={`team-item-${item.id}`}
            >
              <View className="w-10 h-10 rounded-xl bg-primary items-center justify-center mr-3">
                <Text className="text-white font-bold">
                  {item.name?.[0]?.toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900 dark:text-white">
                  {item.name}
                </Text>
                <Text className="text-xs text-slate-500">
                  {item._count?.members ?? 0} members ·{" "}
                  {item._count?.tasks ?? 0} tasks
                </Text>
              </View>
              {activeTeamId === item.id ? (
                <Check size={20} color="#0F766E" />
              ) : null}
            </TouchableOpacity>
          )}
          testID="teams-list"
        />
      )}
    </SafeAreaView>
  );
}
