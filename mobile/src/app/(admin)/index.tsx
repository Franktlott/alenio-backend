import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Image,
  RefreshControl,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Search, Users, Building2, CheckSquare, MessageSquare, LogOut, ChevronRight, Shield, Trash2 } from "lucide-react-native";
import { authClient } from "@/lib/auth/auth-client";
import { useInvalidateSession } from "@/lib/auth/use-session";
import { fetch } from "expo/fetch";
import { toast } from "burnt";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

type AdminUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
  _count: { teamMembers: number };
};

type Stats = {
  users: number;
  teams: number;
  tasks: number;
  messages: number;
};

function useAdminStats() {
  return useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/stats`, {
        credentials: "include",
        headers: { Cookie: authClient.getCookie() },
      });
      const json = await res.json() as { data: Stats; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message || "Request failed");
      return json.data;
    },
  });
}

function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users`, {
        credentials: "include",
        headers: { Cookie: authClient.getCookie() },
      });
      const json = await res.json() as { data: AdminUser[]; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message || "Request failed");
      return json.data;
    },
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminDashboard() {
  const [search, setSearch] = useState("");
  const [signOutModal, setSignOutModal] = useState(false);
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useAdminStats();
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useAdminUsers();

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Cookie: authClient.getCookie() },
      });
      const json = await res.json() as { data?: { deleted: boolean }; error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message || "Delete failed");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast({ title: "User deleted", preset: "done" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, preset: "error" });
    },
  });

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
    await invalidateSession();
    setSignOutModal(false);
    router.replace("/");
  };

  const handleDeleteUser = (user: AdminUser) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${user.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(user.id),
        },
      ]
    );
  };

  const filteredUsers = users?.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const statCards = [
    { label: "Users", value: stats?.users ?? 0, icon: Users, color: "#4361EE" },
    { label: "Teams", value: stats?.teams ?? 0, icon: Building2, color: "#7C3AED" },
    { label: "Tasks", value: stats?.tasks ?? 0, icon: CheckSquare, color: "#0891B2" },
    { label: "Messages", value: stats?.messages ?? 0, icon: MessageSquare, color: "#059669" },
  ];

  return (
    <View className="flex-1 bg-white dark:bg-slate-900">
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <SafeAreaView edges={["top"]}>
          <View className="px-5 pt-2 pb-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Shield size={20} color="rgba(255,255,255,0.9)" />
                <Text className="text-white/90 text-sm font-semibold tracking-wide uppercase">
                  Admin
                </Text>
              </View>
              <Pressable
                onPress={() => setSignOutModal(true)}
                className="flex-row items-center gap-1.5 bg-white/20 rounded-xl px-3 py-1.5"
                testID="sign-out-button"
              >
                <LogOut size={14} color="white" />
                <Text className="text-white text-sm font-medium">Sign Out</Text>
              </Pressable>
            </View>
            <Text className="text-white text-2xl font-bold mt-3">Dashboard</Text>
            <Text className="text-white/70 text-sm mt-0.5">Manage users and monitor activity</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={statsLoading || usersLoading}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ["admin"] });
            }}
            tintColor="#4361EE"
          />
        }
      >
        {/* Stats */}
        <View className="px-4 pt-5 pb-2">
          <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">
            Overview
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {statCards.map((card) => (
              <View
                key={card.label}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-4"
                style={{ width: "47%" }}
                testID={`stat-card-${card.label.toLowerCase()}`}
              >
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center mb-2"
                  style={{ backgroundColor: card.color + "20" }}
                >
                  <card.icon size={18} color={card.color} />
                </View>
                {statsLoading ? (
                  <ActivityIndicator size="small" color={card.color} />
                ) : (
                  <Text className="text-2xl font-bold text-slate-900 dark:text-white">
                    {card.value.toLocaleString()}
                  </Text>
                )}
                <Text className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                  {card.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Users Section */}
        <View className="px-4 pt-4 pb-8">
          <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">
            Users ({filteredUsers.length})
          </Text>

          {/* Search */}
          <View className="flex-row items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 mb-3">
            <Search size={16} color="#94A3B8" />
            <TextInput
              className="flex-1 ml-2 text-slate-900 dark:text-white text-sm"
              placeholder="Search by name or email..."
              placeholderTextColor="#94A3B8"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              testID="user-search-input"
            />
          </View>

          {/* User List */}
          <View className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            {usersLoading ? (
              <View className="py-12 items-center">
                <ActivityIndicator color="#4361EE" />
                <Text className="text-slate-400 text-sm mt-2">Loading users...</Text>
              </View>
            ) : filteredUsers.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-slate-400 text-sm">No users found</Text>
              </View>
            ) : (
              filteredUsers.map((user, index) => (
                <View key={user.id}>
                  {index > 0 && (
                    <View className="h-px bg-slate-100 dark:bg-slate-700 mx-4" />
                  )}
                  <Pressable
                    className="flex-row items-center px-4 py-3 active:bg-slate-50 dark:active:bg-slate-700"
                    onPress={() =>
                      router.push({
                        pathname: "/(admin)/user-detail",
                        params: { userId: user.id },
                      })
                    }
                    testID={`user-row-${user.id}`}
                  >
                    {/* Avatar */}
                    <View className="w-10 h-10 rounded-full bg-indigo-100 items-center justify-center mr-3 overflow-hidden">
                      {user.image ? (
                        <Image
                          source={{ uri: user.image }}
                          style={{ width: 40, height: 40 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text className="text-indigo-600 text-sm font-bold">
                          {getInitials(user.name)}
                        </Text>
                      )}
                    </View>

                    {/* Info */}
                    <View className="flex-1 mr-2">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-slate-900 dark:text-white text-sm font-semibold" numberOfLines={1}>
                          {user.name}
                        </Text>
                        {user.isAdmin ? (
                          <View className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full px-1.5 py-0.5">
                            <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                              Admin
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="text-slate-400 text-xs mt-0.5" numberOfLines={1}>
                        {user.email}
                      </Text>
                      <Text className="text-slate-300 dark:text-slate-500 text-xs mt-0.5">
                        {user._count.teamMembers} team{user._count.teamMembers !== 1 ? "s" : ""} · Joined {formatDate(user.createdAt)}
                      </Text>
                    </View>

                    {/* Actions */}
                    <View className="flex-row items-center gap-2">
                      {!user.isAdmin && (
                        <Pressable
                          onPress={() => handleDeleteUser(user)}
                          className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 items-center justify-center"
                          hitSlop={8}
                          testID={`delete-user-${user.id}`}
                        >
                          <Trash2 size={14} color="#EF4444" />
                        </Pressable>
                      )}
                      <ChevronRight size={16} color="#CBD5E1" />
                    </View>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sign Out Modal */}
      <Modal visible={signOutModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full">
            <Text className="text-slate-900 dark:text-white text-lg font-bold mb-2">Sign Out</Text>
            <Text className="text-slate-500 dark:text-slate-400 text-sm mb-5">
              Are you sure you want to sign out of the admin panel?
            </Text>
            <Pressable
              className="bg-indigo-600 rounded-xl py-3.5 items-center mb-3"
              onPress={handleSignOut}
              testID="confirm-sign-out"
            >
              <Text className="text-white font-semibold">Sign Out</Text>
            </Pressable>
            <Pressable
              className="items-center py-2"
              onPress={() => setSignOutModal(false)}
              testID="cancel-sign-out"
            >
              <Text className="text-slate-500 dark:text-slate-400 text-sm">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
