import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import { useKeepAwake } from "expo-keep-awake";
import {
  clearLinkedKiosk,
  loadLinkedKiosk,
  saveLinkedKiosk,
  type LinkedKioskWorkspace,
} from "../lib/kiosk-storage";
import {
  isAllowedKioskUrl,
  kioskEntryUrl,
  parseHubTokenFromUrl,
  SYNC_LINKED_WORKSPACE_JS,
} from "../lib/kiosk-url";
import {
  readCachedMockPush,
  registerMockDevicePush,
  type MockPushStatus,
} from "../lib/kiosk-push-mock";

type WebMessage =
  | { type: "workspace-linked"; hubToken: string; teamName: string }
  | { type: string };

export function KioskShell() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [linked, setLinked] = useState<LinkedKioskWorkspace | null>(null);
  const [booting, setBooting] = useState(true);
  const [pageLoading, setPageLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState<MockPushStatus>({
    state: "unsupported",
    detail: "Not registered yet.",
  });
  const [reloadKey, setReloadKey] = useState(0);

  const entryUrl = useMemo(() => kioskEntryUrl(linked?.hubToken), [linked?.hubToken, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadLinkedKiosk();
      if (!cancelled) {
        setLinked(saved);
        setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void readCachedMockPush().then(setPushStatus);
  }, []);

  const syncLinkedFromWeb = useCallback(() => {
    webRef.current?.injectJavaScript(SYNC_LINKED_WORKSPACE_JS);
  }, []);

  const onNavigationChange = useCallback(
    (event: WebViewNavigation) => {
      const hubToken = parseHubTokenFromUrl(event.url);
      if (!hubToken) return;
      if (linked?.hubToken === hubToken) return;
      void saveLinkedKiosk(hubToken, linked?.teamName).then(() => {
        setLinked((prev) => ({ hubToken, teamName: prev?.teamName ?? null }));
      });
      syncLinkedFromWeb();
    },
    [linked?.hubToken, linked?.teamName, syncLinkedFromWeb],
  );

  const onWebMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as WebMessage;
      if (payload.type !== "workspace-linked") return;
      const msg = payload as { type: "workspace-linked"; hubToken: string; teamName: string };
      if (!msg.hubToken || !msg.teamName) return;
      void saveLinkedKiosk(msg.hubToken, msg.teamName).then(() => {
        setLinked({ hubToken: msg.hubToken, teamName: msg.teamName });
        void registerMockDevicePush().then(setPushStatus);
      });
    } catch {
      /* ignore non-JSON messages */
    }
  }, []);

  const reloadKiosk = useCallback(() => {
    setPageLoading(true);
    setReloadKey((n) => n + 1);
  }, []);

  const disconnectWorkspace = useCallback(() => {
    void clearLinkedKiosk().then(() => {
      setLinked(null);
      setSettingsOpen(false);
      reloadKiosk();
    });
  }, [reloadKiosk]);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" }}>
        <ActivityIndicator color="#818CF8" size="large" />
        <Text style={{ marginTop: 14, color: "#CBD5E1", fontWeight: "600" }}>Starting Alenio Go…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 8,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#111827",
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148, 163, 184, 0.2)",
        }}
      >
        <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.8 }}>
            ALENIO GO · MOCK WRAPPER
          </Text>
          <Text style={{ marginTop: 2, fontSize: 15, fontWeight: "700", color: "#F8FAFC" }} numberOfLines={1}>
            {linked?.teamName ?? "Link this tablet to a workspace"}
          </Text>
        </View>
        <Pressable
          onPress={() => setSettingsOpen(true)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: "rgba(99, 102, 241, 0.18)",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityLabel="Kiosk settings"
        >
          <Text style={{ color: "#C7D2FE", fontSize: 16, fontWeight: "700" }}>⚙</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, position: "relative" }}>
        {pageLoading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color="#818CF8" size="large" />
            <Text style={{ marginTop: 12, color: "#94A3B8", fontWeight: "600" }}>
              {linked ? "Opening floor dashboard…" : "Opening workspace link…"}
            </Text>
          </View>
        ) : null}

        <WebView
          key={`${entryUrl}-${reloadKey}`}
          ref={webRef}
          source={{ uri: entryUrl }}
          style={{ flex: 1, backgroundColor: "#0F172A" }}
          onLoadStart={() => setPageLoading(true)}
          onLoadEnd={() => {
            setPageLoading(false);
            syncLinkedFromWeb();
          }}
          onNavigationStateChange={onNavigationChange}
          onMessage={onWebMessage}
          onShouldStartLoadWithRequest={(req) => isAllowedKioskUrl(req.url)}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures={false}
          setSupportMultipleWindows={false}
          originWhitelist={["https://*"]}
        />
      </View>

      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "flex-end" }}
          onPress={() => setSettingsOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 20,
                paddingTop: 18,
                paddingBottom: Math.max(insets.bottom, 18),
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Kiosk shell</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: "#64748B", lineHeight: 18 }}>
                This mock native wrapper hosts your existing Alenio Go web kiosk. Screen stay-awake is enabled.
              </Text>

              <View style={{ marginTop: 16, gap: 10 }}>
                <SettingsRow label="Workspace" value={linked?.teamName ?? "Not linked"} />
                <SettingsRow
                  label="Push alerts (mock)"
                  value={
                    pushStatus.state === "ready"
                      ? "Token registered locally"
                      : pushStatus.state === "denied"
                        ? "Permission denied"
                        : pushStatus.detail
                  }
                />
              </View>

              <View style={{ marginTop: 18, gap: 10 }}>
                <ActionButton label="Reload kiosk" onPress={reloadKiosk} />
                <ActionButton
                  label="Register mock push token"
                  onPress={() => void registerMockDevicePush().then(setPushStatus)}
                />
                {linked ? (
                  <ActionButton label="Disconnect workspace" tone="danger" onPress={disconnectWorkspace} />
                ) : null}
                <ActionButton label="Close" tone="ghost" onPress={() => setSettingsOpen(false)} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E2E8F0",
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
      <Text style={{ marginTop: 4, fontSize: 14, fontWeight: "600", color: "#0F172A" }}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "danger" | "ghost";
}) {
  const backgroundColor = tone === "danger" ? "#FEF2F2" : tone === "ghost" ? "#F8FAFC" : "#EEF2FF";
  const color = tone === "danger" ? "#B91C1C" : tone === "ghost" ? "#64748B" : "#4338CA";
  const borderColor = tone === "danger" ? "#FECACA" : tone === "ghost" ? "#E2E8F0" : "#C7D2FE";

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.92)",
  },
});
