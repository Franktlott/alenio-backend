import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { VideoOff } from "lucide-react-native";
import { isVideoCallingSupported } from "@/lib/daily-module";

/**
 * The call screen imports Daily, which needs WebRTC compiled into the app, so
 * the import itself has to wait behind the check. A build without it gets a
 * plain explanation rather than the crash the import would cause.
 */
export default function VideoCallRoute() {
  if (!isVideoCallingSupported()) {
    return (
      <SafeAreaView style={styles.screen} testID="video-call-unsupported">
        <View style={styles.content}>
          <View style={styles.icon}>
            <VideoOff size={24} color="#6B7689" strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>Video calls need a newer app</Text>
          <Text style={styles.body}>
            This copy of Alenio was built before video calling. Update the app
            and the call will open here.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.86}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.buttonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const VideoCallScreen = require("@/components/video/VideoCallScreen")
    .default as React.ComponentType;
  return <VideoCallScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4F9",
  },
  title: {
    marginTop: 16,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111A2B",
    textAlign: "center",
  },
  body: {
    marginTop: 8,
    maxWidth: 300,
    fontSize: 13,
    lineHeight: 19,
    color: "#7A8699",
    textAlign: "center",
  },
  button: {
    marginTop: 22,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  buttonText: { fontSize: 14.5, fontWeight: "700", color: "#FFFFFF" },
});
