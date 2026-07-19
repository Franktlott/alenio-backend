import { router, useLocalSearchParams, useNavigation } from "expo-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { AppTabHeader } from "../../../components/AppTabHeader";
import { CheckProbeBar } from "../../../components/check/CheckProbeBar";
import { FailureProcedurePanel } from "../../../components/check/FailureProcedurePanel";
import { useSession } from "../../../lib/session-context";
import {
  completeCorrectiveAction,
  completeRun,
  flattenRunItems,
  isOpenTempItem,
  itemHasUnstartedProcedure,
  itemNeedsProcedure,
  resetItemCheck,
  startCheckRun,
  submitTemperature,
} from "../../../lib/temps-api";
import type { TemperatureConfig, WalkRun, WalkRunItem } from "../../../lib/types";
import { colors } from "../../../lib/theme";
import { ProbeProvider } from "../../../probe/react";

function boundNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same pass/fail rules as backend `evaluateTemperature` — null bounds never become 0. */
function evaluateTemp(
  value: number,
  config: TemperatureConfig,
): { pass: boolean; detail: string } | null {
  if (!Number.isFinite(value)) return null;
  const unit = config.unit ?? "F";
  const min = boundNumber(config.minimumTemperature);
  const max = boundNumber(config.maximumTemperature);
  if (config.comparisonType === "BETWEEN") {
    if (min == null || max == null) return null;
    const ok = value >= min && value <= max;
    return {
      pass: ok,
      detail: ok ? `Within ${min}–${max}°${unit}` : `Outside ${min}–${max}°${unit}`,
    };
  }
  if (config.comparisonType === "BELOW") {
    if (max == null) return null;
    const ok = value <= max;
    return {
      pass: ok,
      detail: ok ? `At or below ${max}°${unit}` : `Above required ${max}°${unit}`,
    };
  }
  if (min == null) return null;
  const ok = value >= min;
  return {
    pass: ok,
    detail: ok ? `Above required ${min}°${unit}` : `Below required ${min}°${unit}`,
  };
}

function IconBackspace() {
  return <Text style={styles.keyText}>⌫</Text>;
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
  /** Only show failure-procedure UI after a saved fail (or explicit Continue). */
  const [procedureActive, setProcedureActive] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      header: () => (
        <AppTabHeader
          topInset={insets.top}
          compact
          logoLift={10}
          testID="temps-check-header"
          onClose={() => router.replace("/(app)/today")}
        />
      ),
    });
  }, [navigation, insets.top]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamId || !occurrenceId) return;
      try {
        let started = await startCheckRun(teamId, occurrenceId);
        if (cancelled) return;

        // "Tap to take" should open temperature capture. If a prior fail never
        // started its procedure (common after leaving mid-check), clear it.
        for (const item of flattenRunItems(started)) {
          if (item.type !== "TEMPERATURE" || !itemHasUnstartedProcedure(item)) continue;
          started = await resetItemCheck(teamId, started.id, item.id);
          if (cancelled) return;
        }

        setRun(started);
        const flat = flattenRunItems(started);
        const firstFresh = flat.findIndex(
          (i) =>
            i.type === "TEMPERATURE" &&
            (!i.response || i.response.status === "NOT_STARTED"),
        );
        const firstOpen =
          firstFresh >= 0 ? firstFresh : flat.findIndex((i) => isOpenTempItem(i));
        setItemIndex(firstOpen >= 0 ? firstOpen : 0);
        setProcedureActive(false);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not start check";
        setError(message);
        if (isOutsideWindowError(message)) alertOutsideWindow(message);
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
  const value = digits === "" || digits === "." ? NaN : Number(digits);
  const verdict = evaluateTemp(value, config);
  const probeEnabledForRun = run ? runAllowsBluetoothProbe(run) : false;

  useEffect(() => {
    // Prefer live probe for each new item; associate can switch to keypad again.
    setManualMode(false);
    setEntrySource("manual");
    setDigits("");
    // Always land on the temperature page; procedure opens only after a saved fail.
    setProcedureActive(false);
  }, [current?.id]);

  const onLiveDigits = useCallback((next: string) => {
    setDigits(next);
    setEntrySource("bluetooth");
  }, []);

  /** Latest probe-button save path — ref avoids stale closures without resetting the capture timer. */
  const onProbeCaptureRequestRef = useRef<(probeDigits: string) => void>(() => {});

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

  function alertOutsideWindow(message: string) {
    Alert.alert("Outside check window", message, [
      { text: "OK", onPress: () => router.replace("/(app)/today") },
    ]);
  }

  function isOutsideWindowError(message: string) {
    return /window has closed|hasn’t opened|has not opened|not available/i.test(message);
  }

  async function advanceAfterSave(next: WalkRun, currentItemId: string) {
    const flat = flattenRunItems(next);
    const saved = flat.find((i) => i.id === currentItemId);
    // Only open corrective flow when the server marked NEEDS_ACTION (true fail path).
    if (saved && saved.response?.status === "NEEDS_ACTION" && itemNeedsProcedure(saved)) {
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      setProcedureActive(true);
      const idx = flat.findIndex((i) => i.id === currentItemId);
      if (idx >= 0) setItemIndex(idx);
      return;
    }
    setProcedureActive(false);

    const remaining = flat.filter((i) => isOpenTempItem(i));
    if (remaining.length === 0 && next.progress.requiredRemaining === 0) {
      try {
        const completed = await completeRun(teamId!, next.id);
        setRun(completed);
        Alert.alert("Check complete", "Results are available in Alenio Go.", [
          { text: "Done", onPress: () => router.back() },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not complete check";
        if (isOutsideWindowError(message)) alertOutsideWindow(message);
        else Alert.alert("Could not complete", message);
      }
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
      const message = err instanceof Error ? err.message : "Try again.";
      if (isOutsideWindowError(message)) alertOutsideWindow(message);
      else Alert.alert("Could not save", message);
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
    // Always allow restart — even if a save is in flight (stuck spinner).
    setSaving(true);
    try {
      const next = await resetItemCheck(teamId, run.id, current.id);
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      setManualMode(false);
      setProcedureActive(false);
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
  const hasPendingProcedure = itemNeedsProcedure(current);
  const awaitingProcedureContinue = hasPendingProcedure && !procedureActive;
  const inProcedure = hasPendingProcedure && procedureActive;
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
  // Temp capture first. Procedure only after a saved fail (or Continue).
  const showCapture = !awaitingProcedureContinue && (!inProcedure || showRetemp);
  const canRestart =
    Boolean(current.response) && current.response?.status !== "NOT_STARTED";

  const failSummary = failSummaryFromItem(current, unit, config);
  const readingStable =
    allowProbe && !manualMode && Number.isFinite(value) && entrySource === "bluetooth";
  const showFailBanner = Boolean(verdict && !verdict.pass);

  onProbeCaptureRequestRef.current = (probeDigits: string) => {
    void submitCurrent({
      fromProbeButton: true,
      digitsOverride: probeDigits,
      retestCount: showRetemp ? retestCount + 1 : 0,
    });
  };

  return (
    <MaybeProbeProvider enabled={probeEnabledForRun}>
      <View style={styles.screen}>
        <ScrollView
          style={styles.scrollFlex}
          contentContainerStyle={[
            styles.scroll,
            showCapture && styles.scrollGrow,
            { paddingBottom: showCapture ? 16 : 24 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {awaitingProcedureContinue ? (
            <View style={styles.procedureBanner}>
              <Text style={styles.procedureBannerTitle}>Previous reading failed</Text>
              <Text style={styles.procedureBannerBody}>
                Finish the failure steps from last time, or start over with a new reading.
              </Text>
              <Pressable
                style={[styles.continueBtn, saving && styles.saveBtnDisabled]}
                disabled={saving}
                onPress={() => setProcedureActive(true)}
              >
                <Text style={styles.continueBtnText}>Continue failure procedure</Text>
              </Pressable>
              <Pressable
                style={[styles.restartFromBannerBtn, saving && styles.saveBtnDisabled]}
                disabled={saving}
                onPress={() => void restartItem()}
              >
                <Text style={styles.restartFromBannerBtnText}>Take a new reading</Text>
              </Pressable>
            </View>
          ) : null}

          {showFirstFailurePhase ? (
            <FailureProcedurePanel
              title="1st Failure"
              actions={firstFailure}
              unlocked
              busy={saving}
              failSummary={failSummary}
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
              failSummary={failSummary}
              onComplete={(actionId) => void markCorrectiveComplete(actionId)}
            />
          ) : null}

          {showCapture ? (
            <View style={styles.captureBlock}>
              <View style={styles.itemHead}>
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconGlyph}>❄</Text>
                </View>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {current.title}
                  </Text>
                  <Text style={styles.itemSub} numberOfLines={1}>
                    {current.description?.trim() ||
                      current.instructions?.trim() ||
                      "Temperature check"}
                  </Text>
                </View>
              </View>

              <View style={styles.targetCard}>
                <View style={styles.targetIcon}>
                  <Text style={styles.targetSnowflake}>❄</Text>
                </View>
                <View style={styles.targetCopy}>
                  <Text style={styles.targetLabel}>Target Temperature</Text>
                  <Text style={styles.targetValue}>{targetLabel(config)}</Text>
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

              <View style={styles.tempCenter}>
                <View
                  style={[
                    styles.tempRing,
                    showFailBanner && styles.tempRingFail,
                    verdict?.pass && styles.tempRingPass,
                    !verdict && styles.tempRingIdle,
                  ]}
                >
                  <View style={styles.tempReading}>
                    <Text
                      style={[
                        styles.tempValue,
                        showFailBanner && styles.tempValueFail,
                        verdict?.pass && styles.tempValuePass,
                      ]}
                    >
                      {digits || "—"}
                    </Text>
                    <Text
                      style={[
                        styles.tempUnit,
                        showFailBanner && styles.tempValueFail,
                        verdict?.pass && styles.tempValuePass,
                      ]}
                    >
                      °{unit}
                    </Text>
                  </View>

                  {readingStable ? (
                    <View style={styles.stablePill}>
                      <View style={styles.stableDot} />
                      <Text style={styles.stablePillText}>Reading is stable</Text>
                    </View>
                  ) : !verdict ? (
                    <Text style={styles.waitingHint}>
                      {allowProbe && !manualMode ? "Waiting for probe…" : "Enter a reading"}
                    </Text>
                  ) : null}
                </View>
              </View>

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
                  <Text style={styles.manualIcon}>{manualMode ? "⌀" : "✎"}</Text>
                  <Text style={styles.manualLinkText}>
                    {manualMode ? "Use probe reading" : "Enter manually"}
                  </Text>
                  {!manualMode ? (
                    <Text style={styles.manualHint}>Manually input the temperature</Text>
                  ) : null}
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {canRestart && !awaitingProcedureContinue ? (
            <Pressable
              style={[styles.restartBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={confirmRestartItem}
            >
              <Text style={styles.restartBtnText}>Restart this item</Text>
            </Pressable>
          ) : null}

        </ScrollView>

        {showCapture ? (
          <View style={[styles.footerBlock, { paddingBottom: Math.max(14, insets.bottom + 6) }]}>
            {allowProbe ? (
              <View style={styles.probeRowWrap}>
                <CheckProbeBar
                  key={`${current.id}-${showRetemp ? "retemp" : "main"}`}
                  unit={unit}
                  liveDigitsEnabled={!manualMode && !saving}
                  onLiveDigits={onLiveDigits}
                  onCaptureRequest={
                    saving
                      ? undefined
                      : (probeDigits) => onProbeCaptureRequestRef.current(probeDigits)
                  }
                />
              </View>
            ) : null}
            <View style={styles.footerSticky}>
              <Pressable style={[styles.skipBtn, styles.skipBtnDisabled]} disabled>
                <Text style={styles.skipBtnText}>Skip</Text>
              </Pressable>
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
                  <Text style={styles.saveBtnText}>
                    {showRetemp ? "Save Retemp  ›" : "Save & Continue  ›"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
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

function targetLabel(config: TemperatureConfig): string {
  const unit = config.unit ?? "F";
  if (config.comparisonType === "BETWEEN") {
    return `${config.minimumTemperature ?? "?"}–${config.maximumTemperature ?? "?"} °${unit}`;
  }
  if (config.comparisonType === "BELOW") {
    return `≤ ${config.maximumTemperature ?? "?"} °${unit}`;
  }
  return `≥ ${config.minimumTemperature ?? "?"} °${unit}`;
}

function failSummaryFromItem(
  item: WalkRunItem,
  unit: string,
  config: TemperatureConfig,
): string | null {
  if (!item.response || (item.response.status !== "NEEDS_ACTION" && !item.response.failed)) {
    return null;
  }
  const payload =
    item.response.response && typeof item.response.response === "object"
      ? (item.response.response as Record<string, unknown>)
      : null;
  const value = typeof payload?.value === "number" ? payload.value : null;
  const limit = targetLabel(config);
  if (value == null) return `Reading is outside the limit (${limit})`;
  if (config.comparisonType === "BELOW") {
    return `${value} °${unit} is above the limit (${limit})`;
  }
  if (config.comparisonType === "ABOVE") {
    return `${value} °${unit} is below the limit (${limit})`;
  }
  return `${value} °${unit} is outside the limit (${limit})`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7FB",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: colors.mutedOnDark,
    fontWeight: "600",
  },
  errorText: {
    color: colors.fail,
    fontWeight: "700",
    marginBottom: 16,
  },
  scrollFlex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  scrollGrow: {
    flexGrow: 1,
  },
  footerBlock: {
    backgroundColor: "#F4F7FB",
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  probeRowWrap: {
    marginBottom: 12,
  },
  footerSticky: {
    flexDirection: "row",
    gap: 12,
  },
  captureBlock: {
    flex: 1,
    marginBottom: 8,
  },
  itemHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  itemIconGlyph: {
    fontSize: 20,
    color: colors.brand,
  },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  itemSub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: colors.muted,
  },
  targetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E8EEF5",
    shadowColor: "#0B1F44",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    marginBottom: 18,
  },
  targetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  targetSnowflake: {
    fontSize: 16,
    color: colors.brand,
  },
  targetCopy: {
    flex: 1,
    minWidth: 0,
  },
  targetLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  targetValue: {
    marginTop: 2,
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },
  infoBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#94A3B8",
  },
  tempCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 220,
    paddingVertical: 8,
  },
  tempRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 10,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
  },
  tempRingFail: {
    borderColor: "#FECACA",
  },
  tempRingPass: {
    borderColor: "#BBF7D0",
  },
  tempRingIdle: {
    borderColor: "#E2E8F0",
  },
  tempReading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 2,
  },
  tempValue: {
    fontSize: 64,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    letterSpacing: -1.5,
    lineHeight: 70,
  },
  tempUnit: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.muted,
    marginTop: 12,
  },
  tempValueFail: { color: colors.fail },
  tempValuePass: { color: colors.pass },
  stablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    backgroundColor: colors.stablePill,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
  },
  stableDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.stableText,
  },
  stablePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.stableText,
  },
  waitingHint: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 10,
  },
  procedureBanner: {
    backgroundColor: colors.failSoft,
    borderRadius: 14,
    padding: 14,
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
  continueBtn: {
    marginTop: 12,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  continueBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  restartFromBannerBtn: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  restartFromBannerBtnText: {
    color: colors.brandDark,
    fontWeight: "800",
    fontSize: 14,
  },
  retempCard: {
    backgroundColor: colors.infoSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  retempTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.info,
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
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  restartBtnText: {
    color: colors.inkOnDark,
    fontWeight: "700",
    fontSize: 14,
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
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EEF5",
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: {
    backgroundColor: colors.brandSoft,
  },
  keyText: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.ink,
  },
  manualLink: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
    gap: 4,
  },
  manualIcon: {
    fontSize: 18,
    color: colors.brand,
    fontWeight: "700",
  },
  manualLinkText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.brand,
  },
  manualHint: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.muted,
  },
  skipBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#D5DEEA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  skipBtnDisabled: {
    opacity: 0.45,
  },
  skipBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  saveBtn: {
    flex: 1.55,
    backgroundColor: colors.brand,
    borderRadius: 14,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
});
