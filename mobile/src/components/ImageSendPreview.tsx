import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Image,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Send, X, Video } from "lucide-react-native";

interface ImageSendPreviewProps {
  visible: boolean;
  mediaUri: string | null;
  isVideo: boolean;
  onCancel: () => void;
  onSend: (caption: string) => void;
  isSending: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function ImageSendPreview({
  visible,
  mediaUri,
  isVideo,
  onCancel,
  onSend,
  isSending,
}: ImageSendPreviewProps) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState<string>("");

  useEffect(() => {
    if (!visible) {
      setCaption("");
    }
  }, [visible]);

  return (
    <Modal
      testID="image-preview-modal"
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent={true}
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* Top bar */}
        <View
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
          }}
        >
          <Pressable
            testID="image-preview-cancel"
            onPress={onCancel}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color="white" />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{
                color: "white",
                fontSize: 17,
                fontWeight: "600",
              }}
            >
              Add Caption
            </Text>
          </View>
          {/* Spacer to balance the X button */}
          <View style={{ width: 36 }} />
        </View>

        {/* Image / Video area */}
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {isVideo ? (
            <View
              style={{
                width: SCREEN_WIDTH - 32,
                aspectRatio: 9 / 16,
                maxHeight: "70%",
                borderRadius: 16,
                backgroundColor: "#111",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                shadowColor: "#fff",
                shadowOpacity: 0.06,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Video size={30} color="white" />
              </View>
              <Text
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 14,
                  marginTop: 12,
                }}
              >
                Video selected
              </Text>
            </View>
          ) : mediaUri ? (
            <View
              style={{
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#fff",
                shadowOpacity: 0.08,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <Image
                source={{ uri: mediaUri }}
                style={{
                  width: SCREEN_WIDTH,
                  flex: 1,
                  maxHeight: 560,
                }}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>

        {/* Bottom area with keyboard avoidance */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              paddingHorizontal: 12,
              paddingTop: 12,
              paddingBottom: insets.bottom + 16,
              gap: 10,
            }}
          >
            <TextInput
              testID="image-preview-input"
              value={caption}
              onChangeText={setCaption}
              placeholder="Add Caption..."
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.12)",
                color: "white",
                fontSize: 16,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 24,
                maxHeight: 120,
              }}
              multiline
              editable={!isSending}
            />
            <Pressable
              testID="image-preview-send"
              onPress={() => onSend(caption.trim())}
              disabled={isSending}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#4361EE",
                alignItems: "center",
                justifyContent: "center",
                opacity: isSending ? 0.7 : 1,
              }}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Send size={18} color="white" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
