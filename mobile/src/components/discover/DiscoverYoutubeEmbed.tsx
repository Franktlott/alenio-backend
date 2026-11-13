import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  YOUTUBE_EMBED_BASE_URL,
  youtubeEmbedHtml,
} from "@/lib/discover-youtube";
import { palette } from "@/theme";

type Props = {
  videoId?: string;
  title?: string;
};

export function DiscoverYoutubeEmbed({
  videoId = "",
  title = "YouTube video",
}: Props) {
  const html = useMemo(
    () => youtubeEmbedHtml(videoId, title),
    [title, videoId],
  );
  if (!html) return null;

  return (
    <View style={styles.wrap} accessibilityLabel={title}>
      <WebView
        source={{ html, baseUrl: YOUTUBE_EMBED_BASE_URL }}
        style={styles.webview}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        originWhitelist={["https://*", "about:srcdoc"]}
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
