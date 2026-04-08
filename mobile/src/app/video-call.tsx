import React, { useRef, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar, StyleSheet, Image } from "react-native";
import WebView, { WebViewNavigation } from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { useSession } from "@/lib/auth/use-session";

const alenioLogo = require("@/assets/alenio-logo-white.png");

// Skins Daily's prebuilt UI to match Alenio and auto-exits on meeting end/error
const INJECTED_JS = `
(function() {
  var PRIMARY = '#4361EE';
  var PRIMARY_DARK = '#2D4ED8';
  var BG = '#0A0F1E';
  var SURFACE = '#111827';
  var SURFACE2 = '#1E293B';
  var BORDER = 'rgba(255,255,255,0.08)';

  function postLeave() {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'left-meeting' }));
  }

  function injectStyles() {
    var id = '__alenio_styles__';
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = \`
      /* ── Base ── */
      *, *::before, *::after { box-sizing: border-box; }
      body, html { background: \${BG} !important; color: #fff !important; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif !important; }

      /* ── Pre-join lobby card ── */
      [class*="prejoin"], [class*="Prejoin"],
      [class*="lobby"], [class*="Lobby"],
      [class*="HairCheck"], [class*="haircheck"] {
        background: \${BG} !important;
      }
      [class*="card"], [class*="Card"],
      [class*="modal-content"], [class*="ModalContent"],
      [class*="prejoin-container"], [class*="PrejoinContainer"] {
        background: \${SURFACE} !important;
        border: 1px solid \${BORDER} !important;
        border-radius: 20px !important;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6) !important;
        color: #fff !important;
      }

      /* ── All text white ── */
      [class*="card"] *, [class*="Card"] *,
      [class*="prejoin"] *, [class*="Prejoin"] * {
        color: #fff !important;
      }

      /* ── Inputs ── */
      input, select, textarea {
        background: \${SURFACE2} !important;
        border: 1px solid \${BORDER} !important;
        border-radius: 10px !important;
        color: #fff !important;
      }

      /* ── Primary / Join button ── */
      button[class*="join"], button[class*="Join"],
      button[class*="primary"], button[class*="Primary"],
      [class*="joinButton"], [class*="JoinButton"],
      button[data-testid*="join"], button[data-testid*="Join"] {
        background: \${PRIMARY} !important;
        background-image: none !important;
        border: none !important;
        border-radius: 14px !important;
        color: #fff !important;
        font-weight: 600 !important;
        letter-spacing: 0.3px !important;
        box-shadow: 0 4px 20px rgba(67,97,238,0.4) !important;
        transition: background 0.15s !important;
      }
      button[class*="join"]:active, button[class*="Join"]:active { background: \${PRIMARY_DARK} !important; }

      /* ── Secondary / icon buttons ── */
      button[class*="tray"], button[class*="Tray"],
      [class*="controlButton"], [class*="ControlButton"],
      [class*="tray-button"], [class*="TrayButton"] {
        background: rgba(255,255,255,0.1) !important;
        border: 1px solid \${BORDER} !important;
        border-radius: 50% !important;
        color: #fff !important;
      }
      button[class*="leave"], button[class*="Leave"],
      [class*="leaveButton"], [class*="LeaveButton"] {
        background: #EF4444 !important;
        border-radius: 50% !important;
        color: #fff !important;
      }

      /* ── Toolbar / tray ── */
      [class*="tray"], [class*="Tray"],
      [class*="controls"], [class*="Controls"],
      [class*="toolbar"], [class*="Toolbar"] {
        background: rgba(10,15,30,0.92) !important;
        border-top: 1px solid \${BORDER} !important;
        backdrop-filter: blur(20px) !important;
      }

      /* ── Video tiles ── */
      [class*="tile"], [class*="Tile"],
      [class*="participant"], [class*="Participant"],
      [class*="video-container"], [class*="VideoContainer"] {
        background: \${SURFACE} !important;
        border-radius: 16px !important;
        overflow: hidden !important;
        border: 1px solid \${BORDER} !important;
      }

      /* ── Name tags ── */
      [class*="name-tag"], [class*="NameTag"],
      [class*="displayName"], [class*="DisplayName"] {
        background: rgba(10,15,30,0.75) !important;
        border-radius: 8px !important;
        color: #fff !important;
        padding: 2px 8px !important;
        font-size: 12px !important;
      }

      /* ── Hide Daily branding / header logo ── */
      .powered-by-daily, .daily-logo,
      [class*="DailyLogo"], [class*="dailyLogo"],
      [class*="branding"], [class*="Branding"],
      [class*="watermark"], [class*="Watermark"],
      a[href*="daily.co"] { display: none !important; }

      /* ── Error / ended state card ── */
      [class*="error"], [class*="Error"],
      [class*="ended"], [class*="Ended"] {
        background: \${SURFACE} !important;
        border-radius: 20px !important;
        color: #fff !important;
      }
    \`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── Auto-detect end/error states ──
  function checkEndState() {
    var text = (document.body || {}).innerText || '';
    var shouldLeave =
      (text.includes('meeting') && text.includes('does not exist')) ||
      text.includes('This call has ended') ||
      text.includes("You've left") ||
      text.includes('left the meeting') ||
      text.includes('Thank you for joining') ||
      text.includes('You left the call') ||
      text.includes('call has been ended');
    if (shouldLeave) postLeave();
  }

  // ── Daily event listeners ──
  window.addEventListener('daily:left-meeting', postLeave);
  window.addEventListener('daily:call-instance-destroyed', postLeave);

  // ── Start observing ──
  function startObserver() {
    injectStyles();
    checkEndState();
    var obs = new MutationObserver(function() {
      injectStyles();
      checkEndState();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // Fallback checks
  setTimeout(checkEndState, 1500);
  setTimeout(checkEndState, 4000);
  setTimeout(checkEndState, 8000);
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
  const roomHostRef = useRef<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const didLeave = useRef(false);

  const goBack = useCallback(() => {
    if (didLeave.current) return;
    didLeave.current = true;
    router.back();
  }, []);

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
        try { roomHostRef.current = new URL(url).hostname; } catch {}
        setCallUrl(token ? `${url}?t=${token}` : url);
      } catch {
        setError("Could not connect. Please try again.");
      }
    }
    fetchRoom();
  }, [roomId, userName]);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "left-meeting") goBack();
    } catch {}
  }

  function handleNavigationChange(navState: WebViewNavigation) {
    const host = roomHostRef.current;
    if (!host) return;
    try {
      const navHost = new URL(navState.url).hostname;
      // Navigate back if we land somewhere outside the Daily domain
      if (navHost && navHost !== host) goBack();
    } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0A0F1E" }}>
      <StatusBar hidden />

      {error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Image source={alenioLogo} style={{ width: 120, height: 40, marginBottom: 32 }} resizeMode="contain" />
          <Text style={{ color: "white", textAlign: "center", fontSize: 16, marginBottom: 20 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={goBack}
            style={{
              backgroundColor: "#4361EE",
              paddingHorizontal: 28,
              paddingVertical: 14,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600", fontSize: 16 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : !callUrl ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Image source={alenioLogo} style={{ width: 120, height: 40, marginBottom: 32 }} resizeMode="contain" />
          <ActivityIndicator color="#4361EE" size="large" />
          <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 14, fontSize: 14 }}>
            Starting call...
          </Text>
        </View>
      ) : (
        <>
          {loading ? (
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: "#0A0F1E",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              <Image source={alenioLogo} style={{ width: 120, height: 40, marginBottom: 32 }} resizeMode="contain" />
              <ActivityIndicator color="#4361EE" size="large" />
              <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 14, fontSize: 14 }}>
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
            style={{ flex: 1, backgroundColor: "#0A0F1E" }}
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


