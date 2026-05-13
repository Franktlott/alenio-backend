import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { isStripePortalEmbedUrl } from "@/lib/subscription-billing";

type Props = {
  visible: boolean;
  url: string | null;
  onClose: () => void;
};

/**
 * Secure billing portal: HTTPS Stripe (and stripe.*) only; no arbitrary URLs.
 */
export function BillingPortalWebViewModal({ visible, url, onClose }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const [loading, setLoading] = useState(true);

  const onNavChange = useCallback(
    (navUrl: string) => {
      if (!isStripePortalEmbedUrl(navUrl)) {
        return false;
      }
      return true;
    },
    [],
  );

  const safeUrl = url && isStripePortalEmbedUrl(url) ? url : null;
  const open = !!(visible && safeUrl);

  useEffect(() => {
    if (open) setLoading(true);
  }, [open, safeUrl]);

  if (!open) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? "#0f172a" : "#fff" }]} edges={["top"]}>
        <View style={[styles.header, { borderBottomColor: isDark ? "#334155" : "#e2e8f0" }]}>
          <Text style={[styles.title, { color: isDark ? "#f8fafc" : "#0f172a" }]}>Manage subscription</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Close billing portal"
            testID="billing-portal-close"
          >
            <X size={22} color={isDark ? "#e2e8f0" : "#64748b"} />
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color="#4361EE" />
            <Text style={[styles.loaderText, { color: isDark ? "#94a3b8" : "#64748b" }]}>Loading secure billing…</Text>
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: "700" },
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
