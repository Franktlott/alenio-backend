import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { SNAPSHOT_ICONS } from "@/components/workspace/snapshot/snapshot-icons";
import {
  SNAPSHOT_TONE_COLORS,
  type SnapshotMetric,
} from "@/components/workspace/snapshot/snapshot-types";

const COUNT_UP_DURATION_MS = 450;

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function CountUpValue({
  value,
  suffix,
  reduceMotion,
}: {
  value: number;
  suffix: string;
  reduceMotion: boolean;
}) {
  const previousValue = useRef(value);
  const frame = useRef<number | null>(null);
  const [displayed, setDisplayed] = useState(value);

  useEffect(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    const from = previousValue.current;
    previousValue.current = value;

    if (reduceMotion || from === value) {
      setDisplayed(value);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / COUNT_UP_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + (value - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [reduceMotion, value]);

  return (
    <Text
      style={styles.value}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
    >
      {`${displayed}${suffix}`}
    </Text>
  );
}

function SecondaryLine({
  secondary,
  testID,
}: {
  secondary: NonNullable<SnapshotMetric["secondary"]>;
  testID: string;
}) {
  const text = (
    <Text
      style={[styles.secondary, { color: SNAPSHOT_TONE_COLORS[secondary.tone] }]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {secondary.text}
    </Text>
  );

  if (!secondary.onPress) return text;

  return (
    <Pressable
      onPress={secondary.onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={secondary.text}
      style={styles.secondaryPress}
      testID={testID}
    >
      {text}
    </Pressable>
  );
}

export function SnapshotMetricCard({
  metric,
  width,
  reduceMotion,
  loading = false,
}: {
  metric: SnapshotMetric;
  width: number;
  reduceMotion: boolean;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <View
        style={[styles.metric, styles.loadingMetric, { width }]}
        accessibilityLabel={`${metric.accessibilityLabel}: Loading`}
        testID={`workspace-snapshot-${metric.key}-loading`}
      >
        <View style={styles.loadingPrimary}>
          <View style={styles.loadingIcon} />
          <View style={styles.loadingValue} />
        </View>
        <View style={styles.loadingLabel} />
        <View style={styles.loadingSecondary} />
      </View>
    );
  }

  const muted = metric.comingSoon === true || metric.value === "—";
  const Icon = SNAPSHOT_ICONS[metric.icon];
  const accessibilityValue = metric.secondary
    ? `${metric.value}, ${metric.secondary.text}`
    : metric.value;

  const valueNode =
    metric.numericValue != null && !muted ? (
      <CountUpValue
        value={metric.numericValue}
        suffix={metric.valueSuffix ?? ""}
        reduceMotion={reduceMotion}
      />
    ) : (
      <Text
        style={[styles.value, muted && styles.valueMuted]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {metric.value}
      </Text>
    );

  const body = (
    <>
      <View style={styles.primaryRow}>
        <View style={styles.iconSlot}>
        <Icon
          size={14}
          color={muted ? "#CBD5E1" : metric.iconColor}
          strokeWidth={2.2}
        />
        </View>
        {valueNode}
      </View>
      <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
        {metric.label}
      </Text>
      {metric.secondary ? (
        <SecondaryLine
          secondary={metric.secondary}
          testID={`workspace-snapshot-${metric.key}-secondary`}
        />
      ) : null}
    </>
  );

  if (!metric.onPress) {
    return (
      <View
        style={[styles.metric, { width }]}
        accessibilityLabel={`${metric.accessibilityLabel}: ${accessibilityValue}`}
        testID={`workspace-snapshot-${metric.key}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={metric.onPress}
      style={({ pressed }) => [
        styles.metric,
        { width },
        pressed && styles.metricPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${metric.accessibilityLabel}: ${accessibilityValue}`}
      testID={`workspace-snapshot-${metric.key}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  metric: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  metricPressed: {
    opacity: 0.58,
  },
  loadingMetric: {
    minHeight: 42,
  },
  loadingPrimary: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  loadingIcon: {
    width: 13,
    height: 13,
    borderRadius: 4,
    backgroundColor: "#E8ECF3",
  },
  loadingValue: {
    width: 18,
    height: 14,
    borderRadius: 5,
    backgroundColor: "#E3E8F0",
  },
  loadingLabel: {
    width: "68%",
    height: 7,
    marginTop: 2,
    borderRadius: 4,
    backgroundColor: "#EDF0F5",
  },
  loadingSecondary: {
    width: "78%",
    height: 6,
    marginTop: 3,
    borderRadius: 3,
    backgroundColor: "#F1F3F7",
  },
  primaryRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  iconSlot: {
    width: 15,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  valueMuted: {
    color: "#94A3B8",
  },
  label: {
    alignSelf: "stretch",
    fontSize: 9,
    lineHeight: 10,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  secondaryPress: {
    alignSelf: "stretch",
  },
  secondary: {
    alignSelf: "stretch",
    marginTop: 1,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: "600",
    textAlign: "center",
  },
});
