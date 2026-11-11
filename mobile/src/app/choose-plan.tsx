import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Sparkles, Zap } from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import type { Team } from "@/lib/types";
import { postBillingCheckout, type SubscriptionApiRow } from "@/lib/account-hub-api";
import { isPlayCheckoutCanceled } from "@/lib/play-external-links";
import { BillingPortalWebViewModal } from "@/components/BillingPortalWebViewModal";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import {
  AppText,
  Button,
  Card,
  IconTile,
  tintInk,
} from "@/components/ui";
import { shortPeriod, usePlans } from "@/lib/plans";
import { palette, tints } from "@/theme";

type PlanId = "pro" | "operations";

const BAND_SHEET_RADIUS = 24;
const HEADER_ROW = 48;

/** Names, prices, features, and availability come from the server; this is only icon look. */
const PLAN_LOOK: Array<{ id: PlanId; icon: typeof Zap }> = [
  { id: "pro", icon: Zap },
  { id: "operations", icon: Sparkles },
];

export default function ChoosePlanScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const { teamId: teamIdParam } = useLocalSearchParams<{ teamId?: string }>();
  const teamId =
    (typeof teamIdParam === "string" && teamIdParam) || activeTeamId || "";
  const [selected, setSelected] = useState<PlanId>("pro");
  const [billingUrl, setBillingUrl] = useState<string | null>(null);
  const plans = usePlans();
  const bandHeight = insets.top + HEADER_ROW + 18;

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, []),
  );

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });
  const { data: subscription } = useQuery({
    queryKey: ["subscription", teamId],
    queryFn: () =>
      api.get<SubscriptionApiRow>(`/api/teams/${teamId}/subscription`),
    enabled: !!teamId,
  });
  const team = useMemo(
    () => teams.find((item) => item.id === teamId),
    [teamId, teams],
  );
  const isOwner = team?.role === "owner";
  const trialEndDate =
    subscription?.status?.trim().toLowerCase() === "trialing" &&
    subscription.trialEndsAt
      ? new Date(subscription.trialEndsAt)
      : null;
  const validTrialEndDate =
    trialEndDate && Number.isFinite(trialEndDate.getTime())
      ? trialEndDate
      : null;
  const trialDaysRemaining =
    subscription?.remainingDays ??
    (validTrialEndDate
      ? Math.max(
          0,
          Math.ceil((validTrialEndDate.getTime() - Date.now()) / 86_400_000),
        )
      : null);
  const trialEndsLabel = validTrialEndDate
    ? `Ends ${validTrialEndDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`
    : null;

  const checkout = useMutation({
    mutationFn: () => postBillingCheckout(teamId, selected),
    onSuccess: (result) => {
      if (result.openedWebFallback) return;
      setBillingUrl(result.url);
    },
    onError: (error: Error) => {
      if (isPlayCheckoutCanceled(error)) return;
      toast({
        title: "Couldn’t open checkout",
        message: error.message,
        preset: "error",
      });
    },
  });

  const closeBilling = useCallback(() => {
    setBillingUrl(null);
    void queryClient.invalidateQueries({ queryKey: ["subscription", teamId] });
  }, [queryClient, teamId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (teamId) {
      router.replace({ pathname: "/workspace-settings", params: { teamId } });
    } else {
      router.replace("/(app)/home");
    }
  };

  return (
    <View style={styles.screen} testID="choose-plan-screen">
      <AppHeaderBand height={bandHeight} />
      <View style={[styles.bandHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={goBack}
          style={styles.headerAction}
          testID="choose-plan-back"
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.bandTitle} numberOfLines={1}>
            Choose a plan
          </Text>
          <Text style={styles.bandSubtitle} numberOfLines={1}>
            {team?.name ?? "Workspace access"}
          </Text>
        </View>
        <View style={styles.topActionPlaceholder} />
      </View>

      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 12) + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCompact}>
            <View style={styles.heroCopy}>
              <AppText variant="sectionTitle" style={styles.heroTitle}>
                Keep your workspace moving
              </AppText>
              <AppText variant="supporting" numberOfLines={2}>
                Billing starts only after secure checkout.
              </AppText>
            </View>
            {trialDaysRemaining != null ? (
              <View style={styles.trialChip}>
                <Text style={styles.trialChipText}>
                  {trialDaysRemaining}d left
                </Text>
              </View>
            ) : null}
          </View>
          {trialEndsLabel ? (
            <AppText variant="meta">Trial {trialEndsLabel.toLowerCase()}</AppText>
          ) : null}

          <View style={styles.sectionBlock}>
            {PLAN_LOOK.map((look) => {
              const plan = { ...look, ...plans[look.id] };
              const active = selected === plan.id;
              const Icon = plan.icon;
              const showFeatures = active && !plan.comingSoon;
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
                  accessibilityState={{
                    disabled: !!plan.comingSoon,
                    selected: active,
                  }}
                >
                  <View style={styles.planHeader}>
                    <IconTile tint="lavender" size={34}>
                      <Icon
                        size={15}
                        color={
                          plan.comingSoon
                            ? palette.inkMuted
                            : tintInk("lavender")
                        }
                        strokeWidth={2.2}
                      />
                    </IconTile>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.planNameRow}>
                        <AppText variant="rowTitle">{plan.name}</AppText>
                        {plan.comingSoon ? (
                          <View style={styles.comingSoonBadge}>
                            <Text style={styles.comingSoonText}>COMING SOON</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.planPriceRow}>
                        <Text style={styles.planPrice}>{plan.priceLabel}</Text>
                        <AppText variant="meta">{shortPeriod(plan)}</AppText>
                      </View>
                    </View>
                    {!plan.comingSoon ? (
                      <View
                        style={[styles.radio, active ? styles.radioActive : null]}
                      >
                        {active ? (
                          <Check size={13} color="#FFFFFF" strokeWidth={3} />
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  <AppText
                    variant="supporting"
                    numberOfLines={showFeatures ? 3 : 2}
                    style={{ marginTop: 8 }}
                  >
                    {plan.bestFor}
                  </AppText>

                  {showFeatures ? (
                    <View style={styles.features}>
                      {plan.features.slice(0, 5).map((feature) => (
                        <View key={feature} style={styles.featureRow}>
                          <Check
                            size={13}
                            color={palette.violet}
                            strokeWidth={2.5}
                          />
                          <AppText
                            variant="supporting"
                            style={styles.featureText}
                            numberOfLines={1}
                          >
                            {feature}
                          </AppText>
                        </View>
                      ))}
                      {plan.features.length > 5 ? (
                        <AppText variant="meta" style={{ marginLeft: 21 }}>
                          +{plan.features.length - 5} more
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {!isOwner && team ? (
            <Card style={styles.memberNote}>
              <AppText variant="rowTitle" color="#9A3412">
                Workspace owner approval required
              </AppText>
              <AppText
                variant="supporting"
                color="#C2410C"
                style={{ marginTop: 3 }}
              >
                Only the workspace owner can complete billing. You can still
                review the options here.
              </AppText>
            </Card>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
            label={`Continue with ${plans[selected].name}`}
            loading={checkout.isPending}
            disabled={!teamId || !isOwner || checkout.isPending}
            onPress={() => checkout.mutate()}
            testID="continue-to-checkout"
          />
          <Button
            variant="link"
            size="md"
            fullWidth
            label="View plan & access"
            onPress={() =>
              router.push({
                pathname: "/account-hub",
                params: teamId ? { teamId } : undefined,
              })
            }
            testID="plan-access-link"
            style={{ alignSelf: "center" }}
          />
        </View>
      </View>

      <BillingPortalWebViewModal
        visible={!!billingUrl}
        url={billingUrl}
        workspaceName={team?.name}
        onClose={closeBilling}
        onFlowComplete={(result) => {
          if (result === "success") {
            toast({ title: "Plan updated", preset: "done" });
            void queryClient.invalidateQueries({
              queryKey: ["subscription", teamId],
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.page,
  },
  bandHeader: {
    zIndex: 2,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  topActionPlaceholder: {
    width: 34,
    height: 34,
  },
  topTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  bandTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.25,
  },
  bandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.72)",
  },
  sheet: {
    flex: 1,
    marginTop: -8,
    borderTopLeftRadius: BAND_SHEET_RADIUS,
    borderTopRightRadius: BAND_SHEET_RADIUS,
    backgroundColor: palette.page,
    overflow: "hidden",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  heroCompact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroTitle: {
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.25,
  },
  trialChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: tints.lavender.bg,
  },
  trialChipText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: palette.violet,
  },
  sectionBlock: {
    gap: 8,
  },
  planCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  planCardActive: {
    borderColor: palette.violet,
    borderWidth: 1.5,
    backgroundColor: "#FBFAFF",
  },
  planCardComingSoon: {
    opacity: 0.72,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  comingSoonBadge: {
    borderRadius: 999,
    backgroundColor: tints.lavender.bg,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  comingSoonText: {
    fontSize: 8,
    fontWeight: "800",
    color: palette.violet,
    letterSpacing: 0.35,
  },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 2,
  },
  planPrice: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: palette.ink,
    letterSpacing: -0.25,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#D8D3E8",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  radioActive: {
    backgroundColor: palette.violet,
    borderColor: palette.violet,
  },
  features: {
    marginTop: 10,
    gap: 6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  featureText: {
    flex: 1,
    color: palette.inkSecondary,
    fontWeight: "600",
  },
  memberNote: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 4,
    backgroundColor: palette.page,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.cardBorder,
  },
});
