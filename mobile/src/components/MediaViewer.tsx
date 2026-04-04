import React, { useCallback } from "react";
import {
  Modal,
  View,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView, GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MediaViewerProps {
  visible: boolean;
  mediaUrl: string;
  mediaType: "image" | "video";
  onClose: () => void;
}

function ImageViewer({ mediaUrl, onClose }: { mediaUrl: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, []);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      } else {
        // Swipe down to close
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1) {
        if (Math.abs(e.translationY) > 100) {
          runOnJS(onClose)();
        } else {
          translateY.value = withSpring(0);
        }
        savedTranslateY.value = 0;
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2);
        savedScale.value = 2;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, Gesture.Race(doubleTapGesture, panGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <View style={styles.imageContainer}>
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.imageWrapper, animatedStyle]}>
            <Image
              source={{ uri: mediaUrl }}
              style={styles.fullImage}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 8 }]}
          onPress={onClose}
          activeOpacity={0.8}
          testID="media-viewer-close"
        >
          <View style={styles.closeIcon}>
            <X size={20} color="white" />
          </View>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  );
}

function VideoPlayer({ mediaUrl, onClose }: { mediaUrl: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.play();
    p.loop = false;
  });

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.video}
        allowsFullscreen
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={onClose}
        activeOpacity={0.8}
        testID="media-viewer-close"
      >
        <View style={styles.closeIcon}>
          <X size={20} color="white" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function MediaViewer({ visible, mediaUrl, mediaType, onClose }: MediaViewerProps) {
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <View style={styles.modalBg} testID="media-viewer-modal">
        {mediaType === "video" ? (
          <VideoPlayer mediaUrl={mediaUrl} onClose={onClose} />
        ) : (
          <ImageViewer mediaUrl={mediaUrl} onClose={onClose} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  closeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
