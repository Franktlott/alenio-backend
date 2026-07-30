import React from "react";
import { View, Text, Pressable } from "react-native";
import { BarChart3 } from "lucide-react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
} from "@/components/AlenioBottomSheet";
import type { TeamHealthHistoryPoint } from "@/lib/team-health-history";

export type TeamInsightsStatusKey = "open" | "dueToday" | "overdue";

type ComplianceMetric = {
  key: string;
  value: string;
  label: string;
  color: string;
};

type Props = {
  visible: boolean;
  title?: string;
  openCount: number;
  dueTodayCount: number;
  overdueCount: number;
  complianceMetrics: readonly ComplianceMetric[];
  teamHealthPct?: number | null;
  healthHistory?: TeamHealthHistoryPoint[];
  onClose: () => void;
  onSelectStatus?: (key: TeamInsightsStatusKey) => void;
};

function TeamHealthTrend({
  currentPct,
  history,
}: {
  currentPct: number;
  history: TeamHealthHistoryPoint[];
}) {
  const width = 300;
  const height = 60;
  const hasActualTrend = history.length >= 3;
  const values = history.slice(-14);
  const points = values.map((point, index) => ({
    x: values.length <= 1 ? width : (index / (values.length - 1)) * width,
    y: 3 + ((100 - Math.max(0, Math.min(100, point.teamHealthPct))) / 100) * (height - 6),
  }));
  const line = hasActualTrend
    ? points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" ")
    : "M0 45 C36 42 58 34 84 36 C116 39 132 27 160 28 C194 29 218 17 246 20 C270 22 286 12 300 10";
  const endpoint = hasActualTrend
    ? points[points.length - 1]
    : { x: width, y: 10 };

  return (
    <AlenioSheetCard compact>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>Team Health</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#10B981" }}>{currentPct}%</Text>
      </View>
      <View style={{ height, marginTop: 6 }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id="insightsHealthFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#34D399" stopOpacity="0.3" />
              <Stop offset="1" stopColor="#34D399" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Path d={`${line} L${width} ${height} L0 ${height} Z`} fill="url(#insightsHealthFill)" />
          <Path d={line} stroke="#10B981" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={endpoint.x} cy={endpoint.y} r={3} fill="#10B981" />
        </Svg>
      </View>
      <Text style={{ marginTop: 3, fontSize: 9, fontWeight: "600", color: "#94A3B8" }}>
        {hasActualTrend
          ? `${history.length}-day actual trend`
          : "Preview only · actual trend after 3 daily snapshots"}
      </Text>
    </AlenioSheetCard>
  );
}

function StatusCircle({
  value,
  label,
  color,
  ring,
  onPress,
  testID,
}: {
  value: number;
  label: string;
  color: string;
  ring: string;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: 2.5,
          borderColor: ring,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "800", color, lineHeight: 20 }}>{value}</Text>
      </View>
      <Text
        style={{
          marginTop: 5,
          fontSize: 11,
          fontWeight: "600",
          color: "#64748B",
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={{ flex: 1, alignItems: "center" }} testID={testID}>
        {content}
      </Pressable>
    );
  }

  return <View style={{ flex: 1, alignItems: "center" }}>{content}</View>;
}

export function TeamInsightsSheet({
  visible,
  title = "Team Insights",
  openCount,
  dueTodayCount,
  overdueCount,
  complianceMetrics,
  teamHealthPct,
  healthHistory = [],
  onClose,
  onSelectStatus,
}: Props) {
  return (
    <AlenioBottomSheet
      visible={visible}
      title={title}
      subtitle="Track progress, compliance, and performance"
      onClose={onClose}
      showCloseButton
      compact
      testID="team-insights-sheet"
    >
      {teamHealthPct != null ? (
        <TeamHealthTrend currentPct={teamHealthPct} history={healthHistory} />
      ) : null}

      <AlenioSheetCard tint="slate" compact>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <BarChart3 size={14} color="#4361EE" />
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A" }}>Today&apos;s Status</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
          <StatusCircle
            value={openCount}
            label="Open"
            color="#10B981"
            ring="#A7F3D0"
            onPress={openCount > 0 ? () => onSelectStatus?.("open") : undefined}
            testID="team-insights-open"
          />
          <StatusCircle
            value={dueTodayCount}
            label="Due Today"
            color="#F59E0B"
            ring="#FDE68A"
            onPress={dueTodayCount > 0 ? () => onSelectStatus?.("dueToday") : undefined}
            testID="team-insights-due-today"
          />
          <StatusCircle
            value={overdueCount}
            label="Overdue"
            color="#EF4444"
            ring="#FECACA"
            onPress={overdueCount > 0 ? () => onSelectStatus?.("overdue") : undefined}
            testID="team-insights-overdue"
          />
        </View>
      </AlenioSheetCard>

      <AlenioSheetCard compact>
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#0F172A", marginBottom: 8 }}>
          Performance
        </Text>
        {complianceMetrics.map((metric, index) => (
          <View
            key={metric.key}
            style={{
              marginTop: index === 0 ? 0 : 10,
              paddingTop: index === 0 ? 0 : 10,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: "#E2E8F0",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#334155", flex: 1, paddingRight: 8 }}>
                {metric.label}
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: metric.color }}>{metric.value}</Text>
            </View>
            <View
              style={{
                marginTop: 6,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#E2E8F0",
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: metric.value.includes("%")
                    ? `${Math.min(100, Math.max(0, parseInt(metric.value, 10) || 0))}%`
                    : "0%",
                  backgroundColor: metric.color === "#94A3B8" ? "#CBD5E1" : metric.color,
                  borderRadius: 2,
                }}
              />
            </View>
          </View>
        ))}
      </AlenioSheetCard>
    </AlenioBottomSheet>
  );
}
