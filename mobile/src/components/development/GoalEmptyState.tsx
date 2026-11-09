import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Plus, Target } from "lucide-react-native";
import {
  DevelopmentEmptyMark,
  DevelopmentEmptyState,
} from "@/components/development/DevelopmentEmptyState";
import { colors } from "@/theme";

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

  return (
    <View style={styles.wrap} testID="growth-empty-state">
      <DevelopmentEmptyMark icon={Target} label="No goals yet" />

      <View style={styles.copy}>
        <Text style={styles.title}>No goals yet</Text>
        <Text style={styles.subhead}>
          {canCreate
            ? isSelf
              ? "Pick a skill to build."
              : `Pick a skill to build with ${firstName}.`
            : isSelf
              ? "Your goals will appear here once a leader adds one."
              : `Goals for ${firstName} will appear here once a leader adds one.`}
        </Text>
      </View>

      {canCreate && onCreate ? (
        <Pressable
          onPress={onCreate}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Add a goal"
          testID="growth-empty-state-create"
        >
          <Plus size={13} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaText}>Add a goal</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingVertical: 10, gap: 12, alignItems: "center" },
  copy: { alignItems: "center", gap: 3 },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  subhead: {
    maxWidth: 280,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#1F2739",
    textAlign: "center",
  },
  /** Matches the workspace "+ New" pill so buttons read the same app-wide. */
  cta: {
    alignSelf: "center",
    height: 32,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  ctaText: { fontSize: 12.5, lineHeight: 15, fontWeight: "700", color: "#FFFFFF" },
});
