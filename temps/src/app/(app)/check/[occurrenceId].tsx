import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckProbeBar } from "../../../components/check/CheckProbeBar";
import { FailureProcedurePanel } from "../../../components/check/FailureProcedurePanel";
import { useSession } from "../../../lib/session-context";
import {
  completeCorrectiveAction,
  completeRun,
  flattenRunItems,
  isOpenTempItem,
  itemNeedsProcedure,
  resetItemCheck,
  startCheckRun,
  submitTemperature,
} from "../../../lib/temps-api";
import type { TemperatureConfig, WalkRun, WalkRunItem } from "../../../lib/types";
import { colors } from "../../../lib/theme";
import { ProbeProvider } from "../../../probe/react";

function requiredParts(config: TemperatureConfig): { value: string; hint: string } {
  const unit = config.unit ?? "F";
  if (config.comparisonType === "BETWEEN") {
    return {
      value: `${config.minimumTemperature ?? "?"}–${config.maximumTemperature ?? "?"}°${unit}`,
      hint: "in range",
    };
  }
  if (config.comparisonType === "BELOW") {
    return {
      value: `${config.maximumTemperature ?? "?"}°${unit}`,
      hint: "or below",
    };
  }
  return {
    value: `${config.minimumTemperature ?? "?"}°${unit}`,
    hint: "or above",
  };
}

function evaluateTemp(
  value: number,
  config: TemperatureConfig,
): { pass: boolean; detail: string } | null {
  if (!Number.isFinite(value)) return null;
  const unit = config.unit ?? "F";
  const min = Number(config.minimumTemperature);
  const max = Number(config.maximumTemperature);
  if (config.comparisonType === "BETWEEN") {
    const ok = value >= min && value <= max;
    return {
      pass: ok,
      detail: ok ? `Within ${min}–${max}°${unit}` : `Outside ${min}–${max}°${unit}`,
    };
  }
  if (config.comparisonType === "BELOW") {
    const ok = value <= max;
    return {
      pass: ok,
      detail: ok ? `At or below ${max}°${unit}` : `Above required ${max}°${unit}`,
    };
  }
  const threshold = Number.isFinite(min) ? min : max;
  const ok = value >= threshold;
  return {
    pass: ok,
    detail: ok ? `Above required ${threshold}°${unit}` : `Below required ${threshold}°${unit}`,
  };
}

function IconClock() {
  return (
    <View style={styles.iconClockOuter}>
      <View style={styles.iconClockFace}>
        <View style={styles.iconClockHand} />
      </View>
    </View>
  );
}

function IconPot() {
  return (
    <View style={styles.iconPotWrap}>
      <Text style={styles.iconPotGlyph}>♨</Text>
    </View>
  );
}

function IconBackspace() {
  return <Text style={styles.keyText}>⌫</Text>;
}

function IconShield() {
  return <Text style={styles.saveIcon}>🛡</Text>;
}

function runAllowsBluetoothProbe(run: WalkRun): boolean {
  return flattenRunItems(run).some(
    (item) =>
      item.type === "TEMPERATURE" &&
      (item.config as TemperatureConfig | undefined)?.allowBluetoothProbe === true,
  );
}

function MaybeProbeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <ProbeProvider initialSource="thermoworks">{children}</ProbeProvider>;
}

export default function TakeCheckScreen() {
  const { occurrenceId } = useLocalSearchParams<{ occurrenceId: string }>();
  const { teamId } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [run, setRun] = useState<WalkRun | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [digits, setDigits] = useState("");
  /** When probe is allowed, false = live probe drives digits; true = keypad. */
  const [manualMode, setManualMode] = useState(false);
  /** How the current digits were last written — sent as response.source on save. */
  const [entrySource, setEntrySource] = useState<"manual" | "bluetooth">("manual");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Take check",
      headerBackTitle: "Back",
      headerStyle: { backgroundColor: colors.surface },
      headerShadowVisible: false,
      headerTintColor: colors.brand,
      headerTitleStyle: { color: colors.ink, fontWeight: "700", fontSize: 17 },
    });
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamId || !occurrenceId) return;
      try {
        const started = await startCheckRun(teamId, occurrenceId);
        if (cancelled) return;
        setRun(started);
        const flat = flattenRunItems(started);
        const firstOpen = flat.findIndex((i) => isOpenTempItem(i));
        setItemIndex(firstOpen >= 0 ? firstOpen : 0);
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
  const tempItems = useMemo(() => items.filter((i) => i.type === "TEMPERATURE"), [items]);
  const current = items[itemIndex] as WalkRunItem | undefined;
  const config = (current?.config ?? {}) as TemperatureConfig;
  const unit = config.unit ?? "F";
  const required = requiredParts(config);
  const value = digits === "" || digits === "." ? NaN : Number(digits);
  const verdict = evaluateTemp(value, config);
  const answered = run?.progress.answered ?? 0;
  const total = Math.max(run?.progress.total ?? tempItems.length, 1);
  const progressPct = Math.round((answered / total) * 100);
  const itemOrdinal =
    current && current.type === "TEMPERATURE"
      ? tempItems.findIndex((i) => i.id === current.id) + 1
      : itemIndex + 1;
  const itemCount = tempItems.length || items.length;
  const probeEnabledForRun = run ? runAllowsBluetoothProbe(run) : false;

  useEffect(() => {
    // Prefer live probe for each new item; associate can switch to keypad again.
    setManualMode(false);
    setEntrySource("manual");
  }, [current?.id]);

  const onLiveDigits = useCallback((next: string) => {
    setDigits(next);
    setEntrySource("bluetooth");
  }, []);

  function pushDigit(d: string) {
    setEntrySource("manual");
    setDigits((prev) => {
      if (d === "." && prev.includes(".")) return prev;
      if (prev.length >= 6) return prev;
      if (prev === "0" && d !== ".") return d;
      return prev + d;
    });
  }

  function clearLastDigit() {
    setEntrySource("manual");
    setDigits((p) => p.slice(0, -1));
  }

  async function advanceAfterSave(next: WalkRun, currentItemId: string) {
    const flat = flattenRunItems(next);
    const saved = flat.find((i) => i.id === currentItemId);
    if (saved && itemNeedsProcedure(saved)) {
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      const idx = flat.findIndex((i) => i.id === currentItemId);
      if (idx >= 0) setItemIndex(idx);
      return;
    }

    const remaining = flat.filter((i) => isOpenTempItem(i));
    if (remaining.length === 0 && next.progress.requiredRemaining === 0) {
      const completed = await completeRun(teamId!, next.id);
      setRun(completed);
      Alert.alert("Check complete", "Results are available in Alenio Go.", [
        { text: "Done", onPress: () => router.back() },
      ]);
      return;
    }

    setRun(next);
    setDigits("");
    setEntrySource("manual");
    const nextIdx = flat.findIndex((i) => isOpenTempItem(i));
    setItemIndex(nextIdx >= 0 ? nextIdx : Math.min(itemIndex + 1, flat.length - 1));
  }

  async function submitCurrent(options?: {
    fromProbeButton?: boolean;
    /** Digits from probe button path (avoids stale React state). */
    digitsOverride?: string;
    retestCount?: number;
  }) {
    if (!teamId || !run || !current) return;
    if (saving) return;
    const digitsToSave = options?.digitsOverride ?? digits;
    const valueToSave =
      digitsToSave === "" || digitsToSave === "." ? NaN : Number(digitsToSave);
    const sourceToSave = options?.digitsOverride ? "bluetooth" : entrySource;
    if (!Number.isFinite(valueToSave)) {
      if (!options?.fromProbeButton) {
        Alert.alert("Enter a temperature");
      }
      return;
    }
    if (options?.digitsOverride) {
      setDigits(options.digitsOverride);
      setEntrySource("bluetooth");
    }
    setSaving(true);
    try {
      const next = await submitTemperature(
        teamId,
        run.id,
        current.id,
        valueToSave,
        unit,
        sourceToSave,
        options?.retestCount ?? 0,
      );
      await advanceAfterSave(next, current.id);
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function markCorrectiveComplete(actionId: string) {
    if (!teamId || !run || !current) return;
    if (saving) return;
    setSaving(true);
    try {
      const next = await completeCorrectiveAction(teamId, run.id, current.id, actionId);
      await advanceAfterSave(next, current.id);
    } catch (err) {
      Alert.alert(
        "Could not complete step",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmRestartItem() {
    if (!teamId || !run || !current) return;
    Alert.alert(
      "Restart this item?",
      "Clears the saved reading and failure procedure so you can start over.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restart",
          style: "destructive",
          onPress: () => void restartItem(),
        },
      ],
    );
  }

  async function restartItem() {
    if (!teamId || !run || !current) return;
    if (saving) return;
    setSaving(true);
    try {
      const next = await resetItemCheck(teamId, run.id, current.id);
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      setManualMode(false);
      const flat = flattenRunItems(next);
      const idx = flat.findIndex((i) => i.id === current.id);
      if (idx >= 0) setItemIndex(idx);
    } catch (err) {
      Alert.alert("Could not restart", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Starting check…</Text>
      </View>
    );
  }

  if (error || !run || !current) {
    return (
      <View style={[styles.screen, { padding: 20 }]}>
        <Text style={styles.errorText}>{error ?? "No items in this check."}</Text>
        <Pressable style={styles.saveBtn} onPress={() => router.back()}>
          <Text style={styles.saveBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const allowManual = config.allowManualEntry !== false;
  const allowProbe = config.allowBluetoothProbe === true;
  const showKeypad = allowManual && (!allowProbe || manualMode);
  const corrective = current.response?.correctiveActions ?? [];
  const firstFailure = corrective.filter(
    (a) => a.branch === "first_failure" || a.branch == null,
  );
  const secondFailure = corrective.filter((a) => a.branch === "if_fail");
  const firstFailureDone =
    firstFailure.length === 0 ||
    firstFailure.every((a) => a.status === "COMPLETED" || a.status === "SKIPPED");
  const requireRetest = Boolean(config.requireRetestOnFailure);
  const retestGuidance =
    typeof config.retestGuidance === "string" ? config.retestGuidance.trim() : "";
  const responsePayload =
    current.response?.response && typeof current.response.response === "object"
      ? (current.response.response as Record<string, unknown>)
      : null;
  const retestCount =
    typeof responsePayload?.retestCount === "number" ? responsePayload.retestCount : 0;
  const retempDone = !requireRetest || retestCount >= 1;
  const retempFailed =
    retempDone &&
    (current.response?.status === "NEEDS_ACTION" || current.response?.failed === true) &&
    secondFailure.some((a) => a.status === "PENDING" || a.status === "COMPLETED");
  const inProcedure = itemNeedsProcedure(current);
  const showRetemp =
    inProcedure &&
    Boolean(requireRetest) &&
    firstFailureDone &&
    current.response?.status === "NEEDS_ACTION" &&
    !retempDone;
  const showSecondFailure =
    firstFailureDone &&
    retempDone &&
    (retempFailed ||
      secondFailure.some((a) => a.status === "PENDING" || a.status === "COMPLETED"));
  const showFirstFailurePhase =
    inProcedure && firstFailure.length > 0 && !firstFailureDone;
  const showSecondFailurePhase = inProcedure && showSecondFailure;
  const showCapture = !inProcedure || showRetemp;
  const canRestart =
    Boolean(current.response) && current.response?.status !== "NOT_STARTED";

  return (
    <MaybeProbeProvider enabled={probeEnabledForRun}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressCard}>
            <IconClock />
            <View style={styles.progressCopy}>
              <Text style={styles.progressKicker} numberOfLines={1}>
                {run.template.name.toUpperCase()}
              </Text>
              <Text style={styles.progressTitle}>
                Item {itemOrdinal} of {itemCount}
              </Text>
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, progressPct)}%` }]} />
                </View>
                <Text style={styles.progressPct}>{progressPct}%</Text>
              </View>
            </View>
          </View>

          <View style={styles.itemCard}>
            <IconPot />
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {current.title}
              </Text>
              <Text style={styles.itemSub} numberOfLines={2}>
                {current.description?.trim() || current.instructions?.trim() || "Temperature check"}
              </Text>
            </View>
            <View style={styles.requiredCol}>
              <Text style={styles.requiredLabel}>REQUIRED</Text>
              <Text style={styles.requiredValue}>{required.value}</Text>
              <Text style={styles.requiredHint}>{required.hint}</Text>
            </View>
            <Pressable
              style={styles.infoBtn}
              onPress={() =>
                Alert.alert(
                  current.title,
                  [current.instructions, current.description].filter(Boolean).join("\n\n") ||
                    criteriaDetail(config),
                )
              }
              hitSlop={8}
            >
              <Text style={styles.infoBtnText}>i</Text>
            </Pressable>
          </View>

          {inProcedure ? (
            <View style={styles.procedureBanner}>
              <Text style={styles.procedureBannerTitle}>Failure procedure</Text>
              <Text style={styles.procedureBannerBody}>
                Complete one step at a time, in order, before continuing.
              </Text>
            </View>
          ) : null}

          {showFirstFailurePhase ? (
            <FailureProcedurePanel
              title="1st Failure"
              actions={firstFailure}
              unlocked
              busy={saving}
              onComplete={(actionId) => void markCorrectiveComplete(actionId)}
            />
          ) : null}

          {showRetemp ? (
            <View style={styles.retempCard}>
              <Text style={styles.retempTitle}>Retemp required</Text>
              <Text style={styles.retempBody}>
                {retestGuidance || "Retake the temperature after completing the steps above."}
              </Text>
            </View>
          ) : null}

          {showSecondFailurePhase ? (
            <FailureProcedurePanel
              title="2nd Failure"
              actions={secondFailure}
              unlocked
              busy={saving}
              onComplete={(actionId) => void markCorrectiveComplete(actionId)}
            />
          ) : null}

          {showCapture ? (
            <>
              <Text style={styles.sectionLabel}>
                {showRetemp ? "RETEMP READING" : "CURRENT TEMPERATURE"}
              </Text>
              <View style={styles.tempCard}>
                <View style={styles.tempReading}>
                  <Text style={styles.tempValue}>{digits || "—"}</Text>
                  <Text style={styles.tempUnit}>°{unit}</Text>
                </View>
                {verdict ? (
                  <View
                    style={[styles.verdict, verdict.pass ? styles.verdictPass : styles.verdictFail]}
                  >
                    <Text
                      style={[styles.verdictMark, verdict.pass ? styles.passText : styles.failText]}
                    >
                      {verdict.pass ? "✓" : "!"}
                    </Text>
                    <View>
                      <Text
                        style={[
                          styles.verdictTitle,
                          verdict.pass ? styles.passText : styles.failText,
                        ]}
                      >
                        {verdict.pass ? "PASS" : "FAIL"}
                      </Text>
                      <Text style={styles.verdictDetail}>{verdict.detail}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.verdictPending}>
                    <Text style={styles.verdictPendingText}>
                      {allowProbe && !manualMode ? "Waiting for probe…" : "Enter a reading"}
                    </Text>
                  </View>
                )}
              </View>

              {allowProbe ? (
                <CheckProbeBar
                  unit={unit}
                  liveDigitsEnabled={!manualMode}
                  onLiveDigits={onLiveDigits}
                  onCaptureRequest={(probeDigits) => {
                    void submitCurrent({
                      fromProbeButton: true,
                      digitsOverride: probeDigits,
                      retestCount: showRetemp ? retestCount + 1 : 0,
                    });
                  }}
                />
              ) : (
                <View style={[styles.probeBar, styles.probeBarManual]}>
                  <View style={styles.probeCopy}>
                    <Text style={styles.probeTitle}>Manual entry</Text>
                    <Text style={styles.probeHint}>Use the keypad to record this temperature</Text>
                  </View>
                </View>
              )}

              {showKeypad ? (
                <View style={styles.pad}>
                  {(["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const).map(
                    (key) => (
                      <Pressable
                        key={key}
                        style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                        onPress={() => {
                          if (key === "⌫") clearLastDigit();
                          else pushDigit(key);
                        }}
                      >
                        {key === "⌫" ? <IconBackspace /> : <Text style={styles.keyText}>{key}</Text>}
                      </Pressable>
                    ),
                  )}
                </View>
              ) : null}

              {allowProbe && allowManual ? (
                <Pressable onPress={() => setManualMode((v) => !v)} style={styles.manualLink}>
                  <Text style={styles.manualLinkText}>
                    {manualMode ? "Use probe reading" : "Enter manually"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[styles.saveBtn, (!digits || saving) && styles.saveBtnDisabled]}
                disabled={!digits || saving}
                onPress={() =>
                  void submitCurrent({ retestCount: showRetemp ? retestCount + 1 : 0 })
                }
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <IconShield />
                    <Text style={styles.saveBtnText}>
                      {showRetemp ? "Save Retemp" : "Save Reading"}
                    </Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          {canRestart ? (
            <Pressable
              style={[styles.restartBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={confirmRestartItem}
            >
              <Text style={styles.restartBtnText}>Restart this item</Text>
            </Pressable>
          ) : null}

          <View style={styles.syncRow}>
            <Text style={styles.syncLock}>🔒</Text>
            <Text style={styles.syncText}>Reading will sync to Alenio Go</Text>
          </View>
        </ScrollView>
      </View>
    </MaybeProbeProvider>
  );
}

function criteriaDetail(config: TemperatureConfig) {
  const unit = config.unit ?? "F";
  if (config.comparisonType === "BETWEEN") {
    return `Pass between ${config.minimumTemperature}°${unit} and ${config.maximumTemperature}°${unit}.`;
  }
  if (config.comparisonType === "BELOW") {
    return `Pass at or below ${config.maximumTemperature}°${unit}.`;
  }
  return `Pass at or above ${config.minimumTemperature}°${unit}.`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "600",
  },
  errorText: {
    color: colors.fail,
    fontWeight: "700",
    marginBottom: 16,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  procedureBanner: {
    backgroundColor: colors.failSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    marginBottom: 12,
  },
  procedureBannerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.fail,
    marginBottom: 2,
  },
  procedureBannerBody: {
    fontSize: 13,
    color: "#7F1D1D",
    lineHeight: 18,
  },
  retempCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
    marginBottom: 12,
  },
  retempTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1D4ED8",
    marginBottom: 4,
  },
  retempBody: {
    fontSize: 13,
    color: "#1E3A8A",
    lineHeight: 18,
  },
  restartBtn: {
    marginTop: 4,
    marginBottom: 8,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  restartBtnText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 14,
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  iconClockOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconClockFace: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  iconClockHand: {
    width: 2,
    height: 7,
    backgroundColor: colors.brand,
    borderRadius: 1,
  },
  progressCopy: { flex: 1, minWidth: 0 },
  progressKicker: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: colors.brand,
    marginBottom: 2,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  progressRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brandMid,
    borderRadius: 999,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    minWidth: 32,
    textAlign: "right",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 18,
  },
  iconPotWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPotGlyph: {
    fontSize: 20,
    color: colors.brand,
  },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  itemSub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: colors.muted,
  },
  requiredCol: {
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    alignItems: "flex-end",
    minWidth: 72,
  },
  requiredLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: colors.muted,
  },
  requiredValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  requiredHint: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  infoBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94A3B8",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: colors.muted,
    marginBottom: 8,
  },
  tempCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  tempReading: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  tempValue: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
    lineHeight: 52,
  },
  tempUnit: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 6,
  },
  verdict: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: "48%",
  },
  verdictPass: { backgroundColor: colors.passSoft },
  verdictFail: { backgroundColor: colors.failSoft },
  verdictMark: {
    fontSize: 16,
    fontWeight: "900",
  },
  verdictTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  verdictDetail: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  passText: { color: colors.pass },
  failText: { color: colors.fail },
  verdictPending: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  verdictPendingText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },
  probeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.probeBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  probeBarManual: {
    backgroundColor: "#F1F5F9",
  },
  probeCopy: { flex: 1, minWidth: 0 },
  probeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brandDark,
  },
  probeHint: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "500",
    color: colors.brand,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 8,
  },
  key: {
    width: "31.5%",
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: {
    backgroundColor: "#F8FAFC",
    opacity: 0.9,
  },
  keyText: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
  },
  manualLink: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },
  manualLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.brand,
  },
  saveBtn: {
    marginTop: 4,
    backgroundColor: colors.brand,
    borderRadius: 14,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveIcon: { fontSize: 16 },
  saveBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  syncRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  syncLock: { fontSize: 11 },
  syncText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
});
