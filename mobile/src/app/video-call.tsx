import React, { useState, useEffect, useCallback } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StatusBar, StyleSheet, Image, Linking, Share, TextInput, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useLocalSearchParams, router, useNavigation } from "expo-router";
import { ChevronLeft, Video, PhoneOff, Share2, Monitor, Mail, X, Check } from "lucide-react-native";
import { useSession } from "@/lib/auth/use-session";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { api } from "@/lib/api/api";
import { readJsonSafe } from "@/lib/api/api";

const alenioLogo = require("@/assets/alenio-logo-white.png");

type Phase = "loading" | "prejoin" | "incall" | "error";

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const { data: session } = useSession();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userName = session?.user?.name ?? "Guest";
  const userImage = session?.user?.image;

  // Email invite state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.5);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
        const json = await readJsonSafe<{ data?: { url?: string; token?: string } }>(res);
        if (!res.ok || !json?.data?.url) {
          setError("Could not start call.");
          setPhase("error");
          return;
        }
        const { url, token } = json.data;
        setShareUrl(url);
        setCallUrl(token ? `${url}?t=${token}` : url);
        setPhase("prejoin");
      } catch {
        setError("Could not connect. Please try again.");
        setPhase("error");
      }
    }
    fetchRoom();
  }, [roomId, userName]);

  async function requestPermissionsAndJoin() {
    const cam = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!cam?.granted) { setPermissionDenied(true); return; }
    await new Promise(r => setTimeout(r, 300));
    const mic = micPermission?.granted ? micPermission : await requestMicPermission();
    if (!mic?.granted) { setPermissionDenied(true); return; }
    setPhase("incall");
  }

  async function sendEmailInvite() {
    if (!inviteEmail.trim() || !shareUrl) return;
    setInviteSending(true);
    setInviteError(null);
    try {
      await api.post("/api/video/invite", {
        to: inviteEmail.trim(),
        roomUrl: shareUrl,
        roomName: roomName ?? "Video Call",
        senderName: userName,
      });
      setInviteSent(true);
      setTimeout(() => {
        setShowEmailModal(false);
        setInviteSent(false);
        setInviteEmail("");
      }, 2000);
    } catch (err: any) {
      setInviteError(err?.message ?? "Could not send invite. Try again.");
    } finally {
      setInviteSending(false);
    }
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
        <TouchableOpacity onPress={() => Linking.openSettings()} style={{ backgroundColor: "#4361EE", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, marginBottom: 16 }}>
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
      <View style={[s.screen, { alignItems: "stretch" }]}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 8 }]}>
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
          </View>

          {/* Actions */}
          <View style={s.joinRow}>
            <Animated.View style={joinBtnAnimStyle}>
              <TouchableOpacity testID="join-call-button" style={s.joinBtn} onPress={requestPermissionsAndJoin}>
                <Video size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.joinBtnText}>Join call</Text>
              </TouchableOpacity>
            </Animated.View>

            {!!shareUrl && (
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[s.secondaryBtn, { flex: 1 }]}
                  onPress={() => Share.share({ message: shareUrl, url: shareUrl, title: `Join ${roomName ?? "Video Call"}` })}
                >
                  <Share2 size={15} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
                  <Text style={s.secondaryBtnText}>Share link</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.secondaryBtn, { flex: 1 }]}
                  onPress={() => { setShowEmailModal(true); setInviteSent(false); setInviteError(null); }}
                  testID="email-invite-button"
                >
                  <Mail size={15} color="rgba(255,255,255,0.7)" style={{ marginRight: 6 }} />
                  <Text style={s.secondaryBtnText}>Email invite</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!shareUrl && (
              <View style={s.screenShareHint}>
                <Monitor size={14} color="rgba(255,255,255,0.4)" style={{ marginRight: 6 }} />
                <Text style={s.screenShareHintText}>
                  Need to share your screen? Join from a computer using the link above
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Email invite modal */}
        <Modal visible={showEmailModal} transparent animationType="slide" onRequestClose={() => setShowEmailModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowEmailModal(false)}>
              <TouchableOpacity activeOpacity={1} style={[s.modalCard, { paddingBottom: insets.bottom + 24 }]}>
                {/* Modal header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A" }}>Email Invite</Text>
                    <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>Send a professional invite with a join link</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowEmailModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Preview badge */}
                <View style={s.invitePreview}>
                  <View style={s.invitePreviewLogo}>
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Alenio</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
                      {userName} invited you to a video call
                    </Text>
                    <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }} numberOfLines={1}>
                      {roomName ?? "Video Call"} · Tap to join
                    </Text>
                  </View>
                </View>

                {/* Email input */}
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>Recipient email</Text>
                <TextInput
                  style={s.emailInput}
                  placeholder="name@company.com"
                  placeholderTextColor="#CBD5E1"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="invite-email-input"
                />

                {inviteError ? (
                  <Text style={{ fontSize: 13, color: "#EF4444", marginBottom: 12 }}>{inviteError}</Text>
                ) : null}

                <TouchableOpacity
                  style={[s.sendBtn, (!inviteEmail.trim() || inviteSending) && { opacity: 0.5 }]}
                  onPress={sendEmailInvite}
                  disabled={!inviteEmail.trim() || inviteSending}
                  testID="send-invite-button"
                >
                  {inviteSent ? (
                    <>
                      <Check size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={s.sendBtnText}>Invite sent!</Text>
                    </>
                  ) : inviteSending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Mail size={18} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={s.sendBtnText}>Send invite</Text>
                    </>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  }

  // ── IN-CALL ──
  return (
    <View style={{ flex: 1, backgroundColor: "#0A0F1E", paddingTop: insets.top + 20 }}>
      <StatusBar hidden />
      <WebView
        testID="daily-webview"
        source={{ uri: callUrl! }}
        userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mediaCapturePermissionGrantType="grant"
        originWhitelist={["*"]}
        style={{ flex: 1 }}
        injectedJavaScript={`
(function(){
  var style = document.createElement('style');
  style.textContent = 'button[class*="leave"],button[class*="Leave"],[class*="leaveButton"],[data-testid*="leave"],[aria-label*="leave"],[aria-label*="Leave"]{display:none!important;}';
  (document.head||document.documentElement).appendChild(style);
  var obs = new MutationObserver(function(){
    var s = document.getElementById('__hide_leave__');
    if(!s){ var s2=document.createElement('style'); s2.id='__hide_leave__'; s2.textContent='button[class*="leave"],button[class*="Leave"],[class*="leaveButton"],[data-testid*="leave"],[aria-label*="leave"],[aria-label*="Leave"]{display:none!important;}'; (document.head||document.documentElement).appendChild(s2); }
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
})(); true;
        `}
        onShouldStartLoadWithRequest={req =>
          req.url.startsWith("http://") || req.url.startsWith("https://")
        }
      />
      <TouchableOpacity
        testID="leave-call-button"
        onPress={goBack}
        style={[s.leaveBtn, { top: insets.top + 16 }]}
      >
        <PhoneOff size={18} color="#fff" />
        <Text style={s.leaveBtnText}>Leave</Text>
      </TouchableOpacity>
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

  joinRow: { paddingHorizontal: 24, paddingBottom: 24 },
  joinBtn: {
    backgroundColor: "#4361EE",
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 18, borderRadius: 18,
    shadowColor: "#4361EE", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 16,
  },
  joinBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },

  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 13, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" },

  leaveBtn: {
    position: "absolute", right: 16,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#EF4444",
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  leaveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  screenShareHint: {
    marginTop: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 12,
  },
  screenShareHintText: {
    color: "rgba(255,255,255,0.4)", fontSize: 12,
    textAlign: "center", lineHeight: 18,
  },

  // Email modal
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24,
  },
  invitePreview: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#F8FAFC", borderRadius: 12,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  invitePreviewLogo: {
    backgroundColor: "#4361EE", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  emailInput: {
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: "#0F172A", marginBottom: 16,
    backgroundColor: "#F8FAFC",
  },
  sendBtn: {
    backgroundColor: "#4361EE", borderRadius: 14,
    paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center",
  },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
