import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Mail, User, Trash2, Shield, Calendar, Users } from "lucide-react-native";
import { toast } from "burnt";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

type AdminUserDetail = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
  emailVerified: boolean;
  _count: { teamMembers: number; tasksCreated: number };
};

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
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function UserDetail() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ["admin", "users", userId],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users/${userId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load user");
      return json.data;
    },
    enabled: !!userId,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setHasChanges(name !== user.name || email !== user.email);
    }
  }, [name, email, user]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Update failed");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users", userId] });
      toast({ title: "User updated", preset: "done" });
      setHasChanges(false);
    },
    onError: (err: Error) => {
      toast({ title: err.message, preset: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/admin-mobile/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Delete failed");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      toast({ title: "User deleted", preset: "done" });
      router.back();
    },
    onError: (err: Error) => {
      toast({ title: err.message, preset: "error" });
    },
  });

  const handleDelete = () => {
    Alert.alert(
      "Delete User",
      `Permanently delete ${user?.name}? All their data will be removed and this cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ]
    );
  };

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
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center gap-1.5 mb-3 self-start"
              hitSlop={12}
              testID="back-button"
            >
              <ArrowLeft size={18} color="rgba(255,255,255,0.85)" />
              <Text className="text-white/85 text-sm font-medium">Dashboard</Text>
            </Pressable>
            <Text className="text-white text-2xl font-bold">User Details</Text>
            <Text className="text-white/70 text-sm mt-0.5">Edit or manage this user account</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : !user ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400">User not found</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Avatar + Info Card */}
          <View className="mx-4 mt-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
            <View className="flex-row items-center gap-4">
              <View className="w-16 h-16 rounded-full bg-indigo-100 items-center justify-center overflow-hidden">
                {user.image ? (
                  <Image
                    source={{ uri: user.image }}
                    style={{ width: 64, height: 64 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-indigo-600 text-xl font-bold">
                    {getInitials(user.name)}
                  </Text>
                )}
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="text-slate-900 dark:text-white text-lg font-bold">
                    {user.name}
                  </Text>
                  {user.isAdmin ? (
                    <View className="flex-row items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 rounded-full px-2 py-0.5">
                      <Shield size={10} color="#4361EE" />
                      <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
                        Admin
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-slate-400 text-sm mt-0.5">{user.email}</Text>
                <View className="flex-row items-center gap-1 mt-1">
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: user.emailVerified ? "#10B981" : "#F59E0B" }}
                  />
                  <Text className="text-slate-400 text-xs">
                    {user.emailVerified ? "Email verified" : "Email not verified"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats row */}
            <View className="flex-row mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 gap-4">
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1.5 mb-1">
                  <Users size={14} color="#94A3B8" />
                  <Text className="text-slate-900 dark:text-white text-lg font-bold">
                    {user._count.teamMembers}
                  </Text>
                </View>
                <Text className="text-slate-400 text-xs">Teams</Text>
              </View>
              <View className="w-px bg-slate-100 dark:bg-slate-700" />
              <View className="flex-1 items-center">
                <Text className="text-slate-900 dark:text-white text-lg font-bold mb-1">
                  {user._count.tasksCreated}
                </Text>
                <Text className="text-slate-400 text-xs">Tasks Created</Text>
              </View>
              <View className="w-px bg-slate-100 dark:bg-slate-700" />
              <View className="flex-1 items-center">
                <View className="flex-row items-center gap-1 mb-1">
                  <Calendar size={13} color="#94A3B8" />
                </View>
                <Text className="text-slate-400 text-xs">{formatDate(user.createdAt)}</Text>
              </View>
            </View>
          </View>

          {/* Edit Form */}
          <View className="mx-4 mt-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-5">
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-4">
              Edit Information
            </Text>

            <View className="mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <User size={13} color="#94A3B8" />
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Full Name
                </Text>
              </View>
              <TextInput
                className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-white"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                testID="name-input"
              />
            </View>

            <View className="mb-5">
              <View className="flex-row items-center gap-2 mb-2">
                <Mail size={13} color="#94A3B8" />
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email Address
                </Text>
              </View>
              <TextInput
                className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 text-base text-slate-900 dark:text-white"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                testID="email-input"
              />
            </View>

            <Pressable
              className={`rounded-xl py-3.5 items-center ${hasChanges && !updateMutation.isPending ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-600"}`}
              onPress={() => updateMutation.mutate()}
              disabled={!hasChanges || updateMutation.isPending}
              testID="save-button"
            >
              {updateMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  className={`font-semibold text-base ${hasChanges ? "text-white" : "text-slate-400 dark:text-slate-400"}`}
                >
                  Save Changes
                </Text>
              )}
            </Pressable>
          </View>

          {/* Danger Zone */}
          {!user.isAdmin ? (
            <View className="mx-4 mt-4 bg-white dark:bg-slate-800 rounded-2xl border border-red-100 dark:border-red-900/30 p-5">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mb-3">
                Danger Zone
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-sm mb-4">
                Permanently delete this user account and all associated data including messages, tasks, and team memberships.
              </Text>
              <Pressable
                className="flex-row items-center justify-center gap-2 border border-red-200 dark:border-red-800 rounded-xl py-3.5"
                onPress={handleDelete}
                disabled={deleteMutation.isPending}
                testID="delete-button"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color="#EF4444" />
                ) : (
                  <>
                    <Trash2 size={16} color="#EF4444" />
                    <Text className="text-red-500 font-semibold">Delete User</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
