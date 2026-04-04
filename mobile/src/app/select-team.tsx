import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check, ArrowLeft } from "lucide-react-native";
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
      edges={["top"]}
      testID="select-team-screen"
    >
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text className="text-white text-xl font-bold">Switch Team</Text>
        </View>
      </LinearGradient>
      {isLoading ? (
        <View
          className="flex-1 items-center justify-center"
          testID="loading-indicator"
        >
          <ActivityIndicator color="#4361EE" />
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
              <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: "#4361EE" }}>
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
                <Check size={20} color="#4361EE" />
              ) : null}
            </TouchableOpacity>
          )}
          testID="teams-list"
        />
      )}
    </SafeAreaView>
  );
}
