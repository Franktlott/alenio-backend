import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Crown, Check, Lock, Star, Users } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { toast } from "burnt";
import { purchaseTeam, restorePurchases, isRevenueCatEnabled } from "@/lib/revenue-cat";
import {
  getTeamBillingContext,
  isStripePortalEmbedUrl,
  openStoreSubscriptionManagement,
  shouldUseEmbeddedBillingWebView,
} from "@/lib/subscription-billing";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";

type TeamListRow = { id: string; role: string };

type Subscription = {
  plan: "free" | "team" | "pro";
  status: string;
  currentPeriodEnd: string | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  billingProvider?: "stripe" | "mobile_store" | "none";
};

function isStripeBilledFromApi(sub: Subscription | null | undefined): boolean {
  if (!sub) return false;
  if (sub.billingProvider === "stripe") return true;
  return !!sub.stripeSubscriptionId?.trim();
}

type TierPlan = "free" | "team";

function subscriptionTierPlan(sub: Subscription | undefined): TierPlan {
  const p = sub?.plan ?? "free";
  if (p === "team" || p === "pro") return "team";
  return "free";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const FREE_ACCENT = "#64748B";
const TEAM_ACCENT = "#6366F1";

const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;
const FREE_LOCKED = ["Tasks & action items", "Metrics & dashboards", "Team calendar", "Performance insights"] as const;
const TEAM_FEATURES = [
  "Tasks & action items",
  "Team calendar",
  "Metrics & dashboards",
  "Workflow execution",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

const ENTERPRISE_MAIL = "mailto:support@alenio.app?subject=Enterprise%20pricing";

export default function SubscriptionScreen() {
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [billingPortalUrl, setBillingPortalUrl] = useState<string | null>(null);
  const [billingActionLoading, setBillingActionLoading] = useState(false);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<TeamListRow[]>("/api/teams"),
    enabled: !!activeTeamId,
  });

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<Subscription>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });

  const isOwner = teams.find((t) => t.id === activeTeamId)?.role === "owner";
  const stripeBilled = isStripeBilledFromApi(subscription);

  const handleManageSubscriptionBilling = useCallback(async () => {
    setBillingActionLoading(true);
    try {
      if (stripeBilled) {
        if (!activeTeamId) {
          toast({ title: "No team selected", preset: "error" });
          return;
        }
        if (!isOwner) {
          toast({ title: "Only the team owner can manage billing", preset: "error" });
          return;
        }
        const { url } = await api.post<{ url: string }>("/web/api/billing/portal-session", { teamId: activeTeamId });
        if (!url) {
          toast({ title: "Billing link not ready. Try again shortly.", preset: "error" });
          return;
        }
        if (isStripePortalEmbedUrl(url)) {
          setBillingPortalUrl(url);
          return;
        }
        const can = await Linking.canOpenURL(url);
        if (can) await Linking.openURL(url);
        else toast({ title: "Cannot open billing on this device", preset: "error" });
        return;
      }

      const ctx = await getTeamBillingContext();
      if (!ctx?.hasTeamEntitlement) {
        toast({ title: "No active subscription to manage", preset: "error" });
        return;
      }
      const url = ctx.managementURL;
      if (!url) {
        toast({ title: "Billing link not ready. Try again shortly.", preset: "error" });
        return;
      }
      if (shouldUseEmbeddedBillingWebView(ctx.billingSource, url)) {
        setBillingPortalUrl(url);
        return;
      }
      if (ctx.billingSource === "app_store" || ctx.billingSource === "play_store") {
        const r = await openStoreSubscriptionManagement(url);
        if (!r.ok) toast({ title: r.error ?? "Could not open subscription settings", preset: "error" });
        return;
      }
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else toast({ title: "Cannot open billing on this device", preset: "error" });
    } catch {
      toast({ title: "Could not load billing info", preset: "error" });
    } finally {
      setBillingActionLoading(false);
    }
  }, [activeTeamId, isOwner, stripeBilled]);

  const currentPlan: TierPlan = subscriptionTierPlan(subscription);

  type UpgradeResult = { via: "iap" } | { via: "stripe_checkout" };

  const upgradeMutation = useMutation({
    mutationFn: async (plan: TierPlan): Promise<UpgradeResult | void> => {
      if (plan !== "team") throw new Error("cancelled");
      if (!activeTeamId) throw new Error("No team selected.");

      const subLatest =
        queryClient.getQueryData<Subscription>(["subscription", activeTeamId]) ?? subscription;
      const teamsList = queryClient.getQueryData<TeamListRow[]>(["teams"]) ?? teams;
      const owner = teamsList.find((t) => t.id === activeTeamId)?.role === "owner";

      const mobileManaged =
        !!subLatest &&
        (subLatest.plan === "team" || subLatest.plan === "pro") &&
        subLatest.status === "active" &&
        !subLatest.stripeSubscriptionId?.trim();

      if (mobileManaged) {
        if (!isRevenueCatEnabled()) {
          throw new Error("This team’s plan is managed in the app store. Purchases are not available in this build.");
        }
        const result = await purchaseTeam();
        if (!result.success) {
          if (result.error === "cancelled") throw new Error("cancelled");
          throw new Error(result.error ?? "Purchase failed");
        }
        await api.post(`/api/teams/${activeTeamId}/subscription/upgrade`, { plan });
        return { via: "iap" };
      }

      if (!owner) throw new Error("Only the team owner can subscribe.");

      try {
        const { url } = await api.post<{ url: string }>("/web/api/billing/checkout-session", {
          teamId: activeTeamId,
        });
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error("Cannot open Stripe checkout on this device.");
        await Linking.openURL(url);
        return { via: "stripe_checkout" };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("MOBILE_MANAGED") || msg.includes("mobile app")) {
          if (!isRevenueCatEnabled()) throw e instanceof Error ? e : new Error(msg);
          const result = await purchaseTeam();
          if (!result.success) {
            if (result.error === "cancelled") throw new Error("cancelled");
            throw new Error(result.error ?? "Purchase failed");
          }
          await api.post(`/api/teams/${activeTeamId}/subscription/upgrade`, { plan });
          return { via: "iap" };
        }
        if (msg.includes("not configured") || msg.includes("NOT_CONFIGURED")) {
          if (!isRevenueCatEnabled()) throw e instanceof Error ? e : new Error(msg);
          const result = await purchaseTeam();
          if (!result.success) {
            if (result.error === "cancelled") throw new Error("cancelled");
            throw new Error(result.error ?? "Purchase failed");
          }
          await api.post(`/api/teams/${activeTeamId}/subscription/upgrade`, { plan });
          return { via: "iap" };
        }
        throw e instanceof Error ? e : new Error(msg || "Upgrade failed");
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["subscription", activeTeamId] });
      if (result?.via === "stripe_checkout") {
        toast({
          title: "Complete checkout in the browser, then return here.",
          preset: "done",
        });
        return;
      }
      toast({ title: "Upgraded to Team!", preset: "done" });
    },
    onError: (e: Error) => {
      if (e?.message === "cancelled") return;
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

  const currentPlanDisplayName = currentPlan === "team" ? "Team" : "Free";

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
        {/* Hero */}
        <View style={{ alignItems: "center", paddingHorizontal: 20, marginTop: 22 }}>
          {isLoading ? (
            <ActivityIndicator color="#4361EE" testID="subscription-loading" style={{ marginBottom: 14 }} />
          ) : (
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                marginBottom: 14,
              }}
              testID="plan-badge"
            >
              <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: "#64748B" }}>
                CURRENT PLAN
              </Text>
            </View>
          )}
          <Text
            style={{
              textAlign: "center",
              fontSize: 22,
              fontWeight: "800",
              color: "#0F172A",
              lineHeight: 28,
              marginBottom: 8,
            }}
          >
            Choose the plan that fits your team
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: 14,
              color: "#64748B",
              lineHeight: 20,
              marginBottom: 4,
            }}
          >
            Simple pricing. No hidden fees. Cancel anytime.
          </Text>
          {!isLoading && subscription?.currentPeriodEnd && currentPlan !== "free" ? (
            <Text style={{ textAlign: "center", fontSize: 13, color: "#94A3B8", marginBottom: 2 }}>
              Renews {formatDate(subscription.currentPeriodEnd)}
            </Text>
          ) : null}
          {!isLoading && stripeBilled ? (
            <Text style={{ textAlign: "center", fontSize: 13, color: "#94A3B8", marginBottom: 2 }}>
              Billed through Stripe — use Manage payment below.
            </Text>
          ) : null}
        </View>

        {/* Free | Team columns */}
        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 12, marginTop: 18 }}>
          {/* Free column */}
          <View
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 18,
              backgroundColor: "white",
              borderWidth: currentPlan === "free" ? 2 : 1,
              borderColor: currentPlan === "free" ? FREE_ACCENT : "#E8EDF2",
              paddingHorizontal: 10,
              paddingTop: 12,
              paddingBottom: 14,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
            testID="tier-card-free"
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>Free</Text>
                <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, lineHeight: 15 }}>
                  Perfect for teams getting started
                </Text>
              </View>
              {currentPlan === "free" ? (
                <View
                  style={{
                    backgroundColor: FREE_ACCENT,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                  }}
                  testID="current-plan-badge-free"
                >
                  <Text style={{ color: "white", fontSize: 9, fontWeight: "800" }}>CURRENT</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 12 }}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: FREE_ACCENT }}>$0</Text>
              <Text style={{ fontSize: 12, color: "#94A3B8", fontWeight: "600" }}>forever</Text>
            </View>
            <Text style={{ fontSize: 10, color: "#CBD5E1", marginTop: 10, fontWeight: "700", letterSpacing: 0.6 }}>
              INCLUDED
            </Text>
            {FREE_INCLUDED.map((label) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "#E0F2FE",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={11} color="#0284C7" strokeWidth={3} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: "#334155", fontWeight: "500" }}>{label}</Text>
              </View>
            ))}
            <Text
              style={{
                fontSize: 10,
                color: "#94A3B8",
                marginTop: 14,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              UNLOCK WITH TEAM
            </Text>
            {FREE_LOCKED.map((label) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Lock size={10} color="#94A3B8" />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: "#94A3B8", fontWeight: "500" }}>{label}</Text>
              </View>
            ))}
            <View style={{ marginTop: 14 }}>
              <TouchableOpacity
                disabled
                style={{
                  borderRadius: 12,
                  paddingVertical: 11,
                  alignItems: "center",
                  backgroundColor: currentPlan === "free" ? "#F1F5F9" : "#F8FAFC",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  opacity: currentPlan === "free" ? 1 : 0.55,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8" }}>
                  {currentPlan === "free" ? "Current plan" : "Included in Team"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Team column */}
          <View
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 18,
              backgroundColor: "white",
              borderWidth: currentPlan === "team" ? 2 : 1,
              borderColor: currentPlan === "team" ? TEAM_ACCENT : "#E8EDF2",
              paddingHorizontal: 10,
              paddingTop: 12,
              paddingBottom: 14,
              shadowColor: "#000",
              shadowOpacity: currentPlan === "team" ? 0.1 : 0.06,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 3 },
              elevation: currentPlan === "team" ? 4 : 2,
            }}
            testID="tier-card-team"
          >
            {currentPlan !== "team" ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "#EEF2FF",
                  borderWidth: 1,
                  borderColor: "#C7D2FE",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 999,
                  marginBottom: 8,
                }}
              >
                <Star size={11} color="#4F46E5" fill="#4F46E5" />
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#4F46E5" }}>MOST POPULAR</Text>
              </View>
            ) : (
              <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
                <View
                  style={{
                    backgroundColor: TEAM_ACCENT,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                  }}
                  testID="current-plan-badge-team"
                >
                  <Text style={{ color: "white", fontSize: 9, fontWeight: "800" }}>CURRENT</Text>
                </View>
              </View>
            )}
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>Team</Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, lineHeight: 15 }}>
              For fast-moving teams that need execution
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 4, marginTop: 12 }}>
              <Text style={{ fontSize: 24, fontWeight: "800", color: TEAM_ACCENT }}>$19</Text>
              <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600" }}>per workspace / month</Text>
            </View>
            <Text style={{ fontSize: 10, color: "#CBD5E1", marginTop: 10, fontWeight: "700", letterSpacing: 0.6 }}>
              EVERYTHING IN FREE, PLUS
            </Text>
            {TEAM_FEATURES.map((label) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={11} color={TEAM_ACCENT} strokeWidth={3} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, color: "#334155", fontWeight: "500" }}>{label}</Text>
              </View>
            ))}
            <View style={{ marginTop: 14 }}>
              {!isLoading && currentPlan === "team" ? (
                <TouchableOpacity
                  disabled
                  style={{
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: "center",
                    backgroundColor: "#EEF2FF",
                    borderWidth: 1,
                    borderColor: "#C7D2FE",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: TEAM_ACCENT }}>Current plan</Text>
                </TouchableOpacity>
              ) : !isLoading && currentPlan === "free" ? (
                <>
                  <TouchableOpacity
                    onPress={() => upgradeMutation.mutate("team")}
                    disabled={upgradeMutation.isPending || !isOwner}
                    testID="upgrade-button-team"
                    style={{
                      borderRadius: 12,
                      overflow: "hidden",
                      opacity: !isOwner ? 0.45 : 1,
                    }}
                  >
                    <LinearGradient
                      colors={["#6366F1", "#4361EE"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 6,
                      }}
                    >
                      {upgradeMutation.isPending && upgradeMutation.variables === "team" ? (
                        <ActivityIndicator color="white" testID="upgrade-loading-team" />
                      ) : (
                        <>
                          <Crown size={14} color="#FCD34D" />
                          <Text style={{ color: "white", fontSize: 12, fontWeight: "800" }}>Upgrade to Team</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  {isOwner ? (
                    <Text
                      style={{
                        textAlign: "center",
                        fontSize: 10,
                        color: "#94A3B8",
                        marginTop: 8,
                        lineHeight: 14,
                      }}
                    >
                      Cancel anytime · Secure billing via Stripe
                    </Text>
                  ) : (
                    <Text style={{ textAlign: "center", fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
                      Only the workspace owner can upgrade.
                    </Text>
                  )}
                </>
              ) : (
                <ActivityIndicator color={TEAM_ACCENT} />
              )}
            </View>
          </View>
        </View>

        {/* Payment & renewals (Stripe web vs App Store / Play) */}
        {currentPlan === "team" && !isLoading && ((stripeBilled && isOwner) || (!stripeBilled && isRevenueCatEnabled())) ? (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <TouchableOpacity
              onPress={() => void handleManageSubscriptionBilling()}
              disabled={billingActionLoading}
              testID="subscription-manage-billing"
              style={{
                borderRadius: 16,
                paddingVertical: 14,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#FDE68A",
                backgroundColor: "#FFFBEB",
              }}
            >
              {billingActionLoading ? (
                <ActivityIndicator color="#D97706" />
              ) : (
                <Text style={{ color: "#B45309", fontWeight: "700", fontSize: 15 }}>
                  Manage payment & renewals
                </Text>
              )}
            </TouchableOpacity>
            <Text
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "#94A3B8",
                marginTop: 8,
                paddingHorizontal: 8,
              }}
            >
              Subscriptions started on the web open in a secure in-app browser (Stripe). In-app purchases use Apple
              or Google subscription settings.
            </Text>
          </View>
        ) : null}

        {/* Cancel plan section (in-app cancel is for store-synced plans; Stripe is cancelled in the billing portal) */}
        {currentPlan !== "free" && !isLoading && !stripeBilled ? (
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

        {/* Enterprise */}
        <TouchableOpacity
          onPress={() => void Linking.openURL(ENTERPRISE_MAIL)}
          activeOpacity={0.85}
          style={{
            marginHorizontal: 16,
            marginTop: 20,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            backgroundColor: "white",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
          testID="subscription-enterprise"
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#F1F5F9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={22} color="#64748B" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", lineHeight: 19 }}>
              More than 25 members?
            </Text>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 17 }}>
              Contact us for custom pricing for larger teams.
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE", marginTop: 8 }}>
              Contact Sales ›
            </Text>
          </View>
        </TouchableOpacity>

        {/* Restore Purchases — App Store / Play only (hide when this workspace is Stripe-billed) */}
        {isRevenueCatEnabled() && !stripeBilled ? (
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
            style={{ paddingVertical: 18, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#CBD5E1" />
            ) : (
              <>
                <Lock size={14} color="#CBD5E1" />
                <Text style={{ color: "#CBD5E1", fontSize: 13 }}>Restore Purchases</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <BillingPortalWebViewModal
        visible={!!billingPortalUrl}
        url={billingPortalUrl}
        onClose={() => setBillingPortalUrl(null)}
      />

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
                Cancel {currentPlanDisplayName} Plan?
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
