import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Search, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "burnt";
import { fetch } from "expo/fetch";
import { AdminHeader, AdminUserRow } from "@/components/admin/AdminUI";
import {
  ADMIN_API_BASE_URL,
  formatAdminDate,
  useAdminUsers,
  type AdminUser,
} from "@/lib/admin/admin-api";
import { getAuthHeaders } from "@/lib/auth/auth-client";
import { readJsonSafe } from "@/lib/api/api";
import { tabBarClearance } from "@/lib/tab-bar";

export default function AdminUsersTab() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useAdminUsers();

  const searchQuery = search.trim().toLowerCase();
  const canSearch = searchQuery.length >= 3;
  const filteredUsers = canSearch
    ? (users?.filter(
        (u) =>
          u.name.toLowerCase().includes(searchQuery) || u.email.toLowerCase().includes(searchQuery),
      ) ?? [])
    : [];

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/admin-mobile/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders,
      });
      const json = await readJsonSafe<{ data?: { deleted: boolean }; error?: { message: string } }>(res);
      if (!res.ok) throw new Error(json?.error?.message || "Delete failed");
      return json?.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast({ title: "User deleted", preset: "done" });
    },
    onError: (err: Error) => toast({ title: err.message, preset: "error" }),
  });

  const handleDeleteUser = (user: AdminUser) => {
    Alert.alert("Delete User", `Are you sure you want to delete ${user.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(user.id) },
    ]);
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <AdminHeader title="Users" subtitle="Search accounts · open a user to grant admin" />

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
            testID="user-search-input"
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
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["admin", "users"] })}
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
                Type at least 3 characters to search users
              </Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <View className="py-12 items-center">
              <Text className="text-slate-400 text-sm">No users found</Text>
            </View>
          ) : (
            filteredUsers.map((user, index) => (
              <View key={user.id}>
                {index > 0 ? <View className="h-px bg-slate-100 mx-4" /> : null}
                <AdminUserRow
                  user={{
                    ...user,
                    subtitle: `${user._count.teamMembers} team${user._count.teamMembers !== 1 ? "s" : ""} · Joined ${formatAdminDate(user.createdAt)}`,
                  }}
                  onPress={() =>
                    router.push({ pathname: "/(admin)/user-detail", params: { userId: user.id } })
                  }
                  trailing={
                    !user.isAdmin ? (
                      <Pressable
                        onPress={() => handleDeleteUser(user)}
                        className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center"
                        hitSlop={8}
                        testID={`delete-user-${user.id}`}
                      >
                        <Trash2 size={14} color="#EF4444" />
                      </Pressable>
                    ) : undefined
                  }
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
