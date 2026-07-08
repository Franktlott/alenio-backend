import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Calendar, Check, ExternalLink, Globe, Info, Lock, Shield, Store } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  OPEN_WEB_DASHBOARD_LABEL,
  PLAN_SCREEN_TITLE,
  WEB_PLAN_MANAGEMENT_BODY,
  WEB_PLAN_MANAGEMENT_TITLE,
  WEB_WORKSPACE_DASHBOARD_URL,
  memberFreePlanMessage,
  ownerFreePlanMessage,
  teamActiveMessage,
  workplaceAccessSubtitle,
} from "@/lib/plan-access-copy";

type TeamListRow = { id: string; role: string; name?: string };

type Subscription = {
  plan: "free" | "team" | "pro";
  status: string;
  currentPeriodEnd: string | null;
};

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

const TEAM_FEATURES = [
  "Tasks & action items",
  "Team calendar",
  "Metrics & dashboards",
  "Workflow execution",
  "Performance insights",
  "Celebrations & shoutouts",
  "Priority support",
] as const;

function AccessBadge({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: "white", fontSize: 8, fontWeight: "800", letterSpacing: 0.2 }}>{label}</Text>
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: locked ? "#F1F5F9" : "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {locked ? <Lock size={9} color="#94A3B8" /> : <Check size={10} color={accent} strokeWidth={3} />}
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 10,
          lineHeight: 13,
          color: locked ? "#94A3B8" : "#334155",
          fontWeight: "500",
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionLabel({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <Text
      style={{
        fontSize: 9,
        color: muted ? "#94A3B8" : "#CBD5E1",
        marginTop: 10,
        fontWeight: "700",
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        backgroundColor: "#EEF2FF",
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: "#C7D2FE",
      }}
      testID="plan-access-info-banner"
    >
      <Info size={18} color="#4361EE" style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 12, color: "#334155", lineHeight: 17 }}>{children}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);

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

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const isOwner = activeTeam?.role === "owner";
  const currentPlan: TierPlan = subscriptionTierPlan(subscription);

  const openWebDashboard = () => {
    void Linking.openURL(WEB_WORKSPACE_DASHBOARD_URL);
  };

  const footerMessage =
    !isLoading && currentPlan === "team"
      ? teamActiveMessage(isOwner)
      : !isLoading && currentPlan === "free" && isOwner
        ? ownerFreePlanMessage()
        : !isLoading && currentPlan === "free" && !isOwner
          ? memberFreePlanMessage()
          : null;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top", "bottom"]}
      testID="subscription-screen"
    >
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 12,
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "center" }}>
            <Shield size={18} color="white" />
            <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>{PLAN_SCREEN_TITLE}</Text>
          </View>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 28, height: 28, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 8) }}>
        <View style={{ alignItems: "center", paddingHorizontal: 8, marginTop: 12 }}>
          {isLoading ? (
            <ActivityIndicator color="#4361EE" testID="subscription-loading" style={{ marginBottom: 10 }} />
          ) : null}
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
            }}
          >
            <Store size={24} color="#6366F1" />
          </View>
          <Text
            style={{
              textAlign: "center",
              fontSize: 20,
              fontWeight: "800",
              color: "#0F172A",
              lineHeight: 24,
              marginBottom: 6,
            }}
            numberOfLines={2}
          >
            {activeTeam?.name ?? "Your workplace"}
          </Text>
          <Text
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "#64748B",
              lineHeight: 17,
            }}
          >
            {workplaceAccessSubtitle(isOwner)}
          </Text>
          {!isLoading && subscription?.currentPeriodEnd && currentPlan === "team" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
              <Calendar size={13} color="#94A3B8" />
              <Text style={{ fontSize: 12, color: "#94A3B8" }}>
                Access through {formatDate(subscription.currentPeriodEnd)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1, flexDirection: "row", gap: 8, marginTop: 12, minHeight: 0 }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 16,
              backgroundColor: "white",
              borderWidth: currentPlan === "free" ? 2 : 1,
              borderColor: currentPlan === "free" ? FREE_ACCENT : "#E8EDF2",
              paddingHorizontal: 8,
              paddingTop: 10,
              paddingBottom: 10,
            }}
            testID="tier-card-free"
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>Free</Text>
                <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, lineHeight: 13 }}>
                  Chat and team basics
                </Text>
              </View>
              {currentPlan === "free" ? (
                <AccessBadge label="CURRENT ACCESS" color={FREE_ACCENT} />
              ) : null}
            </View>
            <SectionLabel>INCLUDED</SectionLabel>
            {FREE_INCLUDED.map((label) => (
              <FeatureRow key={label} label={label} accent="#0284C7" />
            ))}
            <SectionLabel muted>NOT INCLUDED</SectionLabel>
            {TEAM_FEATURES.map((label) => (
              <FeatureRow key={label} label={label} locked />
            ))}
          </View>

          <View
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 16,
              backgroundColor: "white",
              borderWidth: currentPlan === "team" ? 2 : 1,
              borderColor: currentPlan === "team" ? TEAM_ACCENT : "#E8EDF2",
              paddingHorizontal: 8,
              paddingTop: 10,
              paddingBottom: 10,
            }}
            testID="tier-card-team"
          >
            <View style={{ flex: 1, minHeight: 0 }}>
              {currentPlan === "team" ? (
                <View style={{ alignItems: "flex-end", marginBottom: 4 }}>
                  <AccessBadge label="CURRENT ACCESS" color={TEAM_ACCENT} />
                </View>
              ) : (
                <View style={{ height: 18, marginBottom: 4 }} />
              )}
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#0F172A" }}>Team</Text>
              <Text style={{ fontSize: 10, color: "#94A3B8", marginTop: 2, lineHeight: 13 }}>
                Execution, tasks, and insights
              </Text>
              <SectionLabel>EVERYTHING IN FREE, PLUS</SectionLabel>
              {TEAM_FEATURES.map((label) => (
                <FeatureRow key={label} label={label} accent={TEAM_ACCENT} />
              ))}
            </View>

            <View
              style={{
                marginTop: 10,
                borderRadius: 12,
                padding: 10,
                backgroundColor: "#F8FAFC",
                borderWidth: 1,
                borderColor: "#E2E8F0",
                gap: 8,
              }}
              testID="web-plan-management-card"
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: "#EEF2FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Globe size={14} color="#6366F1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: TEAM_ACCENT, marginBottom: 2 }}>
                    {WEB_PLAN_MANAGEMENT_TITLE}
                  </Text>
                  <Text style={{ fontSize: 10, color: "#64748B", lineHeight: 14 }}>{WEB_PLAN_MANAGEMENT_BODY}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={openWebDashboard}
                style={{
                  backgroundColor: TEAM_ACCENT,
                  borderRadius: 10,
                  paddingVertical: 9,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
                testID="open-web-dashboard-button"
              >
                <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{OPEN_WEB_DASHBOARD_LABEL}</Text>
                <ExternalLink size={12} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {footerMessage ? (
          <View style={{ marginTop: 10 }}>
            <InfoBanner>{footerMessage}</InfoBanner>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
