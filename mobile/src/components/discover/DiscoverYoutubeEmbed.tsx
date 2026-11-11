import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { youtubeEmbedUrl } from "@/lib/discover-youtube";
import { palette } from "@/theme";

type Props = {
  videoId?: string;
  title?: string;
};

export function DiscoverYoutubeEmbed({
  videoId = "",
  title = "YouTube video",
}: Props) {
  const src = useMemo(() => youtubeEmbedUrl(videoId), [videoId]);
  if (!src) return null;

  return (
    <View style={styles.wrap} accessibilityLabel={title}>
      <WebView
        source={{ uri: src }}
        style={styles.webview}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        originWhitelist={["https://*"]}
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 12,
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.cardBorder,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
