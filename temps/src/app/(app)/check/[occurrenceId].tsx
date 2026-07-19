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
import { CheckCompleteModal } from "../../../components/check/CheckCompleteModal";
import { FailureProcedurePanel } from "../../../components/check/FailureProcedurePanel";
import * as ImagePicker from "expo-image-picker";
import { getErrorCode } from "../../../lib/api";
import {
  clearCheckDraft,
  createEmptyDraft,
  getCheckDraft,
  isConflictErrorCode,
  saveCheckDraft,
  type CheckDraft,
  type LocalPhoto,
  type SyncDraftItem,
} from "../../../lib/check-draft-store";
import {
  clearCachedRun,
  loadCachedRun,
  saveCachedRun,
} from "../../../lib/day-cache";
import {
  applyLocalCorrectiveCompletions,
  applyLocalTemperature,
  evaluateTemp,
  resetLocalItem,
} from "../../../lib/local-run";
import { useSession } from "../../../lib/session-context";
import { uploadPendingDraftPhotos } from "../../../lib/sync-photos";
import {
  flattenRunItems,
  isOpenTempItem,
  itemAwaitingRetemp,
  itemHasUnstartedProcedure,
  itemNeedsProcedure,
  resetItemCheck,
  startCheckRun,
  syncRun,
} from "../../../lib/temps-api";
import type {
  TemperatureConfig,
  WalkRun,
  WalkRunCorrectiveAction,
  WalkRunItem,
} from "../../../lib/types";
import { colors } from "../../../lib/theme";
import { ProbeProvider } from "../../../probe/react";

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
  const [completeModalVisible, setCompleteModalVisible] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [awaitingSync, setAwaitingSync] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const draftRef = useRef<CheckDraft | null>(null);
  const syncingRef = useRef(false);

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

      function firstOpenIndex(started: WalkRun) {
        const flat = flattenRunItems(started);
        const firstFresh = flat.findIndex(
          (i) =>
            i.type === "TEMPERATURE" &&
            (!i.response || i.response.status === "NOT_STARTED"),
        );
        const firstOpen =
          firstFresh >= 0 ? firstFresh : flat.findIndex((i) => isOpenTempItem(i));
        return firstOpen >= 0 ? firstOpen : 0;
      }

      async function beginWithRun(started: WalkRun, opts?: { skipServerReset?: boolean }) {
        let nextRun = started;
        if (!opts?.skipServerReset) {
          for (const item of flattenRunItems(nextRun)) {
            if (item.type !== "TEMPERATURE" || !itemHasUnstartedProcedure(item)) continue;
            try {
              nextRun = await resetItemCheck(teamId!, nextRun.id, item.id);
            } catch {
              break;
            }
            if (cancelled) return;
          }
        }
        const startIndex = firstOpenIndex(nextRun);
        const draft = createEmptyDraft({
          occurrenceId: occurrenceId!,
          teamId: teamId!,
          run: nextRun,
          itemIndex: startIndex,
        });
        draftRef.current = draft;
        await saveCheckDraft(draft);
        await saveCachedRun(teamId!, occurrenceId!, nextRun);
        if (cancelled) return;
        setRun(nextRun);
        setItemIndex(startIndex);
        setProcedureActive(false);
        setDraftVersion((v) => v + 1);
      }

      try {
        const existingDraft = await getCheckDraft(occurrenceId);
        const cachedRun = await loadCachedRun(teamId, occurrenceId);

        // Resume local draft offline or online (mid-check / pending sync).
        if (existingDraft && existingDraft.teamId === teamId && !existingDraft.syncedAt) {
          draftRef.current = existingDraft;
          setRun(existingDraft.run);
          setItemIndex(existingDraft.itemIndex);
          setProcedureActive(false);
          setDraftVersion((v) => v + 1);
          if (existingDraft.finishedLocally) {
            setAwaitingSync(true);
            setSyncError(existingDraft.lastSyncError);
            void flushSync();
          }
          return;
        }

        if (existingDraft) await clearCheckDraft(occurrenceId);

        try {
          let started = await startCheckRun(teamId, occurrenceId);
          if (cancelled) return;
          await beginWithRun(started);
        } catch (err) {
          if (cancelled) return;
          const code = getErrorCode(err);
          const message = err instanceof Error ? err.message : "Could not start check";

          if (isConflictErrorCode(code)) {
            await clearCheckDraft(occurrenceId);
            await clearCachedRun(teamId, occurrenceId);
            setConflictMessage(message);
            return;
          }

          if ((code === "NETWORK_ERROR" || code === null) && cachedRun) {
            await beginWithRun(cachedRun, { skipServerReset: true });
            return;
          }

          if (!cachedRun && (code === "NETWORK_ERROR" || /network|offline|fetch/i.test(message))) {
            setError(
              "Open this check once while online so it can work offline next time.",
            );
            return;
          }

          setError(message);
          if (isOutsideWindowError(message)) alertOutsideWindow(message);
        }
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

  async function persistDraft(patch: Partial<CheckDraft> & { run?: WalkRun }) {
    const prev = draftRef.current;
    if (!prev) return;
    const next: CheckDraft = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    draftRef.current = next;
    await saveCheckDraft(next);
    setDraftVersion((v) => v + 1);
  }

  async function flushSync() {
    const draft = draftRef.current;
    if (!teamId || !draft) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setAwaitingSync(true);
    setSyncError(null);
    setConflictMessage(null);
    try {
      const withPhotos = await uploadPendingDraftPhotos(draft);
      await persistDraft({ syncItems: withPhotos });
      const completed = await syncRun(
        teamId,
        draft.runId,
        withPhotos.map((item) => ({
          itemId: item.itemId,
          response: item.response,
          photoUrls: item.photoUrls.length > 0 ? item.photoUrls : undefined,
          correctiveActionIdsCompleted: item.correctiveActionIdsCompleted,
        })),
        true,
      );
      await clearCheckDraft(draft.occurrenceId);
      await clearCachedRun(teamId, draft.occurrenceId);
      draftRef.current = null;
      setRun(completed);
      setSyncError(null);
      setCompleteModalVisible(true);
    } catch (err) {
      const code = getErrorCode(err);
      const message = err instanceof Error ? err.message : "Couldn’t sync results";

      if (isConflictErrorCode(code)) {
        await clearCheckDraft(draft.occurrenceId);
        await clearCachedRun(teamId, draft.occurrenceId);
        draftRef.current = null;
        setConflictMessage(message);
        setAwaitingSync(false);
        return;
      }

      await persistDraft({
        finishedLocally: true,
        lastSyncError: message,
        lastSyncErrorCode: code,
        syncedAt: null,
      });
      setSyncError(message);
      setAwaitingSync(true);
      if (isOutsideWindowError(message)) alertOutsideWindow(message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

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

  async function advanceAfterSave(next: WalkRun, currentItemId: string, nextIndex?: number) {
    const flat = flattenRunItems(next);
    const saved = flat.find((i) => i.id === currentItemId);
    const stayOnProcedure =
      saved &&
      saved.response?.status === "NEEDS_ACTION" &&
      (itemNeedsProcedure(saved) || itemAwaitingRetemp(saved));
    if (stayOnProcedure) {
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      setProcedureActive(true);
      const idx = flat.findIndex((i) => i.id === currentItemId);
      const stayAt = idx >= 0 ? idx : itemIndex;
      setItemIndex(stayAt);
      await persistDraft({ run: next, itemIndex: stayAt });
      return;
    }
    setProcedureActive(false);

    const remaining = flat.filter((i) => isOpenTempItem(i));
    if (remaining.length === 0 && next.progress.requiredRemaining === 0) {
      setRun(next);
      await persistDraft({
        run: next,
        finishedLocally: true,
        lastSyncError: null,
      });
      await flushSync();
      return;
    }

    const nextIdx =
      nextIndex ??
      flat.findIndex((i) => isOpenTempItem(i));
    const resolvedIndex = nextIdx >= 0 ? nextIdx : Math.min(itemIndex + 1, flat.length - 1);
    setRun(next);
    setDigits("");
    setEntrySource("manual");
    setItemIndex(resolvedIndex);
    await persistDraft({ run: next, itemIndex: resolvedIndex });
  }

  async function submitCurrent(options?: {
    fromProbeButton?: boolean;
    /** Digits from probe button path (avoids stale React state). */
    digitsOverride?: string;
    retestCount?: number;
  }) {
    if (!teamId || !run || !current) return;
    if (saving || syncing) return;
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
      const retestCount = options?.retestCount ?? 0;
      const response: SyncDraftItem["response"] = {
        value: valueToSave,
        unit,
        source: sourceToSave,
        ...(retestCount > 0 ? { retestCount } : {}),
      };
      const next = applyLocalTemperature(run, current.id, {
        value: valueToSave,
        unit,
        source: sourceToSave,
        retestCount,
      });
      const draft = draftRef.current;
      const syncItems: SyncDraftItem[] = [
        ...(draft?.syncItems ?? []),
        {
          itemId: current.id,
          response,
          correctiveActionIdsCompleted: [],
          localPhotos: [],
          photoUrls: [],
          capturedAt: new Date().toISOString(),
        },
      ];
      await persistDraft({ run: next, syncItems });
      await advanceAfterSave(next, current.id);
    } catch (err) {
      Alert.alert("Could not save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function markAllCorrectiveComplete(phaseActions: WalkRunCorrectiveAction[]) {
    if (!teamId || !run || !current) return;
    if (saving || syncing) return;
    const pending = phaseActions.filter((a) => a.status === "PENDING");
    if (pending.length === 0) return;
    setSaving(true);
    try {
      const actionIds = pending.map((a) => a.id);
      const next = applyLocalCorrectiveCompletions(run, current.id, actionIds);
      const draft = draftRef.current;
      const syncItems = [...(draft?.syncItems ?? [])];
      for (let i = syncItems.length - 1; i >= 0; i--) {
        if (syncItems[i]!.itemId === current.id) {
          syncItems[i] = {
            ...syncItems[i]!,
            correctiveActionIdsCompleted: [
              ...syncItems[i]!.correctiveActionIdsCompleted,
              ...actionIds,
            ],
          };
          break;
        }
      }
      await persistDraft({ run: next, syncItems });
      await advanceAfterSave(next, current.id);
    } catch (err) {
      Alert.alert(
        "Could not complete steps",
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
    setSaving(true);
    try {
      const next = resetLocalItem(run, current.id);
      const draft = draftRef.current;
      const syncItems = (draft?.syncItems ?? []).filter((s) => s.itemId !== current.id);
      const flat = flattenRunItems(next);
      const idx = flat.findIndex((i) => i.id === current.id);
      const stayAt = idx >= 0 ? idx : itemIndex;
      await persistDraft({ run: next, syncItems, itemIndex: stayAt, finishedLocally: false });
      setRun(next);
      setDigits("");
      setEntrySource("manual");
      setManualMode(false);
      setProcedureActive(false);
      setItemIndex(stayAt);
    } catch (err) {
      Alert.alert("Could not restart", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function capturePhotoForAction(actionId: string) {
    if (!current) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera needed", "Allow camera access to attach evidence photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    const photo: LocalPhoto = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uri: result.assets[0].uri,
      correctiveActionId: actionId,
      uploadedUrl: null,
    };

    const draft = draftRef.current;
    const syncItems = [...(draft?.syncItems ?? [])];
    for (let i = syncItems.length - 1; i >= 0; i--) {
      if (syncItems[i]!.itemId === current.id) {
        syncItems[i] = {
          ...syncItems[i]!,
          localPhotos: [...syncItems[i]!.localPhotos, photo],
        };
        break;
      }
    }
    await persistDraft({ syncItems });
  }

  function photosByActionIdForCurrent(): Record<string, string[]> {
    void draftVersion;
    const draft = draftRef.current;
    if (!draft || !current) return {};
    const map: Record<string, string[]> = {};
    for (const item of draft.syncItems) {
      if (item.itemId !== current.id) continue;
      for (const photo of item.localPhotos) {
        if (!photo.correctiveActionId) continue;
        const list = map[photo.correctiveActionId] ?? [];
        list.push(photo.uri);
        map[photo.correctiveActionId] = list;
      }
    }
    return map;
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Starting check…</Text>
      </View>
    );
  }

  if (conflictMessage) {
    return (
      <View style={[styles.screen, styles.centered, { padding: 24 }]}>
        <Text style={styles.syncTitle}>Check already finished</Text>
        <Text style={styles.syncBody}>{conflictMessage}</Text>
        <Pressable
          style={[styles.saveBtn, { marginTop: 16, alignSelf: "stretch" }]}
          onPress={() => router.replace("/(app)/today")}
        >
          <Text style={styles.saveBtnText}>Back to Today</Text>
        </Pressable>
      </View>
    );
  }

  if (awaitingSync && run) {
    return (
      <View style={[styles.screen, styles.centered, { padding: 24 }]}>
        {syncing || completeModalVisible ? (
          <>
            {!completeModalVisible ? (
              <>
                <ActivityIndicator color={colors.brand} size="large" />
                <Text style={styles.loadingText}>Syncing results…</Text>
              </>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.syncTitle}>Couldn’t sync</Text>
            <Text style={styles.syncBody}>
              {syncError ?? "Your readings are saved on this device. Retry when you’re back online."}
            </Text>
            <Pressable
              style={[styles.saveBtn, { marginTop: 16, alignSelf: "stretch" }]}
              onPress={() => void flushSync()}
            >
              <Text style={styles.saveBtnText}>Retry sync</Text>
            </Pressable>
            <Pressable
              style={[styles.restartBtn, { marginTop: 12 }]}
              onPress={() => router.replace("/(app)/today")}
            >
              <Text style={styles.restartBtnText}>Back to Today</Text>
            </Pressable>
          </>
        )}
        <CheckCompleteModal
          visible={completeModalVisible}
          onDone={() => {
            setCompleteModalVisible(false);
            router.back();
          }}
        />
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
  const maxRetests =
    typeof config.maximumRetests === "number" && Number.isFinite(config.maximumRetests)
      ? Math.max(1, Math.floor(config.maximumRetests))
      : 1;
  const retempDone = !requireRetest || retestCount >= maxRetests;
  const awaitingRetemp = itemAwaitingRetemp(current);
  const retempFailed =
    retempDone &&
    (current.response?.status === "NEEDS_ACTION" || current.response?.failed === true) &&
    secondFailure.some((a) => a.status === "PENDING" || a.status === "COMPLETED");
  const hasPendingProcedure = itemNeedsProcedure(current);
  const awaitingProcedureContinue =
    (hasPendingProcedure || awaitingRetemp) && !procedureActive;
  const inProcedure =
    ((hasPendingProcedure || awaitingRetemp) && procedureActive) || awaitingRetemp;
  const showRetemp = awaitingRetemp && procedureActive;
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
              photosByActionId={photosByActionIdForCurrent()}
              onCapturePhoto={(actionId) => void capturePhotoForAction(actionId)}
              onCompleteAll={() => void markAllCorrectiveComplete(firstFailure)}
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
              photosByActionId={photosByActionIdForCurrent()}
              onCapturePhoto={(actionId) => void capturePhotoForAction(actionId)}
              onCompleteAll={() => void markAllCorrectiveComplete(secondFailure)}
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

        <CheckCompleteModal
          visible={completeModalVisible}
          onDone={() => {
            setCompleteModalVisible(false);
            router.back();
          }}
        />
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
  syncTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.inkOnDark,
    textAlign: "center",
  },
  syncBody: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.mutedOnDark,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
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
