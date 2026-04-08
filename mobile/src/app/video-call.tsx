import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { PhoneOff } from "lucide-react-native";
import { useSession } from "@/lib/auth/use-session";

// Injected into the WebView to hide Daily branding and polish the UI
const INJECTED_CSS = `
(function() {
  var style = document.createElement('style');
  style.textContent = \`
    /* Hide Daily.co branding */
    [data-testid="leave-button-label"],
    .powered-by-daily,
    .daily-logo,
    [class*="branding"],
    [class*="Branding"],
    [class*="logo"],
    [class*="Logo"] { display: none !important; }
    /* Make video tiles fill space nicely */
    body { background: #000 !important; }
  \`;
  document.head.appendChild(style);
  // Re-apply after navigation changes
  var obs = new MutationObserver(function() {
    if (!document.head.contains(style)) document.head.appendChild(style);
  });
  obs.observe(document.head, { childList: true });
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
  const webViewRef = useRef(null);

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
        setCallUrl(token ? `${url}?t=${token}` : url);
      } catch {
        setError("Could not connect. Please try again.");
      }
    }
    fetchRoom();
  }, [roomId, userName]);

  return (
    <View className="flex-1 bg-black">
      <StatusBar barStyle="light-content" />
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-1">
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {roomName ?? "Video Call"}
            </Text>
          </View>
          <TouchableOpacity
            testID="end-call-button"
            onPress={() => router.back()}
            className="w-12 h-12 rounded-full bg-red-500 items-center justify-center"
          >
            <PhoneOff size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View className="flex-1 overflow-hidden rounded-2xl mx-2 mb-2">
          {error ? (
            <View className="flex-1 bg-slate-900 items-center justify-center">
              <Text className="text-white text-center px-6">{error}</Text>
              <TouchableOpacity onPress={() => router.back()} className="mt-4 px-6 py-3 bg-red-500 rounded-full">
                <Text className="text-white font-semibold">Go Back</Text>
              </TouchableOpacity>
            </View>
          ) : !callUrl ? (
            <View className="flex-1 bg-slate-900 items-center justify-center">
              <ActivityIndicator color="white" size="large" />
              <Text className="text-white mt-3 text-sm">Starting call...</Text>
            </View>
          ) : (
            <>
              {loading ? (
                <View className="absolute inset-0 bg-slate-900 items-center justify-center z-10">
                  <ActivityIndicator color="white" size="large" />
                  <Text className="text-white mt-3 text-sm">Joining as {userName}...</Text>
                </View>
              ) : null}
              <WebView
                ref={webViewRef}
                source={{ uri: callUrl }}
                onLoadEnd={() => setLoading(false)}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState={false}
                style={{ flex: 1, backgroundColor: "#000000" }}
                testID="daily-webview"
                injectedJavaScript={INJECTED_CSS}
                injectedJavaScriptBeforeContentLoaded={INJECTED_CSS}
                onShouldStartLoadWithRequest={(request) => {
                  return request.url.startsWith("http://") || request.url.startsWith("https://");
                }}
              />
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
