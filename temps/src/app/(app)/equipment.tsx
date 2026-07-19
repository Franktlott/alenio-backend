import { useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppTabHeader } from "../../components/AppTabHeader";
import { colors } from "../../lib/theme";
import { useProbe, type ProbeSource } from "../../probe/react";

export default function EquipmentScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { snapshot, source, setSource, startScan, stopScan, connect, disconnect } = useProbe();
  const [busy, setBusy] = useState(false);
  const { connectionState, discovered, latestReading, lastError } = snapshot;
  const connected = connectionState === "connected";
  const battery =
    latestReading?.batteryPercent != null
      ? `${Math.round(latestReading.batteryPercent)}%`
      : null;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    return () => {
      void stopScan().catch(() => undefined);
    };
  }, [stopScan]);

  async function onScan() {
    setBusy(true);
    try {
      await stopScan().catch(() => undefined);
      await startScan();
    } catch (err) {
      Alert.alert("Scan failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onConnect(id: string) {
    setBusy(true);
    try {
      await connect(id);
    } catch (err) {
      Alert.alert("Connect failed", err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await disconnect();
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  }

  function onPickSource(next: ProbeSource) {
    if (next === source) return;
    setSource(next);
  }

  return (
    <View style={styles.screen}>
      <AppTabHeader topInset={insets.top} testID="temps-equipment-header" />
      <View style={styles.body}>
        <Text style={styles.title}>Equipment</Text>
        <Text style={styles.sub}>
          Probe connection is shared across Today and checks — connect once, use everywhere.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Probe</Text>
          <Text style={styles.status}>
            {connected
              ? `Connected${discovered[0]?.name ? ` · ${discovered[0].name}` : ""}`
              : connectionState === "scanning"
                ? "Scanning…"
                : connectionState === "connecting"
                  ? "Connecting…"
                  : "Not connected"}
            {battery ? ` · ${battery}` : ""}
          </Text>
          {lastError ? <Text style={styles.error}>{lastError.message}</Text> : null}

          <View style={styles.sourceRow}>
            {(["thermoworks", "mock"] as const).map((name) => {
              if (name === "mock" && !__DEV__) return null;
              const on = source === name;
              return (
                <Pressable
                  key={name}
                  style={[styles.sourceChip, on && styles.sourceChipOn]}
                  onPress={() => onPickSource(name)}
                >
                  <Text style={[styles.sourceChipText, on && styles.sourceChipTextOn]}>
                    {name === "thermoworks" ? "ThermoWorks" : "Mock"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void onScan()}
            >
              {busy && connectionState === "scanning" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>Scan</Text>
              )}
            </Pressable>
            {connected ? (
              <Pressable
                style={[styles.btn, styles.btnSecondary, busy && styles.btnDisabled]}
                disabled={busy}
                onPress={() => void onDisconnect()}
              >
                <Text style={styles.btnTextSecondary}>Disconnect</Text>
              </Pressable>
            ) : null}
          </View>

          {!connected && discovered.length > 0 ? (
            <View style={styles.deviceList}>
              {discovered.slice(0, 6).map((probe) => (
                <Pressable
                  key={probe.id}
                  style={styles.deviceRow}
                  disabled={busy}
                  onPress={() => void onConnect(probe.id)}
                >
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {probe.name}
                  </Text>
                  <Text style={styles.deviceAction}>Connect</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.inkOnDark,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "500",
    color: colors.mutedOnDark,
    lineHeight: 18,
  },
  card: {
    marginTop: 18,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.mutedOnDark,
    letterSpacing: 0.06,
    textTransform: "uppercase",
  },
  status: { fontSize: 15, fontWeight: "700", color: colors.inkOnDark },
  error: { fontSize: 12, color: "#fca5a5", fontWeight: "600" },
  sourceRow: { flexDirection: "row", gap: 8 },
  sourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sourceChipOn: { backgroundColor: colors.brand },
  sourceChipText: { fontSize: 12, fontWeight: "700", color: colors.mutedOnDark },
  sourceChipTextOn: { color: "#fff" },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    minWidth: 88,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: "center",
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  btnTextSecondary: { color: colors.inkOnDark, fontWeight: "700", fontSize: 13 },
  deviceList: { gap: 6, marginTop: 4 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  deviceName: { flex: 1, color: colors.inkOnDark, fontWeight: "600", fontSize: 13 },
  deviceAction: { color: colors.brand, fontWeight: "800", fontSize: 12 },
});
