import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signOut } from "../lib/auth";
import { useSession } from "../lib/session-context";
import { colors } from "../lib/theme";
import { ProbeProvider, useProbe, type ProbeSource } from "../probe/react";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function HomeMenu({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheet, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Menu</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <ProbeProvider initialSource="thermoworks">
              <ProbeSettingsSection />
            </ProbeProvider>

            <Text style={styles.sectionLabel}>App</Text>
            <MenuRow label="History" onPress={() => { onClose(); router.push("/(app)/history"); }} />
            <MenuRow label="Equipment" onPress={() => { onClose(); router.push("/(app)/equipment"); }} />

            <AccountSection onClose={onClose} />

            {__DEV__ ? (
              <>
                <Text style={styles.sectionLabel}>Developer</Text>
                <MenuRow
                  label="Probe lab"
                  onPress={() => {
                    onClose();
                    router.push("/(app)/probe-lab");
                  }}
                />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AccountSection({ onClose }: { onClose: () => void }) {
  const { setToken, setTeamId, teamId } = useSession();

  async function onSignOut() {
    await signOut();
    setToken(null);
    await setTeamId(null);
    onClose();
    router.replace("/sign-in");
  }

  return (
    <>
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.idBlock}>
        <Text style={styles.idLabel}>Workspace ID</Text>
        <Text style={styles.idValue}>{teamId ?? "—"}</Text>
      </View>
      <MenuRow
        label="Switch workspace"
        onPress={() => {
          onClose();
          void setTeamId(null).then(() => router.replace("/select-team"));
        }}
      />
      <MenuRow
        label="Sign out"
        danger
        onPress={() => {
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void onSignOut() },
          ]);
        }}
      />
    </>
  );
}

function ProbeSettingsSection() {
  const { snapshot, source, setSource, startScan, stopScan, connect, disconnect } = useProbe();
  const [busy, setBusy] = useState(false);
  const { connectionState, discovered, latestReading, lastError } = snapshot;
  const connected = connectionState === "connected";
  const battery =
    latestReading?.batteryPercent != null
      ? `${Math.round(latestReading.batteryPercent)}%`
      : null;

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
    <View style={styles.probeCard}>
      <Text style={styles.sectionLabelInCard}>Probe settings</Text>
      <Text style={styles.probeStatus}>
        {connected
          ? `Connected${discovered[0]?.name ? ` · ${discovered[0].name}` : ""}`
          : connectionState === "scanning"
            ? "Scanning…"
            : connectionState === "connecting"
              ? "Connecting…"
              : "Not connected"}
        {battery ? ` · ${battery}` : ""}
      </Text>
      {lastError ? <Text style={styles.probeError}>{lastError.message}</Text> : null}

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

      <View style={styles.probeActions}>
        <Pressable
          style={[styles.probeBtn, busy && styles.probeBtnDisabled]}
          disabled={busy}
          onPress={() => void onScan()}
        >
          {busy && connectionState === "scanning" ? (
            <ActivityIndicator color={colors.brand} size="small" />
          ) : (
            <Text style={styles.probeBtnText}>Scan</Text>
          )}
        </Pressable>
        {connected ? (
          <Pressable
            style={[styles.probeBtn, styles.probeBtnSecondary, busy && styles.probeBtnDisabled]}
            disabled={busy}
            onPress={() => void onDisconnect()}
          >
            <Text style={styles.probeBtnTextSecondary}>Disconnect</Text>
          </Pressable>
        ) : null}
      </View>

      {!connected && discovered.length > 0 ? (
        <View style={styles.deviceList}>
          {discovered.slice(0, 4).map((probe) => (
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
  );
}

function MenuRow({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Text style={[styles.menuRowLabel, danger && styles.menuRowDanger]}>{label}</Text>
      <Text style={styles.menuRowChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(11, 31, 68, 0.35)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    width: "86%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    shadowColor: "#0B1F44",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
    elevation: 8,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.ink,
  },
  closeBtn: {
    padding: 4,
  },
  closeX: {
    fontSize: 20,
    fontWeight: "500",
    color: colors.ink,
  },
  scroll: {
    paddingBottom: 24,
    gap: 4,
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  sectionLabelInCard: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 6,
  },
  probeCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 4,
  },
  probeStatus: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 10,
  },
  probeError: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.fail,
    marginBottom: 8,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  sourceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceChipOn: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  sourceChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  sourceChipTextOn: {
    color: colors.brandDark,
  },
  probeActions: {
    flexDirection: "row",
    gap: 8,
  },
  probeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  probeBtnSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  probeBtnDisabled: {
    opacity: 0.5,
  },
  probeBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.brandDark,
  },
  probeBtnTextSecondary: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
  },
  deviceList: {
    marginTop: 10,
    gap: 6,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  deviceAction: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.brand,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  menuRowDanger: {
    color: colors.fail,
  },
  menuRowChevron: {
    fontSize: 20,
    color: colors.muted,
    fontWeight: "300",
  },
  idBlock: {
    backgroundColor: colors.surfaceDark,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 4,
  },
  idLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  idValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: colors.ink,
  },
});
