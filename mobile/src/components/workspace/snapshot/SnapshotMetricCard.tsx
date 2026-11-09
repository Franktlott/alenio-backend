import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { AlertTriangle, CheckCircle2, CircleMinus } from "lucide-react-native";
import { SNAPSHOT_ICONS } from "@/components/workspace/snapshot/snapshot-icons";
import {
  SNAPSHOT_TONE_COLORS,
  type SnapshotMetric,
} from "@/components/workspace/snapshot/snapshot-types";

const COUNT_UP_DURATION_MS = 450;
const STATUS_ICONS = {
  neutral: CircleMinus,
  good: CheckCircle2,
  warn: AlertTriangle,
  bad: AlertTriangle,
  action: CheckCircle2,
} as const;

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
  style,
}: {
  value: number;
  suffix: string;
  reduceMotion: boolean;
  style?: TextStyle;
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
      const progress = Math.min(
        1,
        (Date.now() - startedAt) / COUNT_UP_DURATION_MS,
      );
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
      style={[styles.value, style]}
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
  tile,
}: {
  secondary: NonNullable<SnapshotMetric["secondary"]>;
  testID: string;
  tile?: boolean;
}) {
  const text = (
    <Text
      style={[
        styles.secondary,
        tile && styles.tileSecondary,
        { color: SNAPSHOT_TONE_COLORS[secondary.tone] },
      ]}
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
  reduceMotion,
  loading = false,
  variant = "compact",
}: {
  metric: SnapshotMetric;
  reduceMotion: boolean;
  loading?: boolean;
  variant?: "compact" | "tile";
}) {
  const tile = variant === "tile";
  /** The caller's cell sets the width; a card always fills what it is given. */
  const metricStyle = [styles.metric, tile ? styles.tileMetric : null];

  if (loading) {
    return (
      <View
        style={[metricStyle, styles.loadingMetric, tile && styles.tileLoading]}
        accessibilityLabel={`${metric.accessibilityLabel}: Loading`}
        testID={`workspace-snapshot-${metric.key}-loading`}
      >
        <View style={styles.loadingPrimary}>
          <View style={styles.loadingIcon} />
          <View style={styles.loadingValue} />
        </View>
        <View style={styles.loadingLabel} />
        {tile ? <View style={styles.loadingSecondary} /> : null}
      </View>
    );
  }

  const muted = metric.comingSoon === true || metric.value === "—";
  const Icon = SNAPSHOT_ICONS[metric.icon];
  const StatusIcon = metric.statusIndicator
    ? STATUS_ICONS[metric.statusIndicator]
    : null;
  const accessibilityValue = metric.secondary
    ? `${metric.value}, ${metric.secondary.text}`
    : metric.value;

  const valueNode =
    StatusIcon && metric.statusIndicator ? (
      <View style={[styles.statusValue, tile && styles.tileStatusValue]}>
        <StatusIcon
          size={tile ? 22 : 17}
          color={SNAPSHOT_TONE_COLORS[metric.statusIndicator]}
          strokeWidth={2.4}
        />
      </View>
    ) : metric.numericValue != null && !muted ? (
      <CountUpValue
        value={metric.numericValue}
        suffix={metric.valueSuffix ?? ""}
        reduceMotion={reduceMotion}
        style={tile ? styles.tileValue : undefined}
      />
    ) : (
      <Text
        style={[
          styles.value,
          tile && styles.tileValue,
          muted && styles.valueMuted,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {metric.value}
      </Text>
    );

  /**
   * Every cell carries its own hue in the same tinted slot, so colour reads as
   * the subject of the metric rather than as which half of the row it sits in.
   */
  const accent = muted ? "#CBD5E1" : metric.iconColor;

  const body = (
    <>
      <View style={[styles.primaryRow, tile && styles.tilePrimaryRow]}>
        {/**
         * The slot anchors the compact row, so it stays even for a metric that
         * asks to drop its icon — that flag only spares the roomier tile.
         */}
        {tile && metric.hidePrimaryIcon ? null : (
          <View
            style={[
              styles.iconSlot,
              tile ? styles.tileIconSlot : { backgroundColor: `${accent}14` },
            ]}
          >
            <Icon size={16} color={accent} strokeWidth={2.2} />
          </View>
        )}
        {metric.module ? null : valueNode}
      </View>
      <Text
        style={[styles.label, tile && styles.tileLabel]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {metric.label}
      </Text>
      {metric.secondary && tile ? (
        <SecondaryLine
          secondary={metric.secondary}
          tile={tile}
          testID={`workspace-snapshot-${metric.key}-secondary`}
        />
      ) : null}
    </>
  );

  if (!metric.onPress) {
    return (
      <View
        style={metricStyle}
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
      style={({ pressed }) => [metricStyle, pressed && styles.metricPressed]}
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
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  /** Matches the real slot so nothing shifts when the numbers land. */
  loadingIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
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
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  /** One slot for every cell, count or module, so the row sits on one line. */
  iconSlot: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 20,
    lineHeight: 23,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  statusValue: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  valueMuted: {
    color: "#94A3B8",
  },
  label: {
    alignSelf: "stretch",
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  secondaryPress: {
    alignSelf: "stretch",
  },
  secondary: {
    alignSelf: "stretch",
    marginTop: 2,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  tileMetric: {
    alignItems: "flex-start",
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "#F7F8FC",
  },
  tileLoading: {
    minHeight: 96,
  },
  tilePrimaryRow: {
    minHeight: 28,
    justifyContent: "flex-start",
    gap: 8,
  },
  tileIconSlot: {
    width: 20,
    height: 20,
  },
  tileValue: {
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    textAlign: "left",
  },
  tileStatusValue: {
    width: 28,
    height: 28,
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 15,
    color: "#5B6578",
    textAlign: "left",
  },
  tileSecondary: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    textAlign: "left",
  },
});
