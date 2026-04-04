import React, { useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { useLocalSearchParams, router } from "expo-router";
import { PhoneOff } from "lucide-react-native";

export default function VideoCallScreen() {
  const { roomId, roomName } = useLocalSearchParams<{ roomId: string; roomName: string }>();
  const [loading, setLoading] = useState(true);
  const webViewRef = useRef(null);

  // Sanitize room ID for Jitsi (alphanumeric + hyphens only, max 50 chars)
  const jitsiRoom = `alenio-${roomId}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 50);
  const jitsiUrl = `https://meet.jit.si/${jitsiRoom}`;

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
            <Text className="text-white/60 text-xs">Powered by Jitsi Meet</Text>
          </View>
          <TouchableOpacity
            testID="end-call-button"
            onPress={() => router.back()}
            className="w-12 h-12 rounded-full bg-red-500 items-center justify-center"
          >
            <PhoneOff size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <View className="flex-1 overflow-hidden rounded-2xl mx-2 mb-2">
          {loading ? (
            <View className="absolute inset-0 bg-slate-900 items-center justify-center z-10">
              <ActivityIndicator color="white" size="large" />
              <Text className="text-white mt-3 text-sm">Joining call...</Text>
            </View>
          ) : null}
          <WebView
            ref={webViewRef}
            source={{ uri: jitsiUrl }}
            onLoadEnd={() => setLoading(false)}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            style={{ flex: 1, backgroundColor: "#0F172A" }}
            testID="jitsi-webview"
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
