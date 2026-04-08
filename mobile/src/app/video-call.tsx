import React, { useRef, useState, useEffect, useCallback } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StatusBar, StyleSheet, Image, Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import { ChevronLeft, VideoOff, Video, Mic, MicOff, Volume2, VolumeX, Users, PhoneOff, MoreHorizontal } from "lucide-react-native";
import { useSession } from "@/lib/auth/use-session";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";

const alenioLogo = require("@/assets/alenio-logo-white.png");

type Phase = "loading" | "prejoin" | "incall" | "error";

// Inject only CSS styles — runs before content loads, no auto-join logic
function buildPreloadJS() {
  return `
(function() {
  var PRIMARY = '#4361EE';
  var BG = '#0A0F1E';
  var SURFACE = '#111827';
  var BORDER = 'rgba(255,255,255,0.08)';

  function injectStyles() {
    var id = '__alenio__';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = \`
      body,html{background:\${BG}!important;color:#fff!important;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif!important;}
      [class*="prejoin"],[class*="Prejoin"],[class*="lobby"],[class*="Lobby"],[class*="HairCheck"]{background:\${BG}!important;}
      [class*="card"],[class*="Card"],[class*="modal-content"]{background:\${SURFACE}!important;border:1px solid \${BORDER}!important;border-radius:20px!important;color:#fff!important;}
      [class*="card"] *,[class*="Card"] *,[class*="prejoin"] *{color:#fff!important;}
      input,select{background:#1E293B!important;border:1px solid \${BORDER}!important;border-radius:10px!important;color:#fff!important;}
      button[class*="join"],button[class*="Join"],[class*="joinButton"]{background:\${PRIMARY}!important;border:none!important;border-radius:14px!important;color:#fff!important;font-weight:600!important;box-shadow:0 4px 20px rgba(67,97,238,0.4)!important;}
      [class*="tray"],[class*="Tray"],[class*="controls"],[class*="Controls"],[class*="toolbar"]{background:rgba(10,15,30,0.95)!important;border-top:1px solid \${BORDER}!important;}
      button[class*="tray"],button[class*="Tray"],[class*="controlButton"]{background:rgba(255,255,255,0.1)!important;border:1px solid \${BORDER}!important;border-radius:50%!important;color:#fff!important;}
      button[class*="leave"],button[class*="Leave"],[class*="leaveButton"]{background:#EF4444!important;border-radius:16px!important;color:#fff!important;}
      [class*="tile"],[class*="Tile"],[class*="participant"],[class*="video-container"]{background:\${SURFACE}!important;border-radius:16px!important;border:1px solid \${BORDER}!important;}
      [class*="name-tag"],[class*="NameTag"],[class*="displayName"]{background:rgba(10,15,30,0.8)!important;border-radius:8px!important;color:#fff!important;padding:2px 8px!important;}
      .powered-by-daily,.daily-logo,[class*="DailyLogo"],[class*="branding"],[class*="watermark"],a[href*="daily.co"]{display:none!important;}
    \`;
    (document.head||document.documentElement).appendChild(s);
  }

  function start() {
    injectStyles();
    var obs = new MutationObserver(function(){ injectStyles(); });
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',start) : start();
})();
true;
`;
}

// Auto-skip Daily's pre-join + apply Alenio dark theme + leave detection
function buildInjectedJS(micOn: boolean, videoOn: boolean) {
  return `
(function() {
  var PRIMARY = '#4361EE';
  var BG = '#0A0F1E';
  var SURFACE = '#111827';
  var BORDER = 'rgba(255,255,255,0.08)';

  function injectStyles() {
    var id = '__alenio__';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = \`
      body,html{background:\${BG}!important;color:#fff!important;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif!important;}
      [class*="prejoin"],[class*="Prejoin"],[class*="lobby"],[class*="Lobby"],[class*="HairCheck"]{background:\${BG}!important;}
      [class*="card"],[class*="Card"],[class*="modal-content"]{background:\${SURFACE}!important;border:1px solid \${BORDER}!important;border-radius:20px!important;color:#fff!important;}
      [class*="card"] *,[class*="Card"] *,[class*="prejoin"] *{color:#fff!important;}
      input,select{background:#1E293B!important;border:1px solid \${BORDER}!important;border-radius:10px!important;color:#fff!important;}
      button[class*="join"],button[class*="Join"],[class*="joinButton"]{background:\${PRIMARY}!important;border:none!important;border-radius:14px!important;color:#fff!important;font-weight:600!important;box-shadow:0 4px 20px rgba(67,97,238,0.4)!important;}
      [class*="tray"],[class*="Tray"],[class*="controls"],[class*="Controls"],[class*="toolbar"]{background:rgba(10,15,30,0.95)!important;border-top:1px solid \${BORDER}!important;}
      button[class*="tray"],button[class*="Tray"],[class*="controlButton"]{background:rgba(255,255,255,0.1)!important;border:1px solid \${BORDER}!important;border-radius:50%!important;color:#fff!important;}
      button[class*="leave"],button[class*="Leave"],[class*="leaveButton"]{background:#EF4444!important;border-radius:16px!important;color:#fff!important;}
      [class*="tile"],[class*="Tile"],[class*="participant"],[class*="video-container"]{background:\${SURFACE}!important;border-radius:16px!important;border:1px solid \${BORDER}!important;}
      [class*="name-tag"],[class*="NameTag"],[class*="displayName"]{background:rgba(10,15,30,0.8)!important;border-radius:8px!important;color:#fff!important;padding:2px 8px!important;}
      .powered-by-daily,.daily-logo,[class*="DailyLogo"],[class*="branding"],[class*="watermark"],a[href*="daily.co"]{display:none!important;}
    \`;
    (document.head||document.documentElement).appendChild(s);
  }

  // Auto-click Daily's join button to skip their pre-join
  var joinAttempts = 0;
  function tryAutoJoin() {
    var btn = document.querySelector('[data-testid="hair-check-join-button"]')
      || document.querySelector('[data-testid="join-button"]')
      || Array.from(document.querySelectorAll('button')).find(function(b){
           return b.textContent && /^join$/i.test(b.textContent.trim());
         });
    if (btn) { btn.click(); return true; }
    return false;
  }
  var joinInterval = setInterval(function(){
    if(tryAutoJoin() || ++joinAttempts > 30) clearInterval(joinInterval);
  }, 800);

  function postLeave() {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'left-meeting'}));
  }
  function checkEndState() {
    var t = (document.body||{}).innerText||'';
    if((t.includes('meeting')&&t.includes('does not exist'))||t.includes('call has ended')||t.includes("You've left")||t.includes('Thank you for joining')){
      postLeave();
    }
  }
  window.addEventListener('daily:left-meeting', postLeave);
  window.addEventListener('daily:call-instance-destroyed', postLeave);

  function start() {
    injectStyles();
    checkEndState();
    var obs = new MutationObserver(function(){ injectStyles(); checkEndState(); });
    obs.observe(document.documentElement,{childList:true,subtree:true});
  }
  document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',start) : start();
  [1500,4000,8000].forEach(function(t){ setTimeout(checkEndState,t); });
})();
true;
`;
}

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const { data: session } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);

  async function requestPermissionsAndJoin() {
    const cam = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const mic = micPermission?.granted ? micPermission : await requestMicPermission();
    if (!cam?.granted || !mic?.granted) {
      setPermissionDenied(true);
      return;
    }
    setPhase("incall");
  }

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const userName = session?.user?.name ?? "Guest";
  const userImage = session?.user?.image;

  const [phase, setPhase] = useState<Phase>("loading");
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  const roomHostRef = useRef<string | null>(null);
  const webViewRef = useRef<WebView>(null);
  const didLeave = useRef(false);

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.03, { duration: 950 }), withTiming(1, { duration: 950 })),
      -1, false
    );
    glowOpacity.value = withRepeat(
      withSequence(withTiming(0.9, { duration: 950 }), withTiming(0.4, { duration: 950 })),
      -1, false
    );
  }, []);

  const joinBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    shadowOpacity: glowOpacity.value,
  }));

  const goBack = useCallback(() => {
    if (didLeave.current) return;
    didLeave.current = true;
    router.back();
  }, []);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/video/room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId, userName }),
        });
        const json = await res.json();
        if (!res.ok || !json.data?.url) { setError("Could not start call."); setPhase("error"); return; }
        const { url, token } = json.data;
        try { roomHostRef.current = new URL(url).hostname; } catch {}
        setCallUrl(token ? `${url}?t=${token}` : url);
        setPhase("prejoin");
      } catch {
        setError("Could not connect. Please try again.");
        setPhase("error");
      }
    }
    fetchRoom();
  }, [roomId, userName]);

  function handleMessage(e: { nativeEvent: { data: string } }) {
    try { if (JSON.parse(e.nativeEvent.data).type === "left-meeting") goBack(); } catch {}
  }
  function handleNavChange(nav: WebViewNavigation) {
    const host = roomHostRef.current;
    if (!host) return;
    try { if (new URL(nav.url).hostname !== host) goBack(); } catch {}
  }

  // ── PERMISSION DENIED ──
  if (permissionDenied) {
    return (
      <View style={[s.screen, { paddingHorizontal: 32 }]}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 48, marginBottom: 16 }}>📷</Text>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 12 }}>
          Camera & Mic Access Required
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", marginBottom: 32, lineHeight: 22 }}>
          Please allow camera and microphone access in your device Settings to join video calls.
        </Text>
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 16 }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── LOADING ──
  if (phase === "loading") {
    return (
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <Image source={alenioLogo} style={s.loadingLogo} resizeMode="contain" />
        <ActivityIndicator color="#4361EE" size="large" />
        <Text style={s.loadingText}>Connecting...</Text>
      </View>
    );
  }

  // ── ERROR ──
  if (phase === "error") {
    return (
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <Image source={alenioLogo} style={s.loadingLogo} resizeMode="contain" />
        <Text style={s.errorText}>{error}</Text>
        <TouchableOpacity onPress={goBack} style={s.joinBtn}>
          <Text style={s.joinBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── PRE-JOIN ──
  if (phase === "prejoin") {
    const initials = userName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom", "left", "right"]}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 20 }]}>
            <TouchableOpacity onPress={goBack} style={s.headerBack} testID="back-button">
              <ChevronLeft size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle} numberOfLines={1}>{roomName ?? "Video Call"}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Video preview area */}
          <View style={s.previewArea}>
            {userImage ? (
              <Image source={{ uri: userImage }} style={s.avatarLg} />
            ) : (
              <View style={s.avatarInitials}>
                <Text style={s.avatarInitialsText}>{initials}</Text>
              </View>
            )}
            <Text style={s.previewName}>{userName}</Text>
            {!videoOn ? (
              <View style={s.videoOffBadge}>
                <VideoOff size={16} color="rgba(255,255,255,0.6)" />
                <Text style={s.videoOffText}>Camera off</Text>
              </View>
            ) : null}
          </View>

          {/* Controls */}
          <View style={s.controlRow}>
            <TouchableOpacity
              testID="toggle-camera"
              style={[s.controlBtn, !videoOn && s.controlBtnOff]}
              onPress={() => setVideoOn(v => !v)}
            >
              {videoOn ? <Video size={22} color="#fff" /> : <VideoOff size={22} color="#fff" />}
              <Text style={s.controlLabel}>{videoOn ? "Camera" : "Cam off"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="toggle-mic"
              style={[s.controlBtn, !micOn && s.controlBtnOff]}
              onPress={() => setMicOn(m => !m)}
            >
              {micOn ? <Mic size={22} color="#fff" /> : <MicOff size={22} color="#fff" />}
              <Text style={s.controlLabel}>{micOn ? "Mic" : "Muted"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="toggle-speaker"
              style={[s.controlBtn, !speakerOn && s.controlBtnOff]}
              onPress={() => setSpeakerOn(v => !v)}
            >
              {speakerOn ? <Volume2 size={22} color="#fff" /> : <VolumeX size={22} color="#fff" />}
              <Text style={s.controlLabel}>Speaker</Text>
            </TouchableOpacity>
          </View>

          {/* Join button */}
          <View style={s.joinRow}>
            <Animated.View style={joinBtnAnimStyle}>
              <TouchableOpacity testID="join-call-button" style={s.joinBtn} onPress={requestPermissionsAndJoin}>
                <Video size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.joinBtnText}>Join call</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── IN-CALL ──
  return (
    <View style={{ flex: 1, backgroundColor: "#0A0F1E", paddingTop: insets.top + 20 }}>
      <StatusBar hidden />
      <WebView
        ref={webViewRef}
        testID="daily-webview"
        source={{ uri: callUrl! }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        mediaCapturePermissionGrantType="grant"
        originWhitelist={['*']}
        allowsAirPlayForMediaPlayback={true}
        style={{ flex: 1, backgroundColor: "#0A0F1E" }}
        injectedJavaScript={buildInjectedJS(micOn, videoOn)}
        injectedJavaScriptBeforeContentLoaded={buildPreloadJS()}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavChange}
        onShouldStartLoadWithRequest={req => req.url.startsWith("http://") || req.url.startsWith("https://")}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1, backgroundColor: "#0A0F1E",
    alignItems: "center", justifyContent: "center",
  },
  loadingLogo: { width: 120, height: 36, marginBottom: 32 },
  loadingText: { color: "rgba(255,255,255,0.5)", marginTop: 14, fontSize: 14 },
  errorText: { color: "#fff", fontSize: 16, textAlign: "center", paddingHorizontal: 32, marginBottom: 24 },

  // Header
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerBack: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, color: "#fff", fontSize: 17,
    fontWeight: "600", textAlign: "center",
  },

  // Preview area
  previewArea: {
    flex: 1, margin: 16, borderRadius: 24,
    backgroundColor: "#111827",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  avatarLg: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: "#4361EE",
  },
  avatarInitials: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "#4361EE",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitialsText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  previewName: { color: "#fff", fontSize: 18, fontWeight: "600", marginTop: 14 },
  videoOffBadge: {
    flexDirection: "row", alignItems: "center",
    marginTop: 8, backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6,
  },
  videoOffText: { color: "rgba(255,255,255,0.6)", fontSize: 13 },

  // Controls
  controlRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 24, paddingVertical: 20, paddingHorizontal: 32,
  },
  controlBtn: {
    width: 72, alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 14, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  controlBtnOff: {
    backgroundColor: "rgba(239,68,68,0.2)",
    borderColor: "rgba(239,68,68,0.3)",
  },
  controlLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "500" },

  // Join button
  joinRow: { paddingHorizontal: 24, paddingBottom: 24 },
  joinBtn: {
    backgroundColor: "#4361EE",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 18, borderRadius: 18,
    shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  joinBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
