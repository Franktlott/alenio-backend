import React from "react";
import { View, Text, Pressable } from "react-native";
import { BarChart3 } from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { SenecaIcon } from "@/components/seneca/SenecaIcon";

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
  onClose: () => void;
  onSelectStatus?: (key: TeamInsightsStatusKey) => void;
  onViewReport?: () => void;
  onAskSeneca?: () => void;
};

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
  onClose,
  onSelectStatus,
  onViewReport,
  onAskSeneca,
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
      footer={
        <View style={{ gap: 8 }}>
          {onAskSeneca ? (
            <Pressable
              onPress={onAskSeneca}
              style={[
                alenioSheetStyles.primaryButton,
                {
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  minHeight: 42,
                  paddingVertical: 11,
                  borderRadius: 12,
                  flexDirection: "row",
                  gap: 8,
                },
              ]}
              testID="team-insights-ask-seneca"
            >
              <SenecaIcon size={18} />
              <Text style={[alenioSheetStyles.primaryButtonText, { color: "#0F172A", fontSize: 14 }]}>
                Ask Seneca
              </Text>
            </Pressable>
          ) : null}
          {onViewReport ? (
            <Pressable
              onPress={onViewReport}
              style={[
                alenioSheetStyles.primaryButton,
                { backgroundColor: "#EEF2FF", minHeight: 42, paddingVertical: 11, borderRadius: 12 },
              ]}
              testID="team-insights-view-report"
            >
              <Text style={[alenioSheetStyles.primaryButtonText, { color: "#4338CA", fontSize: 14 }]}>
                View Detailed Report
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
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
