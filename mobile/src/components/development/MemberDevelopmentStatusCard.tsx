import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  CalendarCheck,
  CalendarClock,
  ChartColumn,
  Target,
} from "lucide-react-native";
import { DevelopmentPeakArt } from "@/components/development/DevelopmentPeakArt";
import type {
  GuidanceCheckInSummary,
  MemberDevelopmentSummary,
  NextCheckInSummary,
} from "@/lib/member-development-summary";
import type { DevelopmentPlanSummary } from "@/lib/development-goal-progress";

const LEVEL_TINT: Record<
  MemberDevelopmentSummary["level"],
  { dot: string; label: string; bg: string }
> = {
  on_track: { dot: "#12B76A", label: "#0B8A50", bg: "rgba(18,183,106,0.12)" },
  needs_attention: {
    dot: "#F59E0B",
    label: "#B4740A",
    bg: "rgba(245,158,11,0.14)",
  },
  getting_started: {
    dot: "#8B96A8",
    label: "#5F6B7C",
    bg: "rgba(139,150,168,0.14)",
  },
};

/**
 * The member's development headline and their plan numbers in one card, so the
 * status and the figures behind it read as a single statement.
 */
export function MemberDevelopmentStatusCard({
  summary,
  plan,
  guidanceCheckIns,
  nextCheckIn,
}: {
  summary: MemberDevelopmentSummary;
  plan: DevelopmentPlanSummary;
  guidanceCheckIns?: GuidanceCheckInSummary | null;
  nextCheckIn?: NextCheckInSummary | null;
}) {
  const tint = LEVEL_TINT[summary.level];
  const stats = [
    {
      key: "active",
      icon: Target,
      color: "#6D4AFF",
      bg: "#F1EDFF",
      value: String(plan.activeCount),
      label: plan.activeCount === 1 ? "Active goal" : "Active goals",
    },
    ...(guidanceCheckIns
      ? [
          {
            key: "check-ins",
            icon: CalendarCheck,
            color: guidanceCheckIns.behind ? "#D9820B" : "#0F9D6E",
            bg: guidanceCheckIns.behind ? "#FEF3E2" : "#E7F8F1",
            value: String(guidanceCheckIns.count),
            label: guidanceCheckIns.required
              ? `Check-ins · ${guidanceCheckIns.windowLabel}`
              : "Check-ins",
          },
        ]
      : []),
    {
      key: "overall",
      icon: ChartColumn,
      color: "#3B6FF5",
      bg: "#EAF1FE",
      value: `${plan.overallPercent}%`,
      label: "Overall progress",
    },
  ];

  return (
    <View style={styles.card} testID="member-development-status-card">
      <LinearGradient
        colors={["#F4F1FF", "#F9F7FF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.art} pointerEvents="none">
          <DevelopmentPeakArt width={104} height={45} opacity={0.85} />
        </View>
        <View style={styles.headRow}>
          <Text style={styles.eyebrow}>Development</Text>
          <View style={[styles.badge, { backgroundColor: tint.bg }]}>
            <View style={[styles.badgeDot, { backgroundColor: tint.dot }]} />
            <Text
              style={[styles.badgeLabel, { color: tint.label }]}
              numberOfLines={1}
            >
              {summary.label}
            </Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.headline} numberOfLines={1}>
            {summary.label}
          </Text>
          <Text style={styles.detailSeparator}>·</Text>
          <Text style={styles.detail} numberOfLines={1}>
            {summary.checkInDetail}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <React.Fragment key={stat.key}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.cell}>
                <View style={styles.cellHead}>
                  <View style={[styles.statIcon, { backgroundColor: stat.bg }]}>
                    <Icon size={13} color={stat.color} strokeWidth={2.3} />
                  </View>
                  <Text style={styles.value} numberOfLines={1}>
                    {stat.value}
                  </Text>
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {stat.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {nextCheckIn ? (
        <View style={styles.checkInRow} testID="member-development-next-check-in">
          <CalendarClock
            size={13}
            color={nextCheckIn.scheduled ? "#3B6FF5" : "#93A0B4"}
            strokeWidth={2.2}
          />
          <Text
            style={[
              styles.checkInLabel,
              nextCheckIn.scheduled ? null : styles.checkInLabelMuted,
            ]}
            numberOfLines={1}
          >
            {nextCheckIn.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#E9E4FB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  hero: { paddingHorizontal: 13, paddingTop: 8, paddingBottom: 7 },
  art: { position: "absolute", right: -8, bottom: -2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: {
    flexShrink: 1,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#6D4AFF",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    height: 18,
    borderRadius: 9,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: -0.1,
  },
  /** Keeps the art on the right clear of the summary text. */
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 2,
    paddingRight: 74,
  },
  headline: {
    flexShrink: 0,
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  detailSeparator: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    color: "#B6BFCE",
  },
  detail: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 15,
    color: "#6B7688",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EAE5FA",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    backgroundColor: "#EDF0F6",
  },
  cell: { flex: 1, minWidth: 0 },
  cellHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  statIcon: {
    width: 21,
    height: 21,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#0F172A",
  },
  label: {
    marginTop: 1,
    fontSize: 9.5,
    lineHeight: 11.5,
    fontWeight: "700",
    color: "#66748C",
  },
  checkInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 27,
    paddingHorizontal: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDF0F6",
    backgroundColor: "#FBFCFF",
  },
  checkInLabel: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: "#39465C",
  },
  checkInLabelMuted: { fontWeight: "600", color: "#8794A8" },
});
