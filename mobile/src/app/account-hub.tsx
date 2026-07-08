import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Globe,
  Info,
  Lock,
  Shield,
  Sparkles,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";
import { WorkspaceTeamAvatar, formatTeamRole } from "@/components/WorkspaceTeamUI";
import {
  planStatusLabel,
  postBillingCheckout,
  postBillingPortal,
  rowFromTeamAndSubscription,
  tierFromPlan,
  type WorkspaceBillingRow,
} from "@/lib/account-hub-api";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  ACCOUNT_HUB_SUBTITLE,
  ACCOUNT_HUB_TITLE,
  OPEN_WEB_DASHBOARD_LABEL,
  WEB_WORKSPACE_DASHBOARD_URL,
  memberFreePlanMessage,
  ownerFreePlanMessage,
  teamActiveMessage,
} from "@/lib/plan-access-copy";

const TEAM_ACCENT = "#6366F1";
const FREE_ACCENT = "#64748B";

const FREE_INCLUDED = ["Activity feed", "Team chat", "Team members"] as const;

const TEAM_FEATURES = [
  "Tasks & action items",
  "Team calendar",
  "Metrics & dashboards",
  "Workflow execution",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function PlanBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: "white", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function FeatureRow({
  label,
  locked = false,
  accent = TEAM_ACCENT,
}: {
  label: string;
  locked?: boolean;
  accent?: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: locked ? "#F1F5F9" : "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {locked ? <Lock size={11} color="#94A3B8" /> : <Check size={12} color={accent} strokeWidth={3} />}
      </View>
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 18, color: locked ? "#94A3B8" : "#334155", fontWeight: "500" }}>
        {label}
      </Text>
    </View>
  );
}

function WorkspaceRow({
  row,
  selected,
  planLoading = false,
  onPress,
}: {
  row: WorkspaceBillingRow;
  selected: boolean;
  planLoading?: boolean;
  onPress: () => void;
}) {
  const planLine = planLoading
    ? "Loading plan…"
    : `${formatTeamRole(row.role)} · ${planStatusLabel(row.subscription.plan, row.subscription.status)}`;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderRadius: 14,
        backgroundColor: selected ? "#EEF2FF" : "white",
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? "#4361EE" : "#E2E8F0",
        marginBottom: 10,
      }}
      testID={`workspace-billing-row-${row.id}`}
    >
      <WorkspaceTeamAvatar team={row} size={44} active={selected} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
          {row.name}
        </Text>
        <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{planLine}</Text>
      </View>
      <ChevronRight size={18} color={selected ? "#4361EE" : "#94A3B8"} />
    </Pressable>
  );
}

export default function AccountHubScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { teamId: teamIdParam, billing: billingFlash } = useLocalSearchParams<{
    teamId?: string;
    billing?: string;
  }>();

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [billingUrl, setBillingUrl] = useState<string | null>(null);
  const [billingModalOpen, setBillingModalOpen] = useState(false);

  const {
    data: teams = [],
    isLoading: teamsLoading,
    isError: teamsError,
    error: teamsLoadError,
    refetch: refetchTeams,
  } = useQuery({
    queryKey: ["teams"],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; image: string | null; role: string }>>("/api/teams"),
    staleTime: 30_000,
  });

  const subscriptionQueries = useQueries({
    queries: teams.map((team) => ({
      queryKey: ["subscription", team.id],
      queryFn: () =>
        api.get<{
          plan: string;
          status: string;
          currentPeriodEnd: string | null;
          billingProvider?: "stripe" | "mobile_store" | "none";
        }>(`/api/teams/${team.id}/subscription`),
      enabled: !!team.id,
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const subscriptionByTeamId = useMemo(() => {
    const map = new Map<string, (typeof subscriptionQueries)[number]["data"]>();
    teams.forEach((team, index) => {
      const sub = subscriptionQueries[index]?.data;
      if (sub) map.set(team.id, sub);
    });
    return map;
  }, [teams, subscriptionQueries]);

  const workspaces = useMemo((): WorkspaceBillingRow[] => {
    return teams.map((team) => {
      const sub = subscriptionByTeamId.get(team.id);
      if (sub) return rowFromTeamAndSubscription(team, sub);
      return {
        id: team.id,
        name: team.name,
        image: team.image,
        role: team.role,
        canManageBilling: team.role === "owner",
        subscription: {
          plan: "free",
          status: "active",
          currentPeriodEnd: null,
          billingProvider: "none",
          hasStripeCustomer: false,
          hasStripeSubscription: false,
        },
      };
    });
  }, [teams, subscriptionByTeamId]);

  const plansLoading = subscriptionQueries.some((q) => q.isLoading);
  const isLoading = teamsLoading;
  const isError = teamsError;
  const error = teamsLoadError;

  const refetch = useCallback(() => {
    void refetchTeams();
    subscriptionQueries.forEach((q) => void q.refetch());
  }, [refetchTeams, subscriptionQueries]);

  const isRefetching = teamsLoading || subscriptionQueries.some((q) => q.isRefetching);

  const ownedWorkspaces = useMemo(
    () => workspaces.filter((w) => w.canManageBilling),
    [workspaces],
  );

  const memberWorkspaces = useMemo(
    () => workspaces.filter((w) => !w.canManageBilling),
    [workspaces],
  );

  useEffect(() => {
    if (workspaces.length === 0) return;
    const fromParam = typeof teamIdParam === "string" ? teamIdParam : null;
    const preferred =
      (fromParam && workspaces.some((w) => w.id === fromParam) ? fromParam : null) ??
      (activeTeamId && workspaces.some((w) => w.id === activeTeamId) ? activeTeamId : null) ??
      ownedWorkspaces[0]?.id ??
      workspaces[0]?.id ??
      null;
    setSelectedTeamId((prev) => (prev && workspaces.some((w) => w.id === prev) ? prev : preferred));
  }, [workspaces, teamIdParam, activeTeamId, ownedWorkspaces]);

  useEffect(() => {
    if (billingFlash === "success") {
      toast({ title: "Subscription updated", preset: "done" });
      void refetch();
      router.setParams({ billing: undefined });
    }
  }, [billingFlash, refetch]);

  const selected = workspaces.find((w) => w.id === selectedTeamId) ?? null;
  const selectedTier = tierFromPlan(selected?.subscription.plan);
  const isOwner = selected?.canManageBilling ?? false;
  const hasStripeBilling =
    selected?.subscription.billingProvider === "stripe" ||
    selected?.subscription.hasStripeSubscription ||
    selected?.subscription.hasStripeCustomer;

  const checkoutMutation = useMutation({
    mutationFn: (teamId: string) => postBillingCheckout(teamId),
    onSuccess: (result) => {
      if (result.openedWebFallback) {
        toast({ title: "Opening web billing…", preset: "none" });
        return;
      }
      setBillingUrl(result.url);
      setBillingModalOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not start upgrade", preset: "error" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: (teamId: string) => postBillingPortal(teamId),
    onSuccess: (result) => {
      if (result.openedWebFallback) {
        toast({ title: "Opening web billing…", preset: "none" });
        return;
      }
      setBillingUrl(result.url);
      setBillingModalOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not open billing", preset: "error" });
    },
  });

  const closeBillingModal = useCallback(() => {
    setBillingModalOpen(false);
    setBillingUrl(null);
  }, []);

  const onBillingFlowComplete = useCallback(
    (result: "success" | "cancel") => {
      if (result === "success") {
        toast({ title: "Subscription updated", preset: "done" });
        void queryClient.invalidateQueries({ queryKey: ["teams"] });
        void queryClient.invalidateQueries({ queryKey: ["subscription"] });
      }
    },
    [queryClient],
  );

  const footerMessage =
    selected && selectedTier === "team"
      ? teamActiveMessage(isOwner)
      : selected && selectedTier === "free" && isOwner
        ? ownerFreePlanMessage()
        : selected && selectedTier === "free" && !isOwner
          ? memberFreePlanMessage()
          : null;

  const busy = checkoutMutation.isPending || portalMutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top", "bottom"]} testID="account-hub-screen">
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()} testID="account-hub-back" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
            <Shield size={18} color="white" />
            <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>{ACCOUNT_HUB_TITLE}</Text>
          </View>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20, marginBottom: 16 }}>{ACCOUNT_HUB_SUBTITLE}</Text>

        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 32 }} testID="account-hub-loading">
            <ActivityIndicator color="#4361EE" size="large" />
            <Text style={{ marginTop: 12, fontSize: 14, color: "#64748B" }}>Loading workplaces…</Text>
          </View>
        ) : null}

        {isError ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 24,
              paddingHorizontal: 12,
              backgroundColor: "white",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#FECACA",
              marginBottom: 16,
            }}
            testID="account-hub-error"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6, textAlign: "center" }}>
              Couldn't load workplaces
            </Text>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, marginBottom: 14 }}>
              {(error as Error)?.message ?? "Check your connection and try again."}
            </Text>
            <TouchableOpacity
              onPress={() => void refetch()}
              style={{ backgroundColor: "#4361EE", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text style={{ color: "white", fontWeight: "600", fontSize: 14 }}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isLoading && !isError && workspaces.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 24,
              paddingHorizontal: 12,
              backgroundColor: "white",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              marginBottom: 16,
            }}
            testID="account-hub-empty"
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 6 }}>No workplaces yet</Text>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18 }}>
              Create or join a workplace from your profile to manage billing here.
            </Text>
          </View>
        ) : null}

        {!isLoading && !isError && ownedWorkspaces.length > 0 ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8, marginBottom: 10 }}>
              YOUR WORKPLACES
            </Text>
            {ownedWorkspaces.map((row) => (
              <WorkspaceRow
                key={row.id}
                row={row}
                selected={row.id === selectedTeamId}
                planLoading={plansLoading && !subscriptionByTeamId.has(row.id)}
                onPress={() => setSelectedTeamId(row.id)}
              />
            ))}
          </View>
        ) : null}

        {!isLoading && !isError && memberWorkspaces.length > 0 ? (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8, marginBottom: 10 }}>
              MEMBER WORKPLACES
            </Text>
            {memberWorkspaces.map((row) => (
              <WorkspaceRow
                key={row.id}
                row={row}
                selected={row.id === selectedTeamId}
                planLoading={plansLoading && !subscriptionByTeamId.has(row.id)}
                onPress={() => setSelectedTeamId(row.id)}
              />
            ))}
          </View>
        ) : null}

        {!isLoading && !isError && selected ? (
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              padding: 16,
              marginBottom: 16,
            }}
            testID="workspace-plan-detail"
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#0F172A" }}>{selected.name}</Text>
                <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                  {planStatusLabel(selected.subscription.plan, selected.subscription.status)}
                </Text>
              </View>
              <PlanBadge
                label={selectedTier === "team" ? "TEAM" : "FREE"}
                color={selectedTier === "team" ? TEAM_ACCENT : FREE_ACCENT}
              />
            </View>

            {selectedTier === "team" && selected.subscription.currentPeriodEnd ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Calendar size={14} color="#94A3B8" />
                <Text style={{ fontSize: 13, color: "#64748B" }}>
                  Access through {formatDate(selected.subscription.currentPeriodEnd)}
                </Text>
              </View>
            ) : null}

            {isOwner ? (
              <View style={{ marginTop: 16, gap: 10 }}>
                {selectedTier === "free" ? (
                  <TouchableOpacity
                    onPress={() => checkoutMutation.mutate(selected.id)}
                    disabled={busy}
                    style={{
                      backgroundColor: "#4361EE",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: busy ? 0.7 : 1,
                    }}
                    testID="upgrade-workspace-button"
                  >
                    {checkoutMutation.isPending ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Sparkles size={18} color="white" />
                        <Text style={{ color: "white", fontSize: 15, fontWeight: "700" }}>Upgrade to Team</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}

                {selectedTier === "team" && hasStripeBilling ? (
                  <TouchableOpacity
                    onPress={() => portalMutation.mutate(selected.id)}
                    disabled={busy}
                    style={{
                      backgroundColor: "#EEF2FF",
                      borderRadius: 12,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderWidth: 1,
                      borderColor: "#C7D2FE",
                      opacity: busy ? 0.7 : 1,
                    }}
                    testID="update-payment-button"
                  >
                    {portalMutation.isPending ? (
                      <ActivityIndicator color="#4361EE" />
                    ) : (
                      <>
                        <CreditCard size={18} color="#4361EE" />
                        <Text style={{ color: "#4361EE", fontSize: 15, fontWeight: "700" }}>Update payment details</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={() => void Linking.openURL(WEB_WORKSPACE_DASHBOARD_URL)}
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderRadius: 12,
                    paddingVertical: 14,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                  }}
                  testID="open-web-dashboard-button"
                >
                  <Globe size={18} color="#64748B" />
                  <Text style={{ color: "#334155", fontSize: 14, fontWeight: "600" }}>{OPEN_WEB_DASHBOARD_LABEL}</Text>
                  <ExternalLink size={14} color="#64748B" />
                </TouchableOpacity>
              </View>
            ) : (
              <View
                style={{
                  marginTop: 16,
                  backgroundColor: "#F8FAFC",
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                }}
              >
                <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }}>
                  Only the workplace owner can upgrade or manage billing. Ask your administrator to update this workplace.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {!isLoading && !isError && selected ? (
          <View style={{ gap: 12, marginBottom: 16 }}>
            <View
              style={{
                borderRadius: 16,
                backgroundColor: "white",
                borderWidth: selectedTier === "free" ? 2 : 1,
                borderColor: selectedTier === "free" ? FREE_ACCENT : "#E2E8F0",
                padding: 16,
              }}
              testID="plan-card-free"
            >
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Free</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Chat and team basics</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", marginTop: 14, letterSpacing: 0.6 }}>
                INCLUDED
              </Text>
              {FREE_INCLUDED.map((label) => (
                <FeatureRow key={label} label={label} accent="#0284C7" />
              ))}
            </View>

            <View
              style={{
                borderRadius: 16,
                backgroundColor: "white",
                borderWidth: selectedTier === "team" ? 2 : 1,
                borderColor: selectedTier === "team" ? TEAM_ACCENT : "#E2E8F0",
                padding: 16,
              }}
              testID="plan-card-team"
            >
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Team</Text>
              <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>Execution, tasks, and insights</Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", marginTop: 14, letterSpacing: 0.6 }}>
                EVERYTHING IN FREE, PLUS
              </Text>
              {TEAM_FEATURES.map((label) => (
                <FeatureRow key={label} label={label} accent={TEAM_ACCENT} />
              ))}
            </View>
          </View>
        ) : null}

        {footerMessage ? (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              backgroundColor: "#EEF2FF",
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: "#C7D2FE",
              marginBottom: 8,
            }}
            testID="account-hub-info-banner"
          >
            <Info size={18} color="#4361EE" style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, color: "#334155", lineHeight: 18 }}>{footerMessage}</Text>
          </View>
        ) : null}

        {isRefetching ? (
          <View style={{ alignItems: "center", paddingTop: 8 }}>
            <ActivityIndicator color="#4361EE" size="small" />
          </View>
        ) : null}
      </ScrollView>

      <BillingPortalWebViewModal
        visible={billingModalOpen}
        url={billingUrl}
        onClose={closeBillingModal}
        onFlowComplete={onBillingFlowComplete}
      />
    </SafeAreaView>
  );
}
