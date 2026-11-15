import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Check, ImageOff, Send, X } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConversationPickerModal } from "@/components/ConversationPickerModal";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import {
  type DurableSenecaImageMedia,
  SenecaImageSendError,
  sendSenecaImageToConversation,
  senecaConversationLabel,
} from "@/lib/seneca-image-chat";
import { ApiError } from "@/lib/api/api";
import type { SenecaGeneratedImage } from "@/lib/seneca-api";
import type { Conversation } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";

type Props = {
  visible: boolean;
  image: SenecaGeneratedImage;
  onClose: () => void;
};

function sendErrorMessage(error: unknown): string {
  if (
    error instanceof SenecaImageSendError &&
    error.stage === "copy" &&
    error.originalError instanceof ApiError &&
    (error.originalError.status === 404 || error.originalError.status === 410)
  ) {
    return "This Seneca image is no longer available. Create it again, then retry.";
  }
  if (error instanceof SenecaImageSendError && error.stage === "copy") {
    return "Alenio couldn’t prepare this image for chat. Check your connection and try again.";
  }
  if (error instanceof SenecaImageSendError && error.stage === "message") {
    return "The image is ready, but the message wasn’t delivered. Your selection and caption are saved—try again.";
  }
  return error instanceof Error
    ? error.message
    : "The image couldn’t be sent. Your caption is saved so you can retry.";
}

export function SenecaImageSendFlow({
  visible,
  image,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [caption, setCaption] = useState<string>("");
  const [previewFailed, setPreviewFailed] = useState<boolean>(false);
  const [sent, setSent] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [durableMedia, setDurableMedia] =
    useState<DurableSenecaImageMedia | null>(null);
  const currentUserId = session?.user?.id ?? "";
  const destinationName = selectedConversation
    ? senecaConversationLabel(selectedConversation, currentUserId)
    : "";

  useEffect(() => {
    if (visible) return;
    setSelectedConversation(null);
    setCaption("");
    setPreviewFailed(false);
    setSent(false);
    setErrorMessage(null);
    setDurableMedia(null);
  }, [visible]);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(onClose, 2200);
    return () => clearTimeout(timer);
  }, [onClose, sent]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversation) throw new Error("Choose a conversation first.");
      return sendSenecaImageToConversation({
        generationId: image.generationId,
        conversationId: selectedConversation.id,
        caption,
        durableMedia,
        onDurableMedia: setDurableMedia,
      });
    },
    onSuccess: async () => {
      if (!selectedConversation) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["dms"] }),
        queryClient.invalidateQueries({
          queryKey: ["dm-messages", selectedConversation.id],
        }),
      ]);
      setErrorMessage(null);
      setSent(true);
    },
    onError: (error) => {
      setErrorMessage(sendErrorMessage(error));
    },
  });

  return (
    <>
      <ConversationPickerModal
        visible={Boolean(visible && selectedConversation === null)}
        onClose={onClose}
        onSelect={(conversation) => {
          setSelectedConversation(conversation);
          setErrorMessage(null);
          setSent(false);
        }}
      />

      <Modal
        visible={Boolean(visible && selectedConversation !== null)}
        animationType="slide"
        presentationStyle="fullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => {
          if (!sendMutation.isPending) setSelectedConversation(null);
        }}
      >
        <SafeKeyboardAvoidingView
          style={[styles.screen, { paddingTop: insets.top }]}
          testID="seneca-image-send-preview"
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => setSelectedConversation(null)}
              disabled={sendMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Back to conversations"
              style={styles.closeButton}
              testID="seneca-image-send-back"
            >
              <X size={18} color="#64748B" strokeWidth={2.2} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>SEND IMAGE TO</Text>
              <Text style={styles.title} numberOfLines={1}>
                {destinationName}
              </Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {sent ? (
            <View
              style={[styles.successToast, { top: insets.top + 68 }]}
              testID="seneca-image-send-success"
            >
              <View style={styles.successIcon}>
                <Check size={15} color="#FFFFFF" strokeWidth={2.8} />
              </View>
              <View style={styles.successCopy}>
                <Text style={styles.successTitle}>Sent</Text>
                <Text style={styles.successBody} numberOfLines={1}>
                  Shared with {destinationName}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.previewArea}>
            <View style={styles.imageFrame}>
              {previewFailed ? (
                <View style={styles.imageUnavailable}>
                  <ImageOff size={26} color="#94A3B8" strokeWidth={1.8} />
                  <Text style={styles.unavailableTitle}>Preview unavailable</Text>
                  <Text style={styles.unavailableBody}>
                    You can still try sending. If the image expired, Alenio will
                    keep this screen open so you can retry.
                  </Text>
                </View>
              ) : (
                <Image
                  source={{ uri: image.url }}
                  style={styles.image}
                  contentFit="contain"
                  onError={() => setPreviewFailed(true)}
                />
              )}
            </View>
          </View>

          {!sent ? (
            <View
              style={[
                styles.composer,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              {errorMessage ? (
                <View style={styles.errorBox} testID="seneca-image-send-error">
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}
              <View style={styles.captionRow}>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Add an optional caption"
                  placeholderTextColor="#94A3B8"
                  multiline
                  maxLength={2000}
                  editable={!sendMutation.isPending}
                  style={styles.captionInput}
                  testID="seneca-image-caption-input"
                />
                <Pressable
                  onPress={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Send image to ${destinationName}`}
                  style={[
                    styles.sendButton,
                    sendMutation.isPending ? styles.buttonDisabled : null,
                  ]}
                  testID="seneca-image-confirm-send"
                >
                  {sendMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Send size={18} color="#FFFFFF" strokeWidth={2.2} />
                  )}
                </Pressable>
              </View>
              <Pressable
                onPress={onClose}
                disabled={sendMutation.isPending}
                style={styles.cancelButton}
                testID="seneca-image-send-cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
        </SafeKeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080B12" },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerCopy: { flex: 1, minWidth: 0, alignItems: "center", paddingHorizontal: 10 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "#8EA2FF",
  },
  title: { marginTop: 2, fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  headerSpacer: { width: 36 },
  previewArea: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  imageFrame: {
    width: "100%",
    height: "100%",
    maxHeight: 570,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#111827",
  },
  image: { width: "100%", height: "100%" },
  imageUnavailable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 34,
  },
  unavailableTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#CBD5E1",
  },
  unavailableBody: {
    marginTop: 5,
    maxWidth: 280,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    color: "#7E899A",
  },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
  },
  captionRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  captionInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 116,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 23,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F1F5F9",
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
  },
  buttonDisabled: { opacity: 0.65 },
  cancelButton: { alignItems: "center", paddingTop: 10, paddingBottom: 2 },
  cancelText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  errorBox: {
    marginBottom: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  errorText: { fontSize: 11, lineHeight: 16, color: "#B91C1C" },
  successToast: {
    position: "absolute",
    zIndex: 4,
    left: 24,
    right: 24,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.30)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  successIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
  },
  successCopy: { flex: 1, minWidth: 0 },
  successTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  successBody: { marginTop: 1, fontSize: 11, color: "#64748B" },
});
