import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Plus, Target } from "lucide-react-native";
import { DevelopmentEmptyState } from "@/components/development/DevelopmentEmptyState";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";
import { colors } from "@/theme";

const GOALS_EMPTY_ART = require("@/assets/growth-empty-goals.png");

export function GoalEmptyState({
  memberName,
  isSelf = false,
  canCreate,
  hasAnyGoals,
  error,
  onCreate,
}: {
  memberName: string;
  /** The signed-in person is the member this plan belongs to. */
  isSelf?: boolean;
  canCreate: boolean;
  /** True when goals exist but none are active, which is not a blank plan. */
  hasAnyGoals: boolean;
  error?: string | null;
  onCreate?: () => void;
}) {
  const firstName =
    memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  if (error) {
    return (
      <DevelopmentEmptyState
        icon={Target}
        title="Could not load goals"
        body={error}
        testID="growth-empty-state-error"
      />
    );
  }

  // A plan with goals in it is not a blank slate, so it keeps the small state
  // and points at the sections further down instead of selling the feature.
  if (hasAnyGoals) {
    return (
      <DevelopmentEmptyState
        icon={Target}
        title="No active goals"
        body={
          canCreate
            ? isSelf
              ? "Add a new goal, or reopen one from the sections below."
              : `Add a new goal for ${firstName}, or reopen one from the sections below.`
            : isSelf
              ? "New goals will appear here once a leader adds one."
              : `New goals for ${firstName} will appear here once a leader adds one.`
        }
        testID="growth-empty-state"
      />
    );
  }

  if (!canCreate) {
    return (
      <DevelopmentEmptyState
        icon={Target}
        title="No goals yet"
        body={
          isSelf
            ? "Your goals will appear here once a leader adds one."
            : `Goals for ${firstName} will appear here once a leader adds one.`
        }
        testID="growth-empty-state"
      />
    );
  }

  return (
    <View style={styles.wrap} testID="growth-empty-state">
      <View style={styles.heroCard}>
        <Image
          source={GOALS_EMPTY_ART}
          style={styles.heroArt}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <View style={styles.copy}>
          <Text style={styles.heroTitle}>Turn potential into progress.</Text>
          <Text style={styles.heroBody}>
            Set meaningful development goals, build new skills and track your
            growth.
          </Text>
        </View>

        {onCreate ? (
          <Pressable
            onPress={onCreate}
            style={styles.cta}
            accessibilityRole="button"
            accessibilityLabel="Add a goal"
            testID="growth-empty-state-create"
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.7} />
            <Text style={styles.ctaText}>Add a goal</Text>
          </Pressable>
        ) : null}

        <View style={styles.senecaRow}>
          <SenecaIcon size={28} />
          <Text style={styles.senecaLabel}>
            Powered by <Text style={styles.senecaBrand}>Seneca</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  heroCard: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 16,
    backgroundColor: "#F3F0FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DEFF",
    alignItems: "center",
    gap: 14,
  },
  heroArt: {
    width: 198,
    height: 198,
    marginBottom: 2,
    backgroundColor: "transparent",
  },
  copy: {
    alignItems: "center",
    gap: 6,
    maxWidth: 300,
  },
  heroTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#17142B",
    textAlign: "center",
  },
  heroBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6B7388",
    textAlign: "center",
  },
  cta: {
    alignSelf: "stretch",
    minHeight: 48,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.brand,
  },
  ctaText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  senecaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  senecaLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    color: "#667085",
  },
  senecaBrand: {
    fontWeight: "800",
    color: "#17142B",
  },
});
