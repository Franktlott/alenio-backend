import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import WebView, { WebViewNavigation } from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { useSession } from "@/lib/auth/use-session";

// Injected into Daily's WebView:
// 1. Hides Daily branding
// 2. Listens for the leave event and notifies React Native
const INJECTED_JS = `
(function() {
  // Hide Daily branding via CSS
  var style = document.createElement('style');
  style.textContent = \`
    .powered-by-daily,
    .daily-logo,
    [class*="branding"],
    [class*="Branding"],
    [class*="DailyLogo"],
    [class*="daily-logo"] { display: none !important; }
    body, html { background: #000 !important; }
  \`;
  document.head.appendChild(style);

  // Listen for Daily leave events (prebuilt fires these on window)
  function notifyLeave() {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'left-meeting' }));
    }
  }

  // Daily prebuilt custom events
  window.addEventListener('daily:left-meeting', notifyLeave);

  // Intercept Daily call object if available
  function watchCallObject() {
    if (window.DailyIframe) {
      try {
        var frames = document.querySelectorAll('iframe');
        frames.forEach(function(f) {
          try { f.contentWindow.addEventListener('daily:left-meeting', notifyLeave); } catch(e) {}
        });
      } catch(e) {}
    }
  }

  // Re-apply styles and watch for leave on DOM changes
  var obs = new MutationObserver(function() {
    if (!document.head.contains(style)) document.head.appendChild(style);
    watchCallObject();
  });
  obs.observe(document.body || document.documentElement, { childList: true, subtree: true });

  watchCallObject();
})();
true;
`;

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const { data: session } = useSession();
  const userName = session?.user?.name ?? "Guest";

  const [loading, setLoading] = useState(true);
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roomUrlRef = useRef<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
        const res = await fetch(`${baseUrl}/api/video/room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, userName }),
        });
        const json = await res.json();
        if (!res.ok || !json.data?.url) {
          setError("Could not start call. Please try again.");
          return;
        }
        const { url, token } = json.data;
        const finalUrl = token ? `${url}?t=${token}` : url;
        roomUrlRef.current = url;
        setCallUrl(finalUrl);
      } catch {
        setError("Could not connect. Please try again.");
      }
    }
    fetchRoom();
  }, [roomId, userName]);

  // Detect when user navigates away from the Daily room (leave button clicked)
  function handleNavigationChange(navState: WebViewNavigation) {
    const base = roomUrlRef.current;
    if (!base) return;
    const currentHost = new URL(base).hostname;
    try {
      const navHost = new URL(navState.url).hostname;
      if (navHost !== currentHost) {
        router.back();
      }
    } catch {
      // ignore parse errors
    }
  }

  // Handle messages from injected JS (leave event)
  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "left-meeting") {
        router.back();
      }
    } catch {
      // ignore
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar hidden />

      {error ? (
        <View style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "white", textAlign: "center", paddingHorizontal: 24, marginBottom: 16 }}>
            {error}
          </Text>
          <TouchableOpacity
            testID="error-back-button"
            onPress={() => router.back()}
            style={{ backgroundColor: "#EF4444", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : !callUrl ? (
        <View
          testID="loading-room"
          style={{ flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color="white" size="large" />
          <Text style={{ color: "white", marginTop: 12, fontSize: 14 }}>Starting call...</Text>
        </View>
      ) : (
        <>
          {loading ? (
            <View
              style={{
                position: "absolute",
                inset: 0,
                top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: "#0F172A",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              <ActivityIndicator color="white" size="large" />
              <Text style={{ color: "white", marginTop: 12, fontSize: 14 }}>
                Joining as {userName}...
              </Text>
            </View>
          ) : null}
          <WebView
            ref={webViewRef}
            testID="daily-webview"
            source={{ uri: callUrl }}
            onLoadEnd={() => setLoading(false)}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            style={{ flex: 1, backgroundColor: "#000000" }}
            injectedJavaScript={INJECTED_JS}
            injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavigationChange}
            onShouldStartLoadWithRequest={(request) => {
              return request.url.startsWith("http://") || request.url.startsWith("https://");
            }}
          />
        </>
      )}
    </View>
  );
}
