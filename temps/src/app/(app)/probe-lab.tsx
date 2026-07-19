import { Redirect } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Muted, PrimaryButton, Screen, Title } from "../../components/ui";
import { colors } from "../../lib/theme";
import {
  getDiagnostics,
  isAvailable as isThermoworksAvailable,
  type ThermoworksDiagnostics,
} from "../../probe/adapters/thermoworks/ThermoworksNative";
import { SCENARIOS, type MockScenarioName } from "../../probe/mock";
import { ProbeProvider, useProbe, type ProbeSource } from "../../probe/react";

/**
 * Development-only harness for the vendor-neutral probe system.
 * Hidden from production: __DEV__ gate + not shown in tab bar.
 */
export default function ProbeLabRoute() {
  if (!__DEV__) {
    return <Redirect href="/(app)/today" />;
  }

  return (
    <ProbeProvider initialSource="thermoworks">
      <ProbeLabScreen />
    </ProbeProvider>
  );
}

function ProbeLabScreen() {
  const {
    source,
    setSource,
    snapshot,
    scenarios,
    startScan,
    stopScan,
    connect,
    disconnect,
    setScenario,
    getScenarioName,
  } = useProbe();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState<MockScenarioName>(getScenarioName());
  const [twDiag, setTwDiag] = useState<ThermoworksDiagnostics | null>(null);

  useEffect(() => {
    void getDiagnostics().then(setTwDiag);
  }, [source, snapshot.connectionState, snapshot.discovered.length]);

  useEffect(() => {
    setSelectedId(null);
    setMessage(`Source: ${source}`);
    setScenarioName(getScenarioName());
  }, [source, getScenarioName]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage(label);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onScenario(name: MockScenarioName) {
    setScenario(name);
    setScenarioName(name);
    setSelectedId(null);
    setMessage(`Scenario: ${SCENARIOS[name].label}`);
    void startScan().catch(() => undefined);
  }

  function onSource(next: ProbeSource) {
    setSource(next);
  }

  return (
    <Screen style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} testID="probe-lab-screen">
        <Title>Probe Lab</Title>
        <Muted>
          Phase 3C: ThermoWorks scan, connect, and live Celsius readings via ProbeSession. Manual
          disconnect suppresses reconnect. Thermapen / TempTest may need a button press to transmit.
        </Muted>

        <Section label="Source">
          <View style={styles.chipRow}>
            {(["thermoworks", "mock"] as const).map((name) => {
              const active = source === name;
              return (
                <Pressable
                  key={name}
                  testID={`source-${name}`}
                  onPress={() => onSource(name)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {name === "thermoworks" ? "ThermoWorks" : "Mock"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {source === "thermoworks" ? (
          <Section label="ThermoWorks native">
            <Muted>
              Power on Thermapen ONE Blue or TempTest Blue, Start scan, select device, Connect.
              Check Xcode for [AlenioThermoworks] logs.
            </Muted>
            <KV k="js isAvailable()" v={isThermoworksAvailable() ? "yes" : "no"} />
            <KV k="native available" v={twDiag ? (twDiag.available ? "yes" : "no") : "…"} />
            <KV k="initialized" v={twDiag ? (twDiag.initialized ? "yes" : "no") : "…"} />
            <KV k="sdkVersion" v={twDiag?.sdkVersion ?? "—"} />
            <KV
              k="bluetoothAvailable"
              v={twDiag ? (twDiag.bluetoothAvailable ? "yes" : "no") : "…"}
            />
            <KV k="native connectedDeviceId" v={twDiag?.connectedDeviceId ?? "—"} />
            <KV k="platform" v={twDiag?.platform ?? "—"} />
            <KV k="error" v={twDiag?.error ?? "—"} />
          </Section>
        ) : (
          <Section label="Mock scenario">
            <View style={styles.chipRow}>
              {scenarios.map((name) => {
                const active = name === scenarioName;
                return (
                  <Pressable
                    key={name}
                    testID={`scenario-${name}`}
                    onPress={() => onScenario(name)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {SCENARIOS[name].label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{SCENARIOS[scenarioName].description}</Text>
          </Section>
        )}

        <Section label="Actions">
          <PrimaryButton
            label="Start scan"
            disabled={busy}
            onPress={() => void run("Scanning", () => startScan())}
          />
          <PrimaryButton
            label="Stop scan"
            disabled={busy}
            onPress={() => void run("Scan stopped", () => stopScan())}
          />
          <PrimaryButton
            label="Connect selected"
            disabled={busy || !selectedId}
            onPress={() => void run("Connect requested", () => connect(selectedId!))}
          />
          <PrimaryButton
            label="Manual disconnect"
            disabled={busy}
            onPress={() => void run("Manual disconnect", () => disconnect())}
          />
        </Section>

        <Section label="Discovered">
          {snapshot.discovered.length === 0 ? (
            <Text style={styles.hint}>
              No probes yet. Start scan (and power on the Thermapen or TempTest Blue).
            </Text>
          ) : (
            snapshot.discovered.map((probe) => {
              const selected = selectedId === probe.id;
              return (
                <Pressable
                  key={probe.id}
                  testID={`probe-${probe.id}`}
                  onPress={() => setSelectedId(probe.id)}
                  style={[styles.probeRow, selected && styles.probeRowSelected]}
                >
                  <Text style={styles.probeName}>{probe.name}</Text>
                  <Text style={styles.hint}>{probe.id}</Text>
                  {probe.rssi != null ? (
                    <Text style={styles.hint}>rssi={probe.rssi}</Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </Section>

        <Section label="Connection status">
          <KV k="connection" v={snapshot.connectionState} />
          <KV k="connectedProbeId" v={snapshot.connectedProbeId ?? "—"} />
          <KV k="selectedId" v={selectedId ?? "—"} />
          <KV k="reconnectAttempt" v={String(snapshot.reconnectAttempt)} />
          <KV
            k="reconnectSuppressed"
            v={snapshot.reconnectSuppressed ? "yes" : "no"}
          />
          <KV
            k="lastError"
            v={
              snapshot.lastError
                ? `${snapshot.lastError.code}: ${snapshot.lastError.message}`
                : "—"
            }
          />
          {message ? <KV k="lastAction" v={message} /> : null}
        </Section>

        <Section label="Latest reading (°C)">
          {snapshot.latestReading ? (
            <>
              <KV k="status" v={snapshot.latestReading.status} />
              <KV
                k="celsius"
                v={
                  snapshot.latestReading.celsius == null
                    ? "null"
                    : String(snapshot.latestReading.celsius)
                }
              />
              <KV
                k="measuredAt"
                v={new Date(snapshot.latestReading.measuredAt).toISOString()}
              />
              <KV k="sequence" v={String(snapshot.latestReading.sequence ?? "—")} />
              <KV k="sensorId" v={snapshot.latestReading.sensorId ?? "—"} />
              <KV
                k="batteryPercent"
                v={
                  snapshot.latestReading.batteryPercent == null
                    ? "—"
                    : String(snapshot.latestReading.batteryPercent)
                }
              />
            </>
          ) : (
            <Text style={styles.hint}>
              {source === "thermoworks"
                ? "No reading yet. Stay connected; press the probe button if it only transmits on measure."
                : "No reading yet."}
            </Text>
          )}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.k}>{k}</Text>
      <Text style={styles.v}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 40, gap: 4 },
  section: { marginTop: 16, gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  chipText: { fontSize: 12, color: colors.ink, fontWeight: "600" },
  chipTextActive: { color: colors.brandDark },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  probeRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  probeRowSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.probeBg,
  },
  probeName: { fontWeight: "700", color: colors.ink },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  k: { fontSize: 13, color: colors.muted, flexShrink: 0 },
  v: { fontSize: 13, color: colors.ink, fontWeight: "600", flex: 1, textAlign: "right" },
});
