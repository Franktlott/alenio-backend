import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react-native";
import { AppPageBackground } from "@/components/AppPageBackground";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { ApiError } from "@/lib/api/api";
import {
  completeSenecaFocusAction,
  fetchSenecaFocus,
  isSenecaFocusActionId,
  recordSenecaFocusOpen,
  refreshSenecaFocus,
  senecaFocusQueryKey,
  type SenecaFocusAction,
  type SenecaFocusActionId,
  type SenecaFocusCategory,
} from "@/lib/seneca-focus";
import { senecaFocusActionNavigate } from "@/lib/seneca-navigation";
import { colors, space } from "@/theme";

function categoryAction(category: SenecaFocusCategory): SenecaFocusActionId {
  switch (category) {
    case "check_ins":
      return "view_check_ins";
    case "goals":
      return "view_goals";
    case "tasks":
      return "view_overdue_tasks";
    case "workload":
      return "view_workload";
    case "recognition":
    case "momentum":
      return "create_recognition";
    default:
      return "open_team";
  }
}

function actionCtaLabel(action: SenecaFocusActionId): string {
  switch (action) {
    case "view_check_ins":
      return "Review check-ins";
    case "view_goals":
      return "Review goals";
    case "view_overdue_tasks":
      return "View tasks";
    case "view_workload":
      return "Review workload";
    case "create_recognition":
      return "Recognize";
    case "open_team":
      return "Open Team";
  }
}

function cooldownText(availableAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((new Date(availableAt).getTime() - now) / 1000));
  if (seconds <= 0) return "Refresh";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `Refresh in ${minutes}:${remainder.toString().padStart(2, "0")}`;
}

const insightStatusLabel = {
  risk: "Risk",
  priority: "Priority",
  opportunity: "Opportunity",
  on_track: "On track",
} as const;

const insightStatusColor = {
  risk: "#DC2626",
  priority: "#4361EE",
  opportunity: "#0F766E",
  on_track: "#16A34A",
} as const;

export default function TeamFocusScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const openedBriefIds = useRef<Set<string>>(new Set());
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const focusQuery = useQuery({
    queryKey: senecaFocusQueryKey(teamId),
    queryFn: () => fetchSenecaFocus(teamId),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });
  const focus = focusQuery.data;

  useEffect(() => {
    const availableAt = cooldownUntil ?? focus?.refreshAvailableAt ?? null;
    if (!availableAt || new Date(availableAt).getTime() <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil, focus?.refreshAvailableAt]);

  useEffect(() => {
    const briefId = focus?.brief.id;
    if (!teamId || !briefId || openedBriefIds.current.has(briefId)) return;
    openedBriefIds.current.add(briefId);
    void recordSenecaFocusOpen(teamId, briefId).catch(() => {
      openedBriefIds.current.delete(briefId);
    });
  }, [teamId, focus?.brief.id]);

  const refreshMutation = useMutation({
    mutationFn: () => refreshSenecaFocus(teamId),
    onSuccess: (next) => {
      setCooldownUntil(next.refreshAvailableAt);
      queryClient.setQueryData(senecaFocusQueryKey(teamId), next);
      void queryClient.invalidateQueries({ queryKey: senecaFocusQueryKey(teamId) });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setCooldownUntil(error.body?.error?.refreshAvailableAt ?? focus?.refreshAvailableAt ?? null);
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: (action: SenecaFocusAction) =>
      completeSenecaFocusAction(teamId, focus!.brief.id, action.id),
    onSuccess: (next) => {
      queryClient.setQueryData(senecaFocusQueryKey(teamId), next);
      void queryClient.invalidateQueries({ queryKey: senecaFocusQueryKey(teamId) });
    },
  });

  const effectiveCooldown = cooldownUntil ?? focus?.refreshAvailableAt ?? null;
  const refreshDisabled =
    refreshMutation.isPending ||
    (!!effectiveCooldown && new Date(effectiveCooldown).getTime() > now);
  const refreshLabel = effectiveCooldown
    ? cooldownText(effectiveCooldown, now)
    : "Refresh";

  const statusCopy = useMemo(() => {
    if (!focus) return null;
    if (focus.stale || focus.brief.status === "stale") {
      return "This saved brief may be out of date. Refresh when available.";
    }
    if (focus.brief.status === "completed") {
      return "You completed this focus. Refresh for the next recommendation.";
    }
    if (focus.brief.status === "low_data") {
      return "Seneca will sharpen this focus as your team builds more history.";
    }
    if (focus.brief.status === "positive") {
      return "Your team has positive momentum worth reinforcing.";
    }
    return null;
  }, [focus]);

  const openAction = (actionId: string) => {
    if (!isSenecaFocusActionId(actionId)) return;
    senecaFocusActionNavigate(
      actionId,
      teamId,
      focus?.brief.affectedMemberIds ?? [],
    );
  };

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]} testID="team-focus-error">
        <AppPageBackground />
        <Text style={styles.centerCopy}>Missing workspace.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="team-focus-screen">
      <AppPageBackground />
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/team"))}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="team-focus-back"
        >
          <ArrowLeft size={20} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Today&apos;s Focus</Text>
          <Text style={styles.headerSubtitle}>Your brief from Seneca</Text>
        </View>
        <Pressable
          onPress={() => refreshMutation.mutate()}
          disabled={refreshDisabled}
          style={({ pressed }) => [
            styles.refreshButton,
            refreshDisabled ? styles.disabled : null,
            pressed ? styles.pressed : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel={refreshLabel}
          testID="team-focus-refresh"
        >
          <RefreshCw size={13} color={refreshDisabled ? "#94A3B8" : colors.brand} />
          <Text style={[styles.refreshText, refreshDisabled ? { color: "#94A3B8" } : null]}>
            {refreshMutation.isPending ? "Recalculating…" : refreshLabel}
          </Text>
        </Pressable>
      </View>

      {focusQuery.isLoading && !focus ? (
        <View style={styles.loading} testID="team-focus-loading">
          <SenecaIcon size={42} />
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.centerCopy}>Seneca is preparing today&apos;s brief…</Text>
        </View>
      ) : focusQuery.isError && !focus ? (
        <View style={styles.loading} testID="team-focus-load-error">
          <Text style={styles.errorTitle}>Couldn&apos;t load today&apos;s focus</Text>
          <Text style={styles.centerCopy}>
            {focusQuery.error instanceof Error ? focusQuery.error.message : "Please try again."}
          </Text>
          <Pressable
            onPress={() => void focusQuery.refetch()}
            style={styles.primaryButton}
            testID="team-focus-retry"
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : focus ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {statusCopy ? (
            <View
              style={[
                styles.statusBanner,
                focus.stale || focus.brief.status === "stale"
                  ? { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" }
                  : null,
              ]}
              testID={`team-focus-status-${focus.brief.status}`}
            >
              <Text style={styles.statusText}>{statusCopy}</Text>
            </View>
          ) : null}

          {refreshMutation.isError ? (
            <View style={styles.errorBanner} testID="team-focus-refresh-error">
              <Text style={styles.errorBannerText}>
                {refreshMutation.error instanceof ApiError && refreshMutation.error.status === 429
                  ? "Refresh is cooling down. Your current brief is still available."
                  : "Seneca couldn't refresh the brief. Please try again."}
              </Text>
            </View>
          ) : null}

          <View style={styles.hero}>
            <View style={styles.heroHeading}>
              <SenecaIcon size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.from}>From Seneca</Text>
                <Text style={styles.heroTitle}>{focus.brief.summary}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Clock3 size={12} color="#475569" />
                <Text style={styles.metaText}>Est. {focus.brief.estimatedMinutes} min</Text>
              </View>
              <View style={styles.metaChip}>
                <Sparkles size={12} color="#0F766E" />
                <Text style={[styles.metaText, { color: "#0F766E", textTransform: "capitalize" }]}>
                  {focus.brief.impact} impact
                </Text>
              </View>
              <View style={styles.metaChip}>
                <Users size={12} color="#475569" />
                <Text style={styles.metaText}>
                  {focus.brief.affectedCount} member{focus.brief.affectedCount === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{focus.brief.rationale}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Insights</Text>
            <View style={styles.card}>
              {focus.brief.keyInsights.slice(0, 5).map((insight, index) => (
                <View
                  key={insight.id}
                  style={[styles.insightRow, index > 0 ? styles.rowBorder : null]}
                  testID={`team-focus-insight-${insight.id}`}
                >
                  <View style={styles.insightStatus}>
                    <CheckCircle2 size={16} color={insightStatusColor[insight.status]} />
                    <Text
                      style={[
                        styles.insightStatusText,
                        { color: insightStatusColor[insight.status] },
                      ]}
                    >
                      {insightStatusLabel[insight.status]}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemTitle}>{insight.label}</Text>
                    <Text style={styles.itemDescription}>{insight.detail}</Text>
                    <Pressable
                      onPress={() => openAction(categoryAction(focus.brief.category))}
                      style={styles.relatedLink}
                      testID={`team-focus-insight-link-${insight.id}`}
                    >
                      <ExternalLink size={11} color={colors.brand} />
                      <Text style={styles.relatedLinkText}>Open relevant view</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommended Actions</Text>
            <View style={{ gap: 8 }}>
              {focus.brief.actions.slice(0, 4).map((action, index) => {
                const completed = !!action.completedAt;
                const completing =
                  completeMutation.isPending && completeMutation.variables?.id === action.id;
                return (
                  <View style={styles.actionCard} key={action.id} testID={`team-focus-action-${action.id}`}>
                    <View style={styles.actionNumber}>
                      {completed ? (
                        <Check size={14} color="#FFFFFF" strokeWidth={3} />
                      ) : (
                        <Text style={styles.actionNumberText}>{index + 1}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemTitle}>{action.title}</Text>
                      <Text style={styles.itemDescription}>{action.description}</Text>
                      <Text style={styles.actionTime}>
                        Est. {action.estimatedMinutes} min
                      </Text>
                      <View style={styles.actionButtons}>
                        <Pressable
                          onPress={() => openAction(action.action)}
                          style={styles.actionPrimary}
                          testID={`team-focus-action-open-${action.id}`}
                        >
                          <Text style={styles.actionPrimaryText}>
                            {actionCtaLabel(action.action)}
                          </Text>
                          <ChevronRight size={13} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          onPress={() => completeMutation.mutate(action)}
                          disabled={completed || completeMutation.isPending}
                          style={[styles.completeButton, completed ? styles.completedButton : null]}
                          testID={`team-focus-action-complete-${action.id}`}
                        >
                          {completing ? (
                            <ActivityIndicator size="small" color="#0F766E" />
                          ) : (
                            <Text style={styles.completeText}>
                              {completed ? "Completed" : "Mark complete"}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            {completeMutation.isError ? (
              <Text style={styles.mutationError} testID="team-focus-complete-error">
                Couldn&apos;t complete that action. Please try again.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.pagePad, paddingBottom: 10 },
  iconButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  headerSubtitle: { marginTop: 1, fontSize: 11, fontWeight: "500", color: "#64748B" },
  refreshButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E7FF" },
  refreshText: { fontSize: 10, fontWeight: "800", color: colors.brand },
  disabled: { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },
  pressed: { opacity: 0.78 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 36 },
  centerCopy: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: "#64748B", textAlign: "center" },
  errorTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  primaryButton: { marginTop: 4, borderRadius: 12, backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 11 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  content: { paddingHorizontal: space.pagePad, gap: 14 },
  statusBanner: { borderRadius: 10, borderWidth: 1, borderColor: "#E0E7FF", backgroundColor: "#EEF2FF", paddingHorizontal: 11, paddingVertical: 8 },
  statusText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: "#475569" },
  errorBanner: { borderRadius: 10, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", padding: 10 },
  errorBannerText: { fontSize: 11, lineHeight: 15, fontWeight: "600", color: "#991B1B" },
  hero: { borderRadius: 16, borderWidth: 1, borderColor: "#E0E7FF", backgroundColor: "#FFFFFF", padding: 14, gap: 12 },
  heroHeading: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  from: { fontSize: 9, fontWeight: "800", color: "#7C83A1", textTransform: "uppercase", letterSpacing: 0.55 },
  heroTitle: { marginTop: 3, fontSize: 16, lineHeight: 22, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "#F8FAFC", paddingHorizontal: 8, paddingVertical: 5 },
  metaText: { fontSize: 10, fontWeight: "700", color: "#475569" },
  section: { gap: 7 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  card: { overflow: "hidden", borderRadius: 14, borderWidth: 1, borderColor: "#E8ECF2", backgroundColor: "#FFFFFF", paddingHorizontal: 13 },
  body: { paddingVertical: 13, fontSize: 13, lineHeight: 19, color: "#475569" },
  insightRow: { flexDirection: "row", gap: 10, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0" },
  insightStatus: { width: 48, alignItems: "center", gap: 3, paddingTop: 2 },
  insightStatusText: { fontSize: 8, fontWeight: "800", color: "#64748B", textTransform: "uppercase" },
  itemTitle: { fontSize: 13, fontWeight: "800", color: "#0F172A" },
  itemDescription: { marginTop: 3, fontSize: 11, lineHeight: 16, color: "#64748B" },
  relatedLink: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  relatedLinkText: { fontSize: 10, fontWeight: "800", color: colors.brand },
  actionCard: { flexDirection: "row", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: "#E8ECF2", backgroundColor: "#FFFFFF", padding: 12 },
  actionNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  actionNumberText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  actionTime: { marginTop: 6, fontSize: 9, fontWeight: "700", color: "#64748B" },
  actionButtons: { marginTop: 9, flexDirection: "row", gap: 7 },
  actionPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 9, backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 8 },
  actionPrimaryText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  completeButton: { minWidth: 94, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 8 },
  completedButton: { borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  completeText: { fontSize: 10, fontWeight: "800", color: "#0F766E" },
  mutationError: { fontSize: 11, fontWeight: "600", color: "#B91C1C" },
});
