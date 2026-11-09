import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import {
  ExternalLink,
  FileText,
  ImageOff,
  Share2,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import type { SenecaAttachment } from "@/lib/seneca-api";

function isSafeAttachmentUrl(url: string): boolean {
  return /^(https?:\/\/|file:\/\/)/i.test(url);
}

export function SenecaAttachmentCard({
  attachment,
}: {
  attachment: SenecaAttachment;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const isPdf = attachment.mimeType === "application/pdf";

  useEffect(() => {
    setPreviewOpen(false);
    setUnavailable(false);
  }, [attachment.url]);

  const openAttachment = async () => {
    if (!isSafeAttachmentUrl(attachment.url)) {
      toast({ title: "This attachment link is invalid", preset: "error" });
      return;
    }
    try {
      if (!isPdf) {
        setPreviewOpen(true);
        return;
      }
      await Linking.openURL(attachment.url);
    } catch {
      setUnavailable(true);
      toast({
        title: "Attachment unavailable",
        message: "The file may have expired or been removed.",
        preset: "error",
      });
    }
  };

  const shareAttachment = async () => {
    try {
      await Share.share({
        title: attachment.fileName,
        message: `${attachment.fileName}\n${attachment.url}`,
        url: attachment.url,
      });
    } catch {
      await openAttachment();
    }
  };

  return (
    <>
      <View style={styles.card} testID="seneca-user-attachment">
        <Pressable
          onPress={() => void openAttachment()}
          style={styles.main}
          accessibilityRole="button"
          accessibilityLabel={`Open attachment ${attachment.fileName}`}
          testID="seneca-user-attachment-open"
        >
          {isPdf ? (
            <View style={styles.pdfIcon}>
              <FileText size={20} color="#B42318" strokeWidth={2} />
            </View>
          ) : unavailable ? (
            <View style={styles.imageFallback}>
              <ImageOff size={18} color="#94A3B8" />
            </View>
          ) : (
            <Image
              source={{ uri: attachment.url }}
              style={styles.thumbnail}
              contentFit="cover"
              onError={() => setUnavailable(true)}
            />
          )}
          <View style={styles.copy}>
            <Text style={styles.fileName} numberOfLines={1}>
              {attachment.fileName}
            </Text>
            <Text style={styles.fileType}>
              {unavailable
                ? "File unavailable"
                : isPdf
                  ? "PDF document"
                  : "Image"}
            </Text>
          </View>
          <ExternalLink size={14} color="#64748B" />
        </Pressable>
        <Pressable
          onPress={() => void shareAttachment()}
          style={styles.share}
          accessibilityLabel={`Share ${attachment.fileName}`}
          testID="seneca-user-attachment-share"
        >
          <Share2 size={15} color="#4361EE" />
        </Pressable>
      </View>

      <Modal
        visible={previewOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <View style={styles.preview} testID="seneca-user-attachment-preview">
          <Pressable
            onPress={() => setPreviewOpen(false)}
            style={styles.close}
            accessibilityLabel="Close attachment"
            testID="seneca-user-attachment-close"
          >
            <X size={22} color="#FFFFFF" />
          </Pressable>
          <Image
            source={{ uri: attachment.url }}
            style={styles.previewImage}
            contentFit="contain"
            onError={() => {
              setUnavailable(true);
              setPreviewOpen(false);
              toast({
                title: "Image unavailable",
                message: "This image may have expired or been removed.",
                preset: "error",
              });
            }}
          />
          <Pressable
            onPress={() => void shareAttachment()}
            style={styles.previewShare}
            accessibilityLabel="Share attachment"
          >
            <Share2 size={17} color="#FFFFFF" />
            <Text style={styles.previewShareText}>Share</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    overflow: "hidden",
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.97)",
  },
  main: {
    minHeight: 58,
    padding: 7,
    paddingRight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  imageFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  pdfIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F0",
  },
  copy: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 11, fontWeight: "700", color: "#172033" },
  fileType: { marginTop: 2, fontSize: 9, color: "#64748B" },
  share: {
    position: "absolute",
    right: 6,
    top: 13,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  preview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#080B12",
  },
  previewImage: { width: "100%", height: "78%" },
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
  previewShareText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
});
