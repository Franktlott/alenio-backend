import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Muted, PrimaryButton, Screen } from "../../../components/ui";
import { useSession } from "../../../lib/session-context";
import {
  completeRun,
  flattenRunItems,
  startCheckRun,
  submitTemperature,
} from "../../../lib/temps-api";
import type { TemperatureConfig, WalkRun, WalkRunItem } from "../../../lib/types";
import { colors } from "../../../lib/theme";

function criteriaLabel(config: TemperatureConfig): string {
  const unit = config.unit ?? "F";
  if (config.comparisonType === "BETWEEN") {
    return `${config.minimumTemperature ?? "?"}–${config.maximumTemperature ?? "?"}°${unit}`;
  }
  if (config.comparisonType === "ABOVE") {
    return `Above ${config.minimumTemperature ?? "?"}°${unit}`;
  }
  if (config.comparisonType === "BELOW") {
    return `Below ${config.maximumTemperature ?? "?"}°${unit}`;
  }
  return `°${unit}`;
}

export default function TakeCheckScreen() {
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  const { teamId } = useSession();
  const [run, setRun] = useState<WalkRun | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [digits, setDigits] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamId || !occurrenceId) return;
      try {
        const started = await startCheckRun(teamId, occurrenceId);
        if (!cancelled) setRun(started);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start check");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, occurrenceId]);

  const items = useMemo(() => (run ? flattenRunItems(run) : []), [run]);
  const current = items[itemIndex] as WalkRunItem | undefined;
  const config = (current?.config ?? {}) as TemperatureConfig;
  const unit = config.unit ?? "F";

  function pushDigit(d: string) {
    setDigits((prev) => {
      if (d === "." && prev.includes(".")) return prev;
      if (prev.length >= 6) return prev;
      return prev + d;
    });
  }

  async function submitCurrent() {
    if (!teamId || !run || !current) return;
    const value = Number(digits);
    if (!Number.isFinite(value)) {
      Alert.alert("Enter a temperature");
      return;
    }
    setSaving(true);
    try {
      let next = await submitTemperature(teamId, run.id, current.id, value, unit);
      const remaining = flattenRunItems(next).filter(
        (i) => i.type === "TEMPERATURE" && (!i.response || i.response.status === "NOT_STARTED"),
      );
      if (remaining.length === 0 && next.progress.requiredRemaining === 0) {
        next = await completeRun(teamId, next.id);
        setRun(next);
        Alert.alert("Check complete", "Results are available in Alenio Go.", [
          { text: "Done", onPress: () => router.back() },
        ]);
        return;
      }
      setRun(next);
      setDigits("");
      const nextIdx = items.findIndex(
        (i, idx) => idx > itemIndex && i.type === "TEMPERATURE" && !i.response,
      );
      setItemIndex(nextIdx >= 0 ? nextIdx : Math.min(itemIndex + 1, items.length - 1));
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen style={{ justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.brand} />
        <Muted>Starting check…</Muted>
      </Screen>
    );
  }

  if (error || !run || !current) {
    return (
      <Screen>
        <Text style={{ color: colors.fail, fontWeight: "600" }}>{error ?? "No items in this check."}</Text>
        <PrimaryButton label="Back" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingHorizontal: 0 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Text style={styles.kicker}>{run.template.name}</Text>
        <Text style={styles.itemTitle}>{current.title}</Text>
        {current.instructions ? <Muted>{current.instructions}</Muted> : null}
        <Text style={styles.criteria}>Pass: {criteriaLabel(config)}</Text>

        <View style={styles.display}>
          <Text style={styles.displayValue}>{digits || "—"}</Text>
          <Text style={styles.displayUnit}>°{unit}</Text>
        </View>

        <View style={styles.pad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
            <Pressable
              key={key}
              style={({ pressed }) => [styles.key, pressed && { opacity: 0.7 }]}
              onPress={() => {
                if (key === "⌫") setDigits((p) => p.slice(0, -1));
                else pushDigit(key);
              }}
            >
              <Text style={styles.keyText}>{key}</Text>
            </Pressable>
          ))}
        </View>

        <PrimaryButton
          label={saving ? "Saving…" : "Submit temperature"}
          onPress={() => void submitCurrent()}
          loading={saving}
          disabled={!digits}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandDark,
    marginBottom: 6,
  },
  itemTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  criteria: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "600",
    color: colors.muted,
  },
  display: {
    marginTop: 28,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  displayValue: {
    fontSize: 64,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  displayUnit: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 10,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  key: {
    width: "30%",
    aspectRatio: 1.4,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyText: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.ink,
  },
});
