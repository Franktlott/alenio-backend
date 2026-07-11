import { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LogOut, Shield } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminHeader } from "@/components/admin/AdminUI";
import { authClient, clearAccessToken } from "@/lib/auth/auth-client";
import { SESSION_QUERY_KEY, markSessionSignedOut, useInvalidateSession } from "@/lib/auth/use-session";
import { tabBarClearance } from "@/lib/tab-bar";

export default function AdminSettingsTab() {
  const insets = useSafeAreaInsets();
  const [signOutModal, setSignOutModal] = useState(false);
  const invalidateSession = useInvalidateSession();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    markSessionSignedOut();
    clearAccessToken();
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    try {
      await authClient.signOut();
    } catch {
      // continue logout cleanup
    }
    queryClient.clear();
    await invalidateSession();
    setSignOutModal(false);
    router.replace("/sign-in");
  };

  return (
    <View className="flex-1 bg-[#F8FAFC]">
      <AdminHeader title="Settings" subtitle="Admin account options" />

      <View className="px-4 pt-5" style={{ paddingBottom: tabBarClearance(insets.bottom) }}>
        <View className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          <View className="flex-row items-center px-4 py-4 border-b border-slate-100">
            <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center mr-3">
              <Shield size={18} color="#4361EE" />
            </View>
            <View className="flex-1">
              <Text className="text-slate-900 text-sm font-semibold">Platform admin</Text>
              <Text className="text-slate-400 text-xs mt-0.5">
                You have Alenio-wide access to users and workspaces.
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => router.replace("/(app)/profile")}
          className="bg-white rounded-2xl border border-slate-200 px-4 py-4 flex-row items-center mb-3"
          testID="back-to-alenio"
        >
          <View className="w-10 h-10 rounded-xl bg-indigo-50 items-center justify-center mr-3">
            <ArrowLeft size={18} color="#4361EE" />
          </View>
          <View className="flex-1">
            <Text className="text-slate-900 text-sm font-semibold">Back to Alenio</Text>
            <Text className="text-slate-400 text-xs mt-0.5">Return to your normal workspace app</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setSignOutModal(true)}
          className="bg-white rounded-2xl border border-slate-200 px-4 py-4 flex-row items-center"
          testID="settings-sign-out"
        >
          <View className="w-10 h-10 rounded-xl bg-red-50 items-center justify-center mr-3">
            <LogOut size={18} color="#EF4444" />
          </View>
          <Text className="text-red-500 text-sm font-semibold">Sign out</Text>
        </Pressable>
      </View>

      <Modal visible={signOutModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white rounded-2xl p-6 w-full">
            <Text className="text-slate-900 text-lg font-bold mb-2">Sign Out</Text>
            <Text className="text-slate-500 text-sm mb-5">
              Are you sure you want to sign out of the admin panel?
            </Text>
            <Pressable
              className="bg-indigo-600 rounded-xl py-3.5 items-center mb-3"
              onPress={handleSignOut}
              testID="confirm-sign-out"
            >
              <Text className="text-white font-semibold">Sign Out</Text>
            </Pressable>
            <Pressable className="items-center py-2" onPress={() => setSignOutModal(false)}>
              <Text className="text-slate-500 text-sm">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
