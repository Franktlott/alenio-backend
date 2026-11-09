import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { isBillingWebViewUrl, billingFlowCompleteFromUrl } from "@/lib/subscription-billing";

type Props = {
  visible: boolean;
  url: string | null;
  workspaceName?: string | null;
  onClose: () => void;
  onFlowComplete?: (result: "success" | "cancel") => void;
};

/**
 * Secure billing portal: approved HTTPS billing hosts only; no arbitrary URLs.
 */
export function BillingPortalWebViewModal({
  visible,
  url,
  workspaceName,
  onClose,
  onFlowComplete,
}: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const [loading, setLoading] = useState(true);

  const onNavChange = useCallback(
    (navUrl: string) => {
      const complete = billingFlowCompleteFromUrl(navUrl);
      if (complete) {
        onFlowComplete?.(complete);
        onClose();
        return false;
      }
      return isBillingWebViewUrl(navUrl);
    },
    [onClose, onFlowComplete],
  );

  const safeUrl = url && isBillingWebViewUrl(url) ? url : null;
  const open = !!(visible && safeUrl);

  useEffect(() => {
    if (open) setLoading(true);
  }, [open, safeUrl]);

  if (!open) return null;

  const workplaceLabel = workspaceName?.trim() || null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? "#0f172a" : "#fff" }]} edges={["top"]}>
        <View style={[styles.header, { borderBottomColor: isDark ? "#334155" : "#e2e8f0" }]}>
          <View style={[styles.handle, { backgroundColor: isDark ? "#475569" : "#CBD5E1" }]} />
          <View style={styles.headerRow}>
            <Image
              source={require("@/assets/alenio-icon.png")}
              style={styles.logo}
            />
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: isDark ? "#f8fafc" : "#0f172a" }]}>
                Manage subscription
              </Text>
              {workplaceLabel ? (
                <Text
                  style={[styles.subtitle, { color: isDark ? "#94a3b8" : "#64748b" }]}
                  numberOfLines={2}
                  testID="billing-portal-workspace-name"
                >
                  {workplaceLabel}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close billing portal"
              testID="billing-portal-close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={isDark ? "#e2e8f0" : "#64748b"} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.webHost}>
          {loading ? (
            <View style={styles.loader} pointerEvents="none">
              <ActivityIndicator size="large" color="#4361EE" />
              <Text style={[styles.loaderText, { color: isDark ? "#94a3b8" : "#64748b" }]}>
                {workplaceLabel ? `Loading billing for ${workplaceLabel}…` : "Loading secure billing…"}
              </Text>
            </View>
          ) : null}
          <WebView
            source={{ uri: safeUrl }}
            style={styles.web}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(req) => onNavChange(req.url)}
            originWhitelist={["https://*"]}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingTop: 7,
    paddingBottom: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
  },
  logo: { width: 34, height: 34, borderRadius: 9 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: "800", letterSpacing: -0.25 },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  webHost: { flex: 1, position: "relative" },
  web: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(248,250,252,0.92)",
    zIndex: 2,
  },
  loaderText: { marginTop: 12, fontSize: 14 },
});
