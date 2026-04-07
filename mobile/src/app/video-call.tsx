import React, { useRef, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { PhoneOff } from "lucide-react-native";

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const [loading, setLoading] = useState(true);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
        const res = await fetch(`${baseUrl}/api/video/room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const json = await res.json();
        if (!res.ok || !json.data?.url) {
          setError("Could not start call. Please try again.");
          return;
        }
        setRoomUrl(json.data.url);
      } catch {
        setError("Could not connect. Please try again.");
      }
    }
    fetchRoom();
  }, [roomId]);

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
            <Text className="text-white/60 text-xs">Powered by Daily</Text>
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
          ) : !roomUrl ? (
            <View className="flex-1 bg-slate-900 items-center justify-center">
              <ActivityIndicator color="white" size="large" />
              <Text className="text-white mt-3 text-sm">Starting call...</Text>
            </View>
          ) : (
            <>
              {loading ? (
                <View className="absolute inset-0 bg-slate-900 items-center justify-center z-10">
                  <ActivityIndicator color="white" size="large" />
                  <Text className="text-white mt-3 text-sm">Joining call...</Text>
                </View>
              ) : null}
              <WebView
                ref={webViewRef}
                source={{ uri: roomUrl }}
                onLoadEnd={() => setLoading(false)}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState={false}
                style={{ flex: 1, backgroundColor: "#0F172A" }}
                testID="daily-webview"
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
