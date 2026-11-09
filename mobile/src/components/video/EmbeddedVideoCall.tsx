import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VideoOff } from "lucide-react-native";
import { isVideoCallingSupported } from "@/lib/daily-module";

type Props = {
  roomId: string;
  roomName: string;
  presentation?: "inline" | "background";
  showLeaveControl?: boolean;
  onCallActiveChange?: (active: boolean) => void;
};

/**
 * The call view imports Daily, which needs WebRTC compiled into the app, so
 * the import waits behind the check: reaching for it in a build without the
 * native side throws before any of this component's code runs.
 */
export function EmbeddedVideoCall(props: Props) {
  const supported = isVideoCallingSupported();
  const { onCallActiveChange } = props;

  useEffect(() => {
    if (supported) return;
    // The screen dims itself around a live call; nothing is live here.
    onCallActiveChange?.(false);
  }, [supported, onCallActiveChange]);

  if (!supported) {
    return (
      <View style={styles.unsupported} testID="embedded-call-unsupported">
        <VideoOff size={22} color="#94A3B8" strokeWidth={2.2} />
        <Text style={styles.unsupportedText}>
          Video calls need a newer version of the app.
        </Text>
      </View>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EmbeddedVideoCallView } = require("@/components/video/EmbeddedVideoCallView") as {
    EmbeddedVideoCallView: React.ComponentType<Props>;
  };
  return <EmbeddedVideoCallView {...props} />;
}

const styles = StyleSheet.create({
  unsupported: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
    backgroundColor: "#0A0F1E",
  },
  unsupportedText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#94A3B8",
    textAlign: "center",
  },
});
