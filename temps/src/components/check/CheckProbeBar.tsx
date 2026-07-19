import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import { probeCelsiusToDigits } from "../../lib/temp-units";
import { useProbe } from "../../probe/react";

type CheckProbeBarProps = {
  /** Item display unit; probe values are always Celsius upstream. */
  unit: "F" | "C";
  /**
   * When true, live ok readings update the check digits.
   * False while the associate is using the keypad.
   */
  liveDigitsEnabled: boolean;
  onLiveDigits: (digits: string) => void;
  /** Thermapen measure/transfer button — parent should Save Reading. */
  onCaptureRequest?: (digits: string) => void;
};

/** Wait briefly so the button's accompanying reading lands in the store. */
const CAPTURE_SAVE_DELAY_MS = 250;
/** Retry if the reading has not arrived yet after the button press. */
const CAPTURE_RETRY_MS = 175;
const CAPTURE_MAX_ATTEMPTS = 8;

/**
 * Floor-facing ThermoWorks connection + status for the take-check screen.
 * Owns scan / auto-connect; parent owns `digits` and save.
 * Renders as a device card matching the capture mock.
 */
export function CheckProbeBar({
  unit,
  liveDigitsEnabled,
  onLiveDigits,
  onCaptureRequest,
}: CheckProbeBarProps) {
  const { snapshot, getSnapshot, startScan, stopScan, connect } = useProbe();
  const [busy, setBusy] = useState(false);
  const autoConnectAttempted = useRef<string | null>(null);
  const lastAppliedKey = useRef<string | null>(null);
  /** Last handled capture seq — never treat a past OK as a new save. */
  const lastCaptureSeq = useRef<number | null>(null);
  const onCaptureRequestRef = useRef(onCaptureRequest);
  onCaptureRequestRef.current = onCaptureRequest;
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const onLiveDigitsRef = useRef(onLiveDigits);
  onLiveDigitsRef.current = onLiveDigits;
  /** Capture is armed when live digits + save handler are both available. */
  const captureArmedRef = useRef(Boolean(liveDigitsEnabled && onCaptureRequest));
  captureArmedRef.current = Boolean(liveDigitsEnabled && onCaptureRequest);

  const {
    connectionState,
    discovered,
    latestReading,
    lastError,
    reconnectSuppressed,
    captureRequestSeq,
  } = snapshot;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void startScan()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      void stopScan().catch(() => undefined);
    };
  }, [startScan, stopScan]);

  useEffect(() => {
    if (reconnectSuppressed) return;
    if (
      connectionState === "connected" ||
      connectionState === "connecting" ||
      connectionState === "reconnecting" ||
      connectionState === "disconnecting"
    ) {
      return;
    }
    const first = discovered[0];
    if (!first) return;
    if (autoConnectAttempted.current === first.id) return;
    autoConnectAttempted.current = first.id;
    setBusy(true);
    void connect(first.id)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, [connectionState, discovered, reconnectSuppressed, connect]);

  useEffect(() => {
    if (!liveDigitsEnabled) {
      lastAppliedKey.current = null;
      return;
    }
    if (connectionState !== "connected") return;
    const reading = latestReading;
    if (!reading || reading.status !== "ok" || reading.celsius == null) return;
    const key = `${reading.measuredAt}:${reading.celsius}:${unit}`;
    if (lastAppliedKey.current === key) return;
    lastAppliedKey.current = key;
    onLiveDigits(probeCelsiusToDigits(reading.celsius, unit));
  }, [liveDigitsEnabled, connectionState, latestReading, unit, onLiveDigits]);

  // While capture is disarmed, keep the cursor current so re-arming never
  // replays an earlier probe OK as an auto-save.
  useEffect(() => {
    if (!captureArmedRef.current) {
      lastCaptureSeq.current = captureRequestSeq;
    }
  }, [liveDigitsEnabled, onCaptureRequest, captureRequestSeq]);

  // Depend only on captureRequestSeq — parent re-renders used to recreate
  // onCaptureRequest and clear the pending save timer (first press missed).
  useEffect(() => {
    if (lastCaptureSeq.current === null) {
      lastCaptureSeq.current = captureRequestSeq;
      return;
    }
    if (captureRequestSeq <= lastCaptureSeq.current) return;
    lastCaptureSeq.current = captureRequestSeq;

    let cancelled = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const trySave = () => {
      if (cancelled) return;
      if (!captureArmedRef.current || !onCaptureRequestRef.current) return;

      const reading = getSnapshot().latestReading;
      if (!reading || reading.status !== "ok" || reading.celsius == null) {
        attempts += 1;
        if (attempts < CAPTURE_MAX_ATTEMPTS) {
          retryTimer = setTimeout(trySave, CAPTURE_RETRY_MS);
        }
        return;
      }

      const nextDigits = probeCelsiusToDigits(reading.celsius, unitRef.current);
      onLiveDigitsRef.current(nextDigits);
      onCaptureRequestRef.current(nextDigits);
    };

    const initialTimer = setTimeout(trySave, CAPTURE_SAVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [captureRequestSeq, getSnapshot]);

  async function onRescan() {
    autoConnectAttempted.current = null;
    setBusy(true);
    try {
      await stopScan().catch(() => undefined);
      await startScan();
    } catch {
      // surfaced via snapshot.lastError
    } finally {
      setBusy(false);
    }
  }

  async function onConnectFirst() {
    const first = discovered[0];
    if (!first) return;
    autoConnectAttempted.current = first.id;
    setBusy(true);
    try {
      await connect(first.id);
    } catch {
      // surfaced via snapshot.lastError
    } finally {
      setBusy(false);
    }
  }

  const title = probeTitle(connectionState, discovered[0]?.name);
  const subtitle = probeSubtitle(connectionState, lastError?.message ?? null);
  const battery =
    latestReading?.batteryPercent != null
      ? `${Math.round(latestReading.batteryPercent)}%`
      : null;
  const connected = connectionState === "connected";
  const showSpinner =
    busy ||
    connectionState === "scanning" ||
    connectionState === "connecting" ||
    connectionState === "reconnecting";

  const onRowPress = () => {
    if (connected || busy) return;
    if (discovered.length > 0) void onConnectFirst();
    else void onRescan();
  };

  return (
    <Pressable
      style={[styles.card, connected && styles.cardConnected]}
      onPress={onRowPress}
      disabled={connected || busy}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.btGlyph}>ᛒ</Text>
        {connected ? (
          <View style={styles.checkBadge}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {showSpinner ? (
        <ActivityIndicator color={colors.brand} size="small" />
      ) : battery ? (
        <View style={styles.batteryCol}>
          <Text style={styles.batteryPct}>{battery}</Text>
          <Text style={styles.batteryLabel}>Battery</Text>
        </View>
      ) : !connected && discovered.length > 0 ? (
        <Text style={styles.action}>Connect</Text>
      ) : !connected ? (
        <Text style={styles.action}>Scan</Text>
      ) : null}
    </Pressable>
  );
}

function probeTitle(state: string, deviceName?: string): string {
  switch (state) {
    case "connected":
      return deviceName ? deviceName : "Thermapen ONE";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "scanning":
      return "Scanning for probe…";
    case "failed":
      return "Probe connection failed";
    case "disconnecting":
      return "Disconnecting…";
    default:
      return "Temp probe";
  }
}

function probeSubtitle(state: string, lastError: string | null): string {
  if (state === "connected") return "Connected • Signal good";
  if (state === "scanning") return "Looking for nearby probes…";
  if (state === "connecting" || state === "reconnecting") return "Please wait…";
  if (lastError) return lastError;
  if (state === "failed") return "Tap to try again";
  return "Tap to scan";
}

const styles = StyleSheet.create({
  card: {
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
  },
  cardConnected: {},
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  btGlyph: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.brand,
    marginTop: -2,
  },
  checkBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.pass,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  checkMark: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 10,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: colors.muted,
  },
  batteryCol: {
    alignItems: "flex-end",
  },
  batteryPct: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.pass,
  },
  batteryLabel: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
  },
  action: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brand,
  },
});
