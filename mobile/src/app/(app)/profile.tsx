import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut, ChevronRight, Users } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession, useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";

export default function ProfileScreen() {
  const { data: session } = useSession();
  const invalidateSession = useInvalidateSession();
  const user = session?.user;

  const handleSignOut = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await authClient.signOut();
          await invalidateSession();
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      className="flex-1 bg-slate-50 dark:bg-slate-900"
      testID="profile-screen"
    >
      <View className="px-4 pt-2 pb-4">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          Profile
        </Text>
      </View>

      {/* User card */}
      <View className="mx-4 mb-6 bg-white dark:bg-slate-800 rounded-2xl p-4">
        <View className="flex-row items-center">
          <View className="w-14 h-14 rounded-full bg-indigo-600 items-center justify-center mr-4">
            <Text className="text-white text-xl font-bold">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <View>
            <Text className="text-lg font-bold text-slate-900 dark:text-white">
              {user?.name}
            </Text>
            <Text className="text-slate-500 text-sm">{user?.email}</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View className="mx-4 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden mb-4">
        <TouchableOpacity
          className="flex-row items-center px-4 py-4 border-b border-slate-100 dark:border-slate-700"
          onPress={() => router.push("/onboarding")}
          testID="create-join-team-button"
        >
          <Users size={20} color="#4361EE" />
          <Text className="flex-1 ml-3 text-slate-900 dark:text-white font-medium">
            Create or join team
          </Text>
          <ChevronRight size={18} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <View className="mx-4 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <TouchableOpacity
          className="flex-row items-center px-4 py-4"
          onPress={handleSignOut}
          testID="sign-out-button"
        >
          <LogOut size={20} color="#EF4444" />
          <Text className="flex-1 ml-3 text-red-500 font-medium">Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
