import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Crown, Check, X, Zap, Shield, Users, MessageSquare, CheckSquare, Star } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";

type Subscription = {
  id: string;
  teamId: string;
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
};

type FeatureRow = {
  label: string;
  free: boolean;
  pro: boolean;
  icon: React.ReactNode;
};

const FEATURES: FeatureRow[] = [
  { label: "Team chat", free: true, pro: true, icon: <Users size={15} color="#64748B" /> },
  { label: "Direct messages", free: true, pro: true, icon: <MessageSquare size={15} color="#64748B" /> },
  { label: "Calendar", free: true, pro: true, icon: <Star size={15} color="#64748B" /> },
  { label: "Task manager", free: false, pro: true, icon: <CheckSquare size={15} color="#64748B" /> },
  { label: "Group chats", free: false, pro: true, icon: <Users size={15} color="#64748B" /> },
  { label: "Priority support", free: false, pro: true, icon: <Shield size={15} color="#64748B" /> },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function SubscriptionScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<Subscription>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });

  const upgradeMutation = useMutation({
    mutationFn: () => api.post(`/api/teams/${activeTeamId}/subscription/upgrade`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", activeTeamId] });
      toast({ title: "Upgraded to Pro!", preset: "done" });
    },
    onError: () => {
      toast({ title: "Upgrade failed. Please try again.", preset: "error" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/teams/${activeTeamId}/subscription/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription", activeTeamId] });
      setShowCancelConfirm(false);
      toast({ title: "Plan cancelled", preset: "done" });
    },
    onError: () => {
      toast({ title: "Cancellation failed. Please try again.", preset: "error" });
    },
  });

  const isPro = subscription?.plan === "pro";

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]} testID="subscription-screen">
      {/* Header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-5 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} testID="back-button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Crown size={20} color="#FCD34D" />
            <Text className="text-white text-lg font-bold">Alenio Pro</Text>
          </View>
          <View style={{ width: 22 }} />
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* Current plan badge */}
        <View className="items-center mt-6 mb-2">
          {isLoading ? (
            <ActivityIndicator color="#4361EE" testID="subscription-loading" />
          ) : (
            <View
              className="flex-row items-center px-5 py-2 rounded-full"
              style={{
                backgroundColor: isPro ? "#D1FAE5" : "#F1F5F9",
                borderWidth: 1,
                borderColor: isPro ? "#6EE7B7" : "#E2E8F0",
              }}
              testID="plan-badge"
            >
              {isPro ? <Crown size={14} color="#059669" style={{ marginRight: 6 }} /> : null}
              <Text
                className="font-bold text-sm tracking-widest uppercase"
                style={{ color: isPro ? "#059669" : "#64748B" }}
              >
                {isPro ? "Pro Plan" : "Free Plan"}
              </Text>
            </View>
          )}
        </View>

        {/* Pro active banner */}
        {isPro && subscription ? (
          <View
            className="mx-4 mt-4 rounded-2xl p-4 flex-row items-center"
            style={{
              backgroundColor: "#ECFDF5",
              borderWidth: 1,
              borderColor: "#6EE7B7",
              gap: 10,
            }}
            testID="pro-active-banner"
          >
            <View className="w-10 h-10 rounded-full bg-green-500 items-center justify-center">
              <Check size={20} color="white" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-green-800 text-base">Active Pro Plan</Text>
              <Text className="text-green-700 text-sm mt-0.5">
                Renews {formatDate(subscription.currentPeriodEnd)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Pricing card */}
        {!isPro ? (
          <View
            className="mx-4 mt-5 rounded-2xl overflow-hidden"
            style={{
              shadowColor: "#4361EE",
              shadowOpacity: 0.15,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
            }}
          >
            <LinearGradient
              colors={["#4361EE", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 20 }}
            >
              <View className="flex-row items-center mb-1" style={{ gap: 8 }}>
                <Zap size={18} color="#FCD34D" />
                <Text className="text-white font-bold text-base">Upgrade to Pro</Text>
              </View>
              <View className="flex-row items-baseline mt-3" style={{ gap: 4 }}>
                <Text style={{ color: "white", fontSize: 36, fontWeight: "800", lineHeight: 40 }}>$12</Text>
                <Text className="text-white/70 text-base">/ month</Text>
              </View>
              <Text className="text-white/60 text-sm mt-1">+ $2 / month per member over 10</Text>
            </LinearGradient>
          </View>
        ) : null}

        {/* Feature comparison table */}
        <View
          className="mx-4 mt-5 bg-white dark:bg-slate-800 rounded-2xl overflow-hidden"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {/* Table header */}
          <View
            className="flex-row px-4 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}
          >
            <View className="flex-1" />
            <View className="w-14 items-center">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wide">Free</Text>
            </View>
            <View className="w-14 items-center">
              <View className="flex-row items-center" style={{ gap: 3 }}>
                <Crown size={11} color="#4361EE" />
                <Text className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Pro</Text>
              </View>
            </View>
          </View>

          {FEATURES.map((feat, index) => (
            <View
              key={feat.label}
              className="flex-row items-center px-4 py-3.5"
              style={index < FEATURES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" } : undefined}
            >
              <View className="flex-row items-center flex-1" style={{ gap: 8 }}>
                {feat.icon}
                <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">{feat.label}</Text>
              </View>
              <View className="w-14 items-center">
                {feat.free ? (
                  <View className="w-6 h-6 rounded-full bg-slate-100 items-center justify-center">
                    <Check size={13} color="#64748B" />
                  </View>
                ) : (
                  <View className="w-6 h-6 rounded-full bg-slate-50 items-center justify-center">
                    <X size={13} color="#CBD5E1" />
                  </View>
                )}
              </View>
              <View className="w-14 items-center">
                {feat.pro ? (
                  <View className="w-6 h-6 rounded-full bg-indigo-100 items-center justify-center">
                    <Check size={13} color="#4361EE" />
                  </View>
                ) : (
                  <View className="w-6 h-6 rounded-full bg-slate-50 items-center justify-center">
                    <X size={13} color="#CBD5E1" />
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Upgrade button (free plan) */}
        {!isPro && !isLoading ? (
          <View className="mx-4 mt-6">
            <TouchableOpacity
              onPress={() => upgradeMutation.mutate()}
              disabled={upgradeMutation.isPending}
              testID="upgrade-button"
              style={{
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#4361EE",
                shadowOpacity: 0.4,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 6,
              }}
            >
              <LinearGradient
                colors={["#4361EE", "#7C3AED"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 }}
              >
                {upgradeMutation.isPending ? (
                  <ActivityIndicator color="white" testID="upgrade-loading" />
                ) : (
                  <>
                    <Crown size={18} color="#FCD34D" />
                    <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>Upgrade to Pro</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <Text className="text-center text-xs text-slate-400 mt-3">
              Cancel anytime. Charged monthly.
            </Text>
          </View>
        ) : null}

        {/* Cancel plan (pro plan) */}
        {isPro && !isLoading ? (
          <View className="mx-4 mt-6">
            <TouchableOpacity
              onPress={() => setShowCancelConfirm(true)}
              testID="cancel-plan-button"
              className="rounded-2xl py-4 items-center border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.04,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              }}
            >
              <Text className="text-slate-600 dark:text-slate-300 font-semibold text-base">Cancel Plan</Text>
            </TouchableOpacity>
            <Text className="text-center text-xs text-slate-400 mt-3">
              You'll retain Pro features until the end of your billing period.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Cancel confirmation modal */}
      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setShowCancelConfirm(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full">
              <Text className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Cancel Pro Plan?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
                You'll lose access to the task manager, group chats, and priority support at the end of your billing period.
              </Text>
              <View className="flex-row" style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setShowCancelConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 items-center"
                  testID="cancel-confirm-keep"
                >
                  <Text className="font-semibold text-slate-600 dark:text-slate-300">Keep Pro</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-red-500 items-center"
                  testID="cancel-confirm-proceed"
                >
                  {cancelMutation.isPending ? (
                    <ActivityIndicator color="white" size="small" testID="cancel-loading" />
                  ) : (
                    <Text className="font-semibold text-white">Cancel Plan</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
