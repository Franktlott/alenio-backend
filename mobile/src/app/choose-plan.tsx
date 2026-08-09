import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { postBillingCheckout, type SubscriptionApiRow } from "@/lib/account-hub-api";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";
import { AppPageBackground } from "@/components/AppPageBackground";

type PlanId = "pro" | "operations";

const PLANS: Array<{
  id: PlanId;
  name: string;
  summary: string;
  price: string;
  icon: typeof Zap;
  features: string[];
  comingSoon?: boolean;
}> = [
  {
    id: "pro",
    name: "Team / Pro",
    summary: "The people and execution toolkit for one high-performing team.",
    price: "$39.99",
    icon: Zap,
    features: ["Tasks and priorities", "Team calendar", "Coaching and Seneca", "Insights and development"],
  },
  {
    id: "operations",
    name: "Operations",
    summary: "Everything in Pro, plus tools for consistent frontline operations.",
    price: "$69.99",
    icon: Sparkles,
    features: [
      "Everything in Pro",
      "Alenio Go checklists and walks — Coming soon",
      "Temperature checks — Coming soon",
      "Shift operations tools — Coming soon",
    ],
    comingSoon: true,
  },
];

export default function ChoosePlanScreen() {
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const { teamId: teamIdParam } = useLocalSearchParams<{ teamId?: string }>();
  const teamId = (typeof teamIdParam === "string" && teamIdParam) || activeTeamId || "";
  const [selected, setSelected] = useState<PlanId>("pro");
  const [billingUrl, setBillingUrl] = useState<string | null>(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });
  const { data: subscription } = useQuery({
    queryKey: ["subscription", teamId],
    queryFn: () => api.get<SubscriptionApiRow>(`/api/teams/${teamId}/subscription`),
    enabled: !!teamId,
  });
  const team = useMemo(() => teams.find((item) => item.id === teamId), [teamId, teams]);
  const isOwner = team?.role === "owner";
  const trialEndDate =
    subscription?.status?.trim().toLowerCase() === "trialing" && subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null;
  const validTrialEndDate =
    trialEndDate && Number.isFinite(trialEndDate.getTime()) ? trialEndDate : null;
  const trialDaysRemaining =
    subscription?.remainingDays ??
    (validTrialEndDate
      ? Math.max(0, Math.ceil((validTrialEndDate.getTime() - Date.now()) / 86_400_000))
      : null);
  const trialHeaderLabel = validTrialEndDate
    ? ` · Ends ${validTrialEndDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}${trialDaysRemaining == null ? "" : ` · ${trialDaysRemaining}d left`}`
    : "";

  const checkout = useMutation({
    mutationFn: () => postBillingCheckout(teamId, selected),
    onSuccess: (result) => {
      if (result.openedWebFallback) return;
      setBillingUrl(result.url);
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t open checkout", message: error.message, preset: "error" }),
  });

  const closeBilling = useCallback(() => {
    setBillingUrl(null);
    void queryClient.invalidateQueries({ queryKey: ["subscription", teamId] });
  }, [queryClient, teamId]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]} testID="choose-plan-screen">
      <AppPageBackground />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} testID="choose-plan-back">
          <ArrowLeft size={21} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Choose a Plan</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {team?.name ?? "Workspace access"}
            {trialHeaderLabel}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Keep your workspace moving</Text>
        <Text style={styles.subtitle}>
          Select the plan that fits your team. Billing starts only after secure checkout is complete.
        </Text>

        {PLANS.map((plan) => {
          const active = selected === plan.id;
          const Icon = plan.icon;
          return (
            <Pressable
              key={plan.id}
              onPress={() => setSelected(plan.id)}
              disabled={plan.comingSoon}
              style={[
                styles.planCard,
                active ? styles.planCardActive : null,
                plan.comingSoon ? styles.planCardComingSoon : null,
              ]}
              testID={`plan-${plan.id}`}
              accessibilityState={{ disabled: !!plan.comingSoon, selected: active }}
            >
              <View style={styles.planHeader}>
                <View style={[styles.planIcon, active ? styles.planIconActive : null]}>
                  <Icon size={21} color={active ? "white" : "#4361EE"} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.planNameRow}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {plan.comingSoon ? (
                      <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonText}>COMING SOON</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.planSummary}>{plan.summary}</Text>
                </View>
                {!plan.comingSoon ? (
                  <View style={[styles.radio, active ? styles.radioActive : null]}>
                    {active ? <Check size={13} color="white" strokeWidth={3} /> : null}
                  </View>
                ) : null}
              </View>
              <View style={styles.planPriceRow}>
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={styles.planPriceSuffix}>per workspace / month</Text>
              </View>
              <View style={styles.features}>
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Check size={15} color="#16A34A" strokeWidth={2.5} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}

        {!isOwner && team ? (
          <View style={styles.memberNote}>
            <Text style={styles.memberNoteTitle}>Workspace owner approval required</Text>
            <Text style={styles.memberNoteText}>Only the workspace owner can complete billing. You can still review the options here.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => checkout.mutate()}
          disabled={!teamId || !isOwner || checkout.isPending}
          style={[styles.primaryButton, !teamId || !isOwner ? styles.primaryButtonDisabled : null]}
          testID="continue-to-checkout"
        >
          {checkout.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryButtonText}>Continue with {selected === "operations" ? "Operations" : "Pro"}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: "/account-hub", params: teamId ? { teamId } : undefined })}
          testID="plan-access-link"
        >
          <Text style={styles.secondaryLink}>View Plan & Access</Text>
        </Pressable>
      </View>

      <BillingPortalWebViewModal
        visible={!!billingUrl}
        url={billingUrl}
        workspaceName={team?.name}
        onClose={closeBilling}
        onFlowComplete={(result) => {
          if (result === "success") {
            toast({ title: "Plan updated", preset: "done" });
            void queryClient.invalidateQueries({ queryKey: ["subscription", teamId] });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  headerSubtitle: { fontSize: 12, color: "#64748B", marginTop: 1 },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, gap: 12 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", color: "#0F172A" },
  subtitle: { fontSize: 14, lineHeight: 20, color: "#64748B", marginBottom: 4 },
  planCard: { backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18, padding: 16 },
  planCardActive: { borderColor: "#4361EE", borderWidth: 2, padding: 15, backgroundColor: "#F8FAFF" },
  planCardComingSoon: { opacity: 0.72, backgroundColor: "#F8FAFC" },
  planHeader: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  planIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  planIconActive: { backgroundColor: "#4361EE" },
  planNameRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  planName: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  planSummary: { fontSize: 12, lineHeight: 17, color: "#64748B", marginTop: 3 },
  comingSoonBadge: { borderRadius: 999, backgroundColor: "#EDE9FE", paddingHorizontal: 7, paddingVertical: 2 },
  comingSoonText: { fontSize: 8, fontWeight: "800", color: "#6D28D9", letterSpacing: 0.35 },
  planPriceRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 13 },
  planPrice: { fontSize: 22, lineHeight: 26, fontWeight: "800", color: "#0F172A" },
  planPriceSuffix: { fontSize: 10, color: "#64748B" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  radioActive: { backgroundColor: "#4361EE", borderColor: "#4361EE" },
  features: { marginTop: 14, gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { fontSize: 13, color: "#334155", fontWeight: "600" },
  memberNote: { backgroundColor: "#FFF7ED", borderRadius: 13, padding: 13, borderWidth: 1, borderColor: "#FED7AA" },
  memberNoteTitle: { fontSize: 13, fontWeight: "800", color: "#9A3412" },
  memberNoteText: { fontSize: 12, lineHeight: 17, color: "#C2410C", marginTop: 3 },
  footer: { paddingHorizontal: 18, paddingTop: 10, gap: 11 },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" },
  primaryButtonDisabled: { backgroundColor: "#94A3B8" },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "800" },
  secondaryLink: { color: "#4361EE", fontSize: 13, fontWeight: "700", textAlign: "center" },
});
