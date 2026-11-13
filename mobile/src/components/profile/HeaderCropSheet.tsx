import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clampHeaderOffset,
  coverHeaderPlacement,
  HEADER_SIZE_NOTE,
  headerCropRect,
  type HeaderCropRect,
} from "@/lib/profile-header-frame";

const BRAND = "#4361EE";

type HeaderPhoto = {
  uri: string;
  width: number;
  height: number;
};

type Props = {
  photo: HeaderPhoto | null;
  frameAspect: number;
  busy?: boolean;
  onCancel: () => void;
  onUse: (crop: HeaderCropRect) => void;
};

export function HeaderCropSheet({
  photo,
  frameAspect,
  busy = false,
  onCancel,
  onUse,
}: Props) {
  return (
    <Modal
      visible={photo != null}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onCancel}
    >
      {photo ? (
        <CropEditor
          key={photo.uri}
          photo={photo}
          frameAspect={frameAspect}
          busy={busy}
          onCancel={onCancel}
          onUse={onUse}
        />
      ) : null}
    </Modal>
  );
}

function CropEditor({
  photo,
  frameAspect,
  busy,
  onCancel,
  onUse,
}: {
  photo: HeaderPhoto;
  frameAspect: number;
  busy: boolean;
  onCancel: () => void;
  onUse: (crop: HeaderCropRect) => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const frame = useMemo(() => {
    const maxWidth = Math.max(1, window.width - 32);
    const maxHeight = Math.max(120, window.height - insets.top - insets.bottom - 168);
    let width = maxWidth;
    let height = width / frameAspect;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * frameAspect;
    }
    return { width, height };
  }, [frameAspect, insets.bottom, insets.top, window.height, window.width]);
  const initial = useMemo(
    () => coverHeaderPlacement(photo.width, photo.height, frame.width, frame.height),
    [frame.height, frame.width, photo.height, photo.width],
  );
  const offsetX = useSharedValue(initial.offsetX);
  const offsetY = useSharedValue(initial.offsetY);
  const displayWidth = useSharedValue(initial.displayWidth);
  const displayHeight = useSharedValue(initial.displayHeight);
  const savedX = useSharedValue(initial.offsetX);
  const savedY = useSharedValue(initial.offsetY);
  const savedWidth = useSharedValue(initial.displayWidth);
  const savedHeight = useSharedValue(initial.displayHeight);
  const minWidth = initial.displayWidth;

  const pan = Gesture.Pan()
    .onStart(() => {
      savedX.value = offsetX.value;
      savedY.value = offsetY.value;
    })
    .onUpdate((event) => {
      offsetX.value = clampHeaderOffset(
        savedX.value + event.translationX,
        displayWidth.value,
        frame.width,
      );
      offsetY.value = clampHeaderOffset(
        savedY.value + event.translationY,
        displayHeight.value,
        frame.height,
      );
    });

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedX.value = offsetX.value;
      savedY.value = offsetY.value;
      savedWidth.value = displayWidth.value;
      savedHeight.value = displayHeight.value;
    })
    .onUpdate((event) => {
      const nextWidth = Math.min(
        minWidth * 4,
        Math.max(minWidth, savedWidth.value * event.scale),
      );
      const nextHeight = nextWidth * (photo.height / photo.width);
      const imageX = (event.focalX - savedX.value) / savedWidth.value;
      const imageY = (event.focalY - savedY.value) / savedHeight.value;
      offsetX.value = clampHeaderOffset(
        event.focalX - imageX * nextWidth,
        nextWidth,
        frame.width,
      );
      offsetY.value = clampHeaderOffset(
        event.focalY - imageY * nextHeight,
        nextHeight,
        frame.height,
      );
      displayWidth.value = nextWidth;
      displayHeight.value = nextHeight;
    });

  const imageStyle = useAnimatedStyle(() => ({
    width: displayWidth.value,
    height: displayHeight.value,
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
    ],
  }));

  const usePhoto = () => {
    onUse(
      headerCropRect({
        imageWidth: photo.width,
        imageHeight: photo.height,
        frameWidth: frame.width,
        frameHeight: frame.height,
        offsetX: offsetX.value,
        offsetY: offsetY.value,
        displayWidth: displayWidth.value,
        displayHeight: displayHeight.value,
      }),
    );
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Choose your header</Text>
        <Text style={styles.subtitle}>
          Drag and pinch so the banner shows the part you want. Keep important
          details near the center.
        </Text>
      </View>
      <View style={styles.stage}>
        <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
          <View
            style={[styles.frame, { width: frame.width, height: frame.height }]}
          >
            <Animated.View style={[styles.photo, imageStyle]}>
              <Image
                source={{ uri: photo.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="fill"
              />
            </Animated.View>
          </View>
        </GestureDetector>
        <Text style={styles.sizeNote} testID="header-crop-size-note">
          {HEADER_SIZE_NOTE}
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          style={styles.cancel}
          accessibilityRole="button"
          testID="header-crop-cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={usePhoto}
          disabled={busy}
          style={styles.use}
          accessibilityRole="button"
          testID="header-crop-use"
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.useText}>Use photo</Text>
          )}
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0E1320",
  },
  top: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.72)",
    fontSize: 15,
    lineHeight: 21,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  frame: {
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#1C2433",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  photo: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  sizeNote: {
    marginTop: 16,
    maxWidth: 420,
    textAlign: "center",
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cancel: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  cancelText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  use: {
    flex: 1.4,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
  useText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
