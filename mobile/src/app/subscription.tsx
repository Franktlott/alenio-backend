import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Crown, Check, Clock } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";
import { restorePurchases, isRevenueCatEnabled } from "@/lib/revenue-cat";

type Subscription = {
  plan: "free" | "team";
  status: string;
  currentPeriodEnd: string | null;
};

type TierPlan = "free" | "team";

const TIER_ORDER: TierPlan[] = ["free", "team"];

function planRank(plan: TierPlan): number {
  return TIER_ORDER.indexOf(plan);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type TierConfig = {
  id: TierPlan;
  name: string;
  price: string;
  priceSubtext: string;
  memberLimit: string;
  accentColor: string;
  badgeLabel: string | null;
  features: Array<{ label: string; comingSoon?: boolean }>;
};

const TIERS: TierConfig[] = [
  {
    id: "free",
    name: "Starter",
    price: "Free",
    priceSubtext: "forever",
    memberLimit: "Up to 10 members",
    accentColor: "#64748B",
    badgeLabel: null,
    features: [
      { label: "Channels & messaging" },
      { label: "Video call invites" },
      { label: "Team polls" },
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$19",
    priceSubtext: "/mo",
    memberLimit: "Up to 25 members",
    accentColor: "#4361EE",
    badgeLabel: "Most Popular",
    features: [
      { label: "Everything in Starter" },
      { label: "Activity feed & celebrations" },
      { label: "Tasks & action items" },
      { label: "Team Calendar" },
    ],
  },
];

export default function SubscriptionScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<Subscription>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });

  const currentPlan: TierPlan = subscription?.plan ?? "free";

  const upgradeMutation = useMutation({
    mutationFn: (plan: TierPlan) =>
      api.post(`/api/teams/${activeTeamId}/subscription/upgrade`, { plan }),
    onSuccess: (_data, plan) => {
      queryClient.invalidateQueries({ queryKey: ["subscription", activeTeamId] });
      toast({ title: `Upgraded to Team!`, preset: "done" });
    },
    onError: (e: any) => {
      toast({ title: e?.message ?? "Upgrade failed. Please try again.", preset: "error" });
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

  const currentTier = TIERS.find((t) => t.id === currentPlan) ?? TIERS[0];

  function planBadgeColors(plan: TierPlan) {
    if (plan === "team") return { bg: "#EFF6FF", border: "#BFDBFE", text: "#4361EE" };
    return { bg: "#F1F5F9", border: "#E2E8F0", text: "#64748B" };
  }

  const badgeColors = planBadgeColors(currentPlan);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top"]}
      testID="subscription-screen"
    >
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            testID="back-button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Crown size={20} color="#FCD34D" />
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              Subscription
            </Text>
          </View>
          <View style={{ width: 30 }}>
            <Image
              source={require("@/assets/alenio-icon.png")}
              style={{ width: 30, height: 30, borderRadius: 6 }}
            />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {/* Current plan banner */}
        <View style={{ alignItems: "center", marginTop: 24, marginBottom: 4 }}>
          {isLoading ? (
            <ActivityIndicator color="#4361EE" testID="subscription-loading" />
          ) : (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: badgeColors.bg,
                borderWidth: 1,
                borderColor: badgeColors.border,
                gap: 6,
              }}
              testID="plan-badge"
            >
              <Crown size={13} color={badgeColors.text} />
              <Text
                style={{
                  color: badgeColors.text,
                  fontWeight: "700",
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {currentTier.name} Plan
              </Text>
            </View>
          )}
        </View>

        {/* Subheading */}
        <Text
          style={{
            textAlign: "center",
            color: "#94A3B8",
            fontSize: 14,
            marginTop: 6,
            marginBottom: 20,
            paddingHorizontal: 32,
          }}
        >
          {subscription?.currentPeriodEnd && currentPlan !== "free"
            ? `Renews ${formatDate(subscription.currentPeriodEnd)}`
            : "Choose the plan that fits your team"}
        </Text>

        {/* Tier cards */}
        {TIERS.map((tier) => {
          const isCurrent = tier.id === currentPlan;
          const isUpgrade = planRank(tier.id) > planRank(currentPlan);
          const accent = tier.accentColor;

          return (
            <View
              key={tier.id}
              style={{
                marginHorizontal: 16,
                marginBottom: 14,
                borderRadius: 20,
                backgroundColor: "white",
                borderWidth: isCurrent ? 2 : 1,
                borderColor: isCurrent ? accent : "#E8EDF2",
                shadowColor: isCurrent ? accent : "#000",
                shadowOpacity: isCurrent ? 0.18 : 0.05,
                shadowRadius: isCurrent ? 16 : 6,
                shadowOffset: { width: 0, height: isCurrent ? 4 : 2 },
                elevation: isCurrent ? 6 : 2,
              }}
              testID={`tier-card-${tier.id}`}
            >
              {/* Card header row */}
              <View
                style={{
                  paddingHorizontal: 18,
                  paddingTop: 18,
                  paddingBottom: 14,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                }}
              >
                {/* Left: name + price */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "800",
                      color: "#0F172A",
                      marginBottom: 4,
                    }}
                  >
                    {tier.name}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                    <Text style={{ fontSize: 28, fontWeight: "800", color: accent }}>
                      {tier.price}
                    </Text>
                    {tier.priceSubtext ? (
                      <Text style={{ fontSize: 14, color: "#94A3B8", fontWeight: "500" }}>
                        {tier.priceSubtext}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>
                    {tier.memberLimit}
                  </Text>
                </View>

                {/* Right: badges */}
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  {isCurrent ? (
                    <View
                      style={{
                        backgroundColor: accent,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                      testID={`current-plan-badge-${tier.id}`}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                        }}
                      >
                        Current Plan
                      </Text>
                    </View>
                  ) : null}
                  {tier.badgeLabel && !isCurrent ? (
                    <View
                      style={{
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#BFDBFE",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          color: "#4361EE",
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                        }}
                      >
                        {tier.badgeLabel}
                      </Text>
                    </View>
                  ) : null}
                  {tier.badgeLabel && isCurrent ? (
                    <View
                      style={{
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#BFDBFE",
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                      }}
                    >
                      <Text
                        style={{
                          color: "#4361EE",
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                        }}
                      >
                        {tier.badgeLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Divider */}
              <View
                style={{ height: 1, backgroundColor: "#F1F5F9", marginHorizontal: 18 }}
              />

              {/* Features */}
              <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
                {tier.features.map((feat) => (
                  <View
                    key={feat.label}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 10,
                      gap: 10,
                    }}
                  >
                    {feat.comingSoon ? (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: "#F5F3FF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Clock size={12} color="#7C3AED" />
                      </View>
                    ) : (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: `${accent}18`,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={12} color={accent} />
                      </View>
                    )}
                    <Text
                      style={{
                        fontSize: 14,
                        color: feat.comingSoon ? "#94A3B8" : "#334155",
                        fontWeight: "500",
                        flex: 1,
                      }}
                    >
                      {feat.label}
                      {feat.comingSoon ? (
                        <Text style={{ color: "#CBD5E1", fontWeight: "400" }}>
                          {" "}(Coming soon)
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Upgrade button */}
              {isUpgrade && !isLoading ? (
                <View style={{ paddingHorizontal: 18, paddingBottom: 18, paddingTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => upgradeMutation.mutate(tier.id)}
                    disabled={upgradeMutation.isPending}
                    testID={`upgrade-button-${tier.id}`}
                    style={{
                      borderRadius: 14,
                      overflow: "hidden",
                      shadowColor: accent,
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 3 },
                      elevation: 4,
                    }}
                  >
                    <LinearGradient
                      colors={["#4361EE", "#5B78F5"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                      }}
                    >
                      {upgradeMutation.isPending && upgradeMutation.variables === tier.id ? (
                        <ActivityIndicator color="white" testID={`upgrade-loading-${tier.id}`} />
                      ) : (
                        <>
                          <Crown size={15} color="#FCD34D" />
                          <Text
                            style={{
                              color: "white",
                              fontSize: 15,
                              fontWeight: "700",
                            }}
                          >
                            Upgrade to {tier.name} — {tier.price}
                            {tier.priceSubtext}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Bottom spacing when no button */}
              {!isUpgrade ? <View style={{ height: 8 }} /> : null}
            </View>
          );
        })}

        {/* Cancel plan section */}
        {currentPlan !== "free" && !isLoading ? (
          <View style={{ marginHorizontal: 16, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setShowCancelConfirm(true)}
              testID="cancel-plan-button"
              style={{
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                backgroundColor: "white",
              }}
            >
              <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 15 }}>
                Cancel Plan
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "#CBD5E1",
                marginTop: 8,
              }}
            >
              You'll retain access until the end of your billing period.
            </Text>
          </View>
        ) : null}

        {/* Restore Purchases */}
        {isRevenueCatEnabled() ? (
          <TouchableOpacity
            onPress={async () => {
              setIsRestoring(true);
              try {
                const result = await restorePurchases();
                if (result.success && result.isTeam) {
                  queryClient.invalidateQueries({ queryKey: ["subscription", activeTeamId] });
                  toast({ title: "Purchases restored!", preset: "done" });
                } else if (result.success) {
                  toast({ title: "No active purchases found.", preset: "error" });
                } else {
                  toast({ title: "Restore failed. Please try again.", preset: "error" });
                }
              } finally {
                setIsRestoring(false);
              }
            }}
            disabled={isRestoring}
            testID="restore-purchases-button"
            style={{ paddingVertical: 16, alignItems: "center" }}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#CBD5E1" />
            ) : (
              <Text style={{ color: "#CBD5E1", fontSize: 13 }}>Restore Purchases</Text>
            )}
          </TouchableOpacity>
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
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
          onPress={() => setShowCancelConfirm(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 20,
                padding: 24,
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "700",
                  color: "#0F172A",
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Cancel {currentTier.name} Plan?
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: "#64748B",
                  textAlign: "center",
                  marginBottom: 24,
                  lineHeight: 20,
                }}
              >
                You'll lose access to premium features at the end of your billing period.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setShowCancelConfirm(false)}
                  testID="cancel-confirm-keep"
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 12,
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "600", color: "#475569" }}>
                    Keep Plan
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  testID="cancel-confirm-proceed"
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: 12,
                    backgroundColor: "#EF4444",
                    alignItems: "center",
                  }}
                >
                  {cancelMutation.isPending ? (
                    <ActivityIndicator color="white" size="small" testID="cancel-loading" />
                  ) : (
                    <Text style={{ fontWeight: "600", color: "white" }}>Cancel Plan</Text>
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
