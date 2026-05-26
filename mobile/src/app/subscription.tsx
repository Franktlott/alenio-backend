import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Crown, Check, Lock, Star, Info } from "lucide-react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import {
  PLAN_SCREEN_SUBTITLE,
  PLAN_SCREEN_TITLE,
  memberFreePlanMessage,
  ownerFreePlanMessage,
  teamActiveMessage,
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

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 20,
        flexDirection: "row",
        gap: 12,
        backgroundColor: "#EEF2FF",
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "#C7D2FE",
      }}
      testID="plan-access-info-banner"
    >
      <Info size={20} color="#4361EE" style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: 14, color: "#334155", lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={["top"]}
      testID="subscription-screen"
    >
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{PLAN_SCREEN_TITLE}</Text>
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
        <View style={{ alignItems: "center", paddingHorizontal: 20, marginTop: 22 }}>
          {isLoading ? (
            <ActivityIndicator color="#4361EE" testID="subscription-loading" style={{ marginBottom: 14 }} />
          ) : null}
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
            {activeTeam?.name ? `${activeTeam.name}` : "Your workspace"}
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
            {PLAN_SCREEN_SUBTITLE}
          </Text>
          {!isLoading && subscription?.currentPeriodEnd && currentPlan === "team" ? (
            <Text style={{ textAlign: "center", fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
              Access through {formatDate(subscription.currentPeriodEnd)}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 12, marginTop: 18 }}>
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
                  Chat and team basics
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
            <Text style={{ fontSize: 10, color: "#CBD5E1", marginTop: 12, fontWeight: "700", letterSpacing: 0.6 }}>
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
          </View>

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
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#4F46E5" }}>FULL ACCESS</Text>
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
              Execution, tasks, and insights
            </Text>
            <Text style={{ fontSize: 10, color: "#CBD5E1", marginTop: 12, fontWeight: "700", letterSpacing: 0.6 }}>
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
              {!isLoading ? (
                <View
                  style={{
                    borderRadius: 12,
                    paddingVertical: 11,
                    alignItems: "center",
                    backgroundColor: currentPlan === "team" ? "#EEF2FF" : "#F8FAFC",
                    borderWidth: 1,
                    borderColor: currentPlan === "team" ? "#C7D2FE" : "#E2E8F0",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: currentPlan === "team" ? TEAM_ACCENT : "#94A3B8",
                    }}
                  >
                    {currentPlan === "team" ? "Active for this workspace" : "Not active"}
                  </Text>
                </View>
              ) : (
                <ActivityIndicator color={TEAM_ACCENT} />
              )}
            </View>
          </View>
        </View>

        {!isLoading && currentPlan === "team" ? (
          <InfoBanner>{teamActiveMessage()}</InfoBanner>
        ) : null}
        {!isLoading && currentPlan === "free" && isOwner ? (
          <InfoBanner>{ownerFreePlanMessage()}</InfoBanner>
        ) : null}
        {!isLoading && currentPlan === "free" && !isOwner ? (
          <InfoBanner>{memberFreePlanMessage()}</InfoBanner>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
