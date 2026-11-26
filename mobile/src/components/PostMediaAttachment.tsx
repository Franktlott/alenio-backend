import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Props = {
  url: string;
  mediaType?: "image" | "video" | null;
  width?: number | null;
  height?: number | null;
  testID?: string;
  onInteraction?: () => void;
  /** Flush media for continuous feeds — no rounded frame. */
  flat?: boolean;
};

function PostVideo({
  url,
  testID,
  onInteraction,
}: {
  url: string;
  testID?: string;
  onInteraction?: () => void;
}) {
  const player = useVideoPlayer(url);

  return (
    <View
      style={styles.media}
      // Keep play, scrub, fullscreen, and PiP gestures inside the player
      // instead of bubbling to the feed card's "open detail" action.
      onTouchStart={(event) => {
        onInteraction?.();
        event.stopPropagation();
      }}
      onTouchEnd={(event) => {
        onInteraction?.();
        event.stopPropagation();
      }}
    >
      <VideoView
        player={player}
        style={styles.media}
        contentFit="contain"
        nativeControls
        allowsPictureInPicture
        fullscreenOptions={{ enable: true }}
        testID={testID}
      />
    </View>
  );
}

/** One feed attachment, preserving legacy photo posts while supporting video. */
export function PostMediaAttachment({
  url,
  mediaType = "image",
  width,
  height,
  testID,
  onInteraction,
  flat = false,
}: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const aspectRatio =
    mediaType === "video" ? 16 / 9 : width && height ? width / height : 4 / 3;

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  // Broken / deleted upload URLs leave an empty gray frame — hide instead.
  if (mediaType !== "video" && imageFailed) {
    return null;
  }

  return (
    <View style={[styles.frame, flat ? styles.frameFlat : null, { aspectRatio }]}>
      {mediaType === "video" ? (
        <PostVideo
          url={url}
          testID={testID}
          onInteraction={onInteraction}
        />
      ) : (
        <Image
          source={{ uri: url }}
          style={styles.media}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          testID={testID}
          onError={() => setImageFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginTop: 8,
    width: "100%",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#EEF1F6",
  },
  frameFlat: {
    marginTop: 0,
    borderRadius: 0,
  },
  media: {
    width: "100%",
    height: "100%",
  },
});
