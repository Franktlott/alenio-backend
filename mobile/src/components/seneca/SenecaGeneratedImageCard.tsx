import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ExternalLink,
  ImageOff,
  Maximize2,
  MessageCircle,
  Share2,
  X,
} from "lucide-react-native";
import { Image } from "expo-image";
import type { SenecaGeneratedImage } from "@/lib/seneca-api";
import { toast } from "burnt";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { SenecaImageSendFlow } from "./SenecaImageSendFlow";

export function SenecaGeneratedImageCard({
  image,
}: {
  image: SenecaGeneratedImage;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [shareActionsOpen, setShareActionsOpen] = useState(false);
  const [sendFlowOpen, setSendFlowOpen] = useState(false);
  const aspectRatio =
    image.width > 0 && image.height > 0 ? image.width / image.height : 1;

  useEffect(() => {
    setImageFailed(false);
    setPreviewOpen(false);
    setShareActionsOpen(false);
    setSendFlowOpen(false);
  }, [image.url]);

  const shareExternally = async () => {
    try {
      await Share.share({
        title: "Image created with Seneca",
        message: `${image.prompt}\n${image.url}`,
        url: image.url,
      });
    } catch {
      toast({
        title: "Couldn't share the image",
        message: "Please try again.",
        preset: "error",
      });
    }
  };

  const openShareActions = () => {
    if (imageFailed) {
      toast({
        title: "Image unavailable",
        message: "This image may have expired or been removed.",
        preset: "error",
      });
      return;
    }
    if (previewOpen) {
      setPreviewOpen(false);
      setTimeout(() => setShareActionsOpen(true), 240);
      return;
    }
    setShareActionsOpen(true);
  };

  return (
    <>
      <View style={styles.card} testID="seneca-generated-image-card">
        <Pressable
          onPress={() => {
            if (!imageFailed) setPreviewOpen(true);
          }}
          disabled={imageFailed}
          accessibilityRole="imagebutton"
          accessibilityLabel={`Open generated image. ${image.prompt}`}
          style={styles.imageButton}
          testID="seneca-generated-image-open"
        >
          {imageFailed ? (
            <View
              style={[styles.imageFallback, { aspectRatio }]}
              testID="seneca-generated-image-unavailable"
            >
              <ImageOff size={22} color="#94A3B8" strokeWidth={1.8} />
              <Text style={styles.imageFallbackTitle}>Image unavailable</Text>
              <Text style={styles.imageFallbackText}>
                This image may have expired or been removed.
              </Text>
            </View>
          ) : (
            <>
              <Image
                source={{ uri: image.url }}
                style={[styles.image, { aspectRatio }]}
                contentFit="cover"
                transition={180}
                onError={() => setImageFailed(true)}
              />
              <View style={styles.expand}>
                <Maximize2 size={14} color="#FFFFFF" strokeWidth={2.2} />
              </View>
            </>
          )}
        </Pressable>
        <View style={styles.footer}>
          <Text style={styles.prompt} numberOfLines={2}>
            {image.revisedPrompt ?? image.prompt}
          </Text>
          <Pressable
            onPress={openShareActions}
            accessibilityRole="button"
            accessibilityLabel="Share generated image"
            style={styles.shareButton}
            testID="seneca-generated-image-share"
          >
            <Share2 size={15} color="#4361EE" strokeWidth={2.1} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={previewOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.preview} testID="seneca-generated-image-preview">
          <Pressable
            onPress={() => setPreviewOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close image"
            style={styles.close}
          >
            <X size={22} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
          <Image
            source={{ uri: image.url }}
            style={styles.previewImage}
            contentFit="contain"
            onError={() => {
              setImageFailed(true);
              setPreviewOpen(false);
            }}
          />
          <Pressable
            onPress={openShareActions}
            accessibilityRole="button"
            style={styles.previewShare}
            testID="seneca-generated-image-preview-share"
          >
            <Share2 size={17} color="#FFFFFF" />
            <Text style={styles.previewShareText}>Share</Text>
          </Pressable>
        </View>
      </Modal>

      <AlenioBottomSheet
        visible={shareActionsOpen}
        title="Share image"
        subtitle="Send in Alenio or use another app"
        onClose={() => setShareActionsOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="seneca-image-share-actions"
        footer={
          <Pressable
            onPress={() => setShareActionsOpen(false)}
            style={alenioSheetStyles.cancelButton}
            testID="seneca-image-share-cancel"
          >
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        <AlenioSheetOption
          icon={<MessageCircle size={15} color="#FFFFFF" strokeWidth={2.2} />}
          title="Send in Alenio"
          subtitle="Choose a direct message or group"
          onPress={() => {
            setShareActionsOpen(false);
            setPreviewOpen(false);
            setTimeout(() => setSendFlowOpen(true), 240);
          }}
          testID="seneca-image-send-in-alenio"
        />
        <AlenioSheetOption
          icon={<ExternalLink size={15} color="#FFFFFF" strokeWidth={2.2} />}
          iconColor="#64748B"
          tint="slate"
          title="Share externally"
          subtitle="Use your device sharing options"
          onPress={() => {
            setShareActionsOpen(false);
            setTimeout(() => void shareExternally(), 240);
          }}
          testID="seneca-image-share-externally"
        />
      </AlenioBottomSheet>

      <SenecaImageSendFlow
        visible={sendFlowOpen}
        image={image}
        onClose={() => setSendFlowOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E1E6F0",
    backgroundColor: "#FFFFFF",
  },
  imageButton: {
    position: "relative",
    width: "100%",
    backgroundColor: "#EDF1F7",
  },
  image: {
    width: "100%",
    maxHeight: 360,
    minHeight: 180,
  },
  imageFallback: {
    width: "100%",
    minHeight: 180,
    maxHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#F1F5F9",
  },
  imageFallbackTitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  imageFallbackText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    color: "#94A3B8",
  },
  expand: {
    position: "absolute",
    right: 9,
    top: 9,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.64)",
  },
  footer: {
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prompt: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 13,
    color: "#6F7A8E",
  },
  shareButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F5FF",
  },
  preview: {
    flex: 1,
    backgroundColor: "#080B12",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "78%",
  },
  close: {
    position: "absolute",
    zIndex: 2,
    top: 54,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  previewShare: {
    minWidth: 112,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4361EE",
  },
  previewShareText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
