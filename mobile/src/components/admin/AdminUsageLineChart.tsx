import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Line, Path, Polyline, Text as SvgText } from "react-native-svg";
import { ChevronDown, Check } from "lucide-react-native";
import type { AdminUsageMetricKey, AdminWeeklyUsage } from "@/lib/admin/admin-api";

type Props = {
  data?: AdminWeeklyUsage | null;
  loading?: boolean;
  testID?: string;
};

const FALLBACK_METRICS: { key: AdminUsageMetricKey; label: string }[] = [
  { key: "users", label: "New users" },
  { key: "workspaces", label: "New workspaces" },
  { key: "checkIns", label: "Check-ins" },
  { key: "messages", label: "Messages" },
  { key: "tasks", label: "Tasks created" },
];

export function AdminUsageLineChart({ data, loading, testID = "admin-usage-chart" }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const metrics = data?.metrics?.length ? data.metrics : FALLBACK_METRICS;
  const [metric, setMetric] = useState<AdminUsageMetricKey>("users");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedMeta = metrics.find((m) => m.key === metric) ?? metrics[0]!;
  const weeks = data?.weeks ?? [];

  const values = useMemo(
    () => weeks.map((w) => Number(w[metric] ?? 0)),
    [weeks, metric],
  );

  const thisWeekValue = values.length ? values[values.length - 1]! : 0;
  const chartW = Math.max(280, windowWidth - 48);
  const chartH = 188;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const maxY = Math.max(4, ...values);
  const yTicks = useMemo(() => {
    const step = maxY <= 8 ? 2 : maxY <= 20 ? 5 : Math.ceil(maxY / 4);
    const ticks: number[] = [];
    for (let v = 0; v <= maxY; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== maxY) ticks.push(maxY);
    return ticks;
  }, [maxY]);

  const toX = (i: number) =>
    values.length > 1 ? padL + (i / (values.length - 1)) * plotW : padL + plotW / 2;
  const toY = (v: number) => padT + plotH - (v / maxY) * plotH;

  const points = values.map((v, i) => ({ x: toX(i), y: toY(v), v }));
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const fillPath =
    points.length > 1
      ? `M ${points[0]!.x},${toY(0)} ` +
        points.map((p) => `L ${p.x},${p.y}`).join(" ") +
        ` L ${points[points.length - 1]!.x},${toY(0)} Z`
      : "";

  return (
    <View style={{ marginBottom: 16 }} testID={testID}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#94A3B8",
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        Usage by week
      </Text>

      <View
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          overflow: "hidden",
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 14,
            marginBottom: 8,
            gap: 10,
          }}
        >
          <Pressable
            onPress={() => setPickerOpen(true)}
            testID="admin-usage-metric-dropdown"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: pressed ? "#F1F5F9" : "#F8FAFC",
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              flexShrink: 1,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
              {selectedMeta.label}
            </Text>
            <ChevronDown size={16} color="#64748B" />
          </Pressable>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600" }}>This week</Text>
            {loading ? (
              <ActivityIndicator size="small" color="#4361EE" style={{ marginTop: 4 }} />
            ) : (
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "800",
                  color: "#4361EE",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {thisWeekValue.toLocaleString()}
              </Text>
            )}
          </View>
        </View>

        {loading && !weeks.length ? (
          <View style={{ height: chartH, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : (
          <Svg width={chartW} height={chartH} style={{ alignSelf: "center" }}>
            {yTicks.map((tick) => {
              const cy = toY(tick);
              return (
                <React.Fragment key={tick}>
                  <Line
                    x1={padL}
                    y1={cy}
                    x2={chartW - padR}
                    y2={cy}
                    stroke="#E2E8F0"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <SvgText
                    x={padL - 6}
                    y={cy + 3}
                    fontSize={10}
                    fill="#94A3B8"
                    textAnchor="end"
                  >
                    {tick}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {fillPath ? <Path d={fillPath} fill="#4361EE" fillOpacity={0.08} /> : null}

            {points.length > 1 ? (
              <Polyline
                points={polyline}
                fill="none"
                stroke="#4361EE"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}

            {points.map((p, i) => (
              <Circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i === points.length - 1 ? 5 : 3.5}
                fill={i === points.length - 1 ? "#4361EE" : "#FFFFFF"}
                stroke="#4361EE"
                strokeWidth={2}
              />
            ))}

            {weeks.map((w, i) => (
              <SvgText
                key={w.weekStart}
                x={toX(i)}
                y={chartH - 8}
                fontSize={9}
                fill="#94A3B8"
                textAnchor="middle"
              >
                {w.label}
              </SvgText>
            ))}
          </Svg>
        )}

        <Text
          style={{
            fontSize: 11,
            color: "#94A3B8",
            textAlign: "center",
            paddingHorizontal: 16,
            paddingBottom: 6,
            marginTop: 2,
          }}
        >
          Each point is one week (Mon–Sun)
        </Text>
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 10,
              paddingBottom: 28,
              paddingHorizontal: 8,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#E2E8F0",
                alignSelf: "center",
                marginBottom: 14,
              }}
            />
            <Text
              style={{
                fontSize: 16,
                fontWeight: "800",
                color: "#0F172A",
                paddingHorizontal: 12,
                marginBottom: 8,
              }}
            >
              How Alenio is being used
            </Text>
            {metrics.map((m) => {
              const selected = m.key === metric;
              return (
                <Pressable
                  key={m.key}
                  testID={`admin-usage-metric-${m.key}`}
                  onPress={() => {
                    setMetric(m.key);
                    setPickerOpen(false);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    borderRadius: 12,
                    backgroundColor: selected ? "#EEF2FF" : pressed ? "#F8FAFC" : "transparent",
                    marginHorizontal: 4,
                  })}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: selected ? "700" : "500",
                      color: selected ? "#4338CA" : "#0F172A",
                    }}
                  >
                    {m.label}
                  </Text>
                  {selected ? <Check size={18} color="#4338CA" strokeWidth={2.5} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
