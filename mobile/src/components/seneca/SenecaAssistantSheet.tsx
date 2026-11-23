import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useAdaptiveLayout,
  useDuoSheetTopClearance,
} from "@/lib/adaptive-layout";
import {
  ArrowUp,
  Camera,
  ChevronRight,
  History,
  FileText,
  ImagePlus,
  Images,
  Lock,
  Paperclip,
  Plus,
  Share2,
  Trash2,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "burnt";
import { SenecaIcon } from "./SenecaIcon";
import {
  askSeneca,
  deleteSenecaConversation,
  editSenecaImage,
  fetchSenecaConversation,
  fetchSenecaConversations,
  fetchSenecaContexts,
  generateSenecaImage,
  type SenecaChatTurn,
  type SenecaAttachment,
  type SenecaContextOption,
  type SenecaImageAttachment,
  type SenecaResolvedContext,
} from "@/lib/seneca-api";
import { ApiError } from "@/lib/api/api";
import { SenecaPlanCheckInCard } from "./SenecaPlanCheckInCard";
import { SenecaCancelCheckInCard } from "./SenecaCancelCheckInCard";
import { SenecaCreateTaskCard } from "./SenecaCreateTaskCard";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { shareSenecaChat } from "@/lib/seneca-chat-share";
import { ME_QUERY_KEY, fetchMeUser } from "@/lib/auth/me-query";
import { useSenecaSheetStore } from "@/lib/state/seneca-sheet-store";
import {
  isSenecaImageEditRequest,
  isSenecaImageRequest,
} from "@/lib/seneca-image-intent";
import { SenecaGeneratedImageCard } from "./SenecaGeneratedImageCard";
import { SenecaAttachmentCard } from "./SenecaAttachmentCard";
import {
  pickAttachmentImage,
  pickPdf,
  takeAttachmentPhoto,
  type PickedFile,
} from "@/lib/file-picker";
import { uploadFile } from "@/lib/upload";
import {
  formatSenecaExpiry,
  formatSenecaUpdatedAt,
  mapSenecaConversationMessages,
  recentSenecaConversations,
  type SenecaPresentedMessage,
} from "@/lib/seneca-conversation-presentation";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { senecaFriendlyErrorMessage } from "@/lib/seneca-error-copy";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";

const COLORS = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  surfaceMute: "#F1F5F9",
  border: "#E8EDF3",
  borderLight: "#EEF2F6",
  text: "#0F172A",
  textMuted: "#64748B",
  textSoft: "#94A3B8",
  brand: "#344FD7",
  brandBright: "#4361EE",
  brandSoft: "#EEF2FF",
  brandBorder: "#DCE4FF",
  send: "#4361EE",
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ONLY_QUESTION =
  "Review this attachment and summarize the key information, risks, and useful next steps.";
const HISTORY_SCOPE = "all";

function isEditableImageFile(
  file: PickedFile,
): file is PickedFile & { mimeType: SenecaImageAttachment["mimeType"] } {
  return (
    file.mimeType === "image/jpeg" ||
    file.mimeType === "image/png" ||
    file.mimeType === "image/webp"
  );
}

type PreparingKind =
  | "upload"
  | "default"
  | "coach"
  | "oneOnOne"
  | "checkIns"
  | "plan"
  | "image"
  | "imageEdit";

function preparingLabel(kind: PreparingKind): string | null {
  switch (kind) {
    case "upload":
      return "Reviewing attachment…";
    case "image":
      return "Creating your image…";
    case "imageEdit":
      return "Editing image…";
    default:
      return null;
  }
}

function resolvePreparingKind(question: string): PreparingKind {
  const q = question.toLowerCase();
  if (/\b(1:1|1-1|one[- ]?on[- ]?one|talking points|prepare.*(check[- ]?in|meeting))\b/.test(q)) {
    return "oneOnOne";
  }
  if (/\b(check[- ]?ins?|recent check|team trends|summarize.*check)\b/.test(q)) {
    return "checkIns";
  }
  if (/\b(task|checklist|assign|follow[- ]?up|plan for|create a)\b/.test(q)) {
    return "plan";
  }
  if (/\b(coach|feedback|leadership|engage|motivat)\b/.test(q)) {
    return "coach";
  }
  return "default";
}

function timeBasedGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameFrom(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}

function PreparingStatus({ kind }: { kind: PreparingKind }) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPulse((value) => (value + 1) % 3), 420);
    return () => clearInterval(id);
  }, []);

  const label = preparingLabel(kind);

  return (
    <View
      style={styles.thinkingRow}
      testID="seneca-thinking"
      accessibilityLabel={label ?? "Seneca is responding"}
    >
      <View style={styles.thinkingDots} accessibilityElementsHidden>
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.thinkingDot,
              { opacity: pulse === index ? 1 : 0.28 },
            ]}
          />
        ))}
      </View>
      {label ? <Text style={styles.thinkingText}>{label}</Text> : null}
    </View>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
};

type SenecaChatMessage = SenecaPresentedMessage;

function usingLabelForContext(context: SenecaResolvedContext | null | undefined): string | null {
  if (!context) return null;
  return context.type === "personal" ? "Using Personal" : `Using ${context.name}`;
}

function managerWorkspaceFromMessage(
  context: SenecaResolvedContext | null | undefined,
  options: SenecaContextOption[],
): { teamId: string; role: "owner" | "team_leader" | "member" } | null {
  if (context?.type !== "workspace") return null;
  const option = options.find(
    (item): item is Extract<SenecaContextOption, { type: "workspace" }> =>
      item.type === "workspace" && item.workspaceId === context.workspaceId,
  );
  if (!option) return { teamId: context.workspaceId, role: "member" };
  const role =
    option.role === "owner" || option.role === "team_leader"
      ? option.role
      : "member";
  return { teamId: context.workspaceId, role };
}

function StickyAskBar({
  value,
  onChange,
  onSend,
  disabled,
  bottomInset,
  inline = false,
  imageMode,
  onToggleImageMode,
  pendingAttachment,
  onOpenAttachments,
  onRemoveAttachment,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  bottomInset: number;
  inline?: boolean;
  imageMode: boolean;
  onToggleImageMode: () => void;
  pendingAttachment: PickedFile | null;
  onOpenAttachments: () => void;
  onRemoveAttachment: () => void;
}) {
  const canSend =
    (value.trim().length > 0 || pendingAttachment !== null) && !disabled;
  const editingImage =
    pendingAttachment !== null &&
    isSenecaImageEditRequest(value, pendingAttachment.mimeType);

  return (
    <View
      style={[
        inline ? styles.inlineAskBar : styles.askBar,
        !inline ? { paddingBottom: Math.max(bottomInset, 10) } : null,
      ]}
    >
      <View
        style={[
          styles.askComposer,
          inline ? styles.inlineAskComposer : null,
          imageMode || editingImage ? styles.imageAskComposer : null,
        ]}
      >
        {imageMode || editingImage ? (
          <View style={styles.imageModeLabel}>
            <ImagePlus size={12} color={COLORS.brandBright} strokeWidth={2.2} />
            <Text style={styles.imageModeLabelText}>
              {editingImage ? "Edit image" : "Create image"}
            </Text>
          </View>
        ) : null}
        {pendingAttachment ? (
          <View style={styles.pendingAttachment} testID="seneca-pending-attachment">
            {pendingAttachment.mimeType === "application/pdf" ? (
              <View style={styles.pendingPdfIcon}>
                <FileText size={18} color="#B42318" />
              </View>
            ) : (
              <Image
                source={{ uri: pendingAttachment.uri }}
                style={styles.pendingThumbnail}
                contentFit="cover"
              />
            )}
            <View style={styles.pendingAttachmentCopy}>
              <Text style={styles.pendingAttachmentName} numberOfLines={1}>
                {pendingAttachment.filename}
              </Text>
              <Text style={styles.pendingAttachmentType}>
                {pendingAttachment.mimeType === "application/pdf"
                  ? "PDF ready"
                  : editingImage
                    ? "Image ready · edit detected"
                    : "Image ready"}
              </Text>
            </View>
            <Pressable
              onPress={onRemoveAttachment}
              hitSlop={8}
              accessibilityLabel={`Remove ${pendingAttachment.filename}`}
              testID="seneca-remove-attachment"
              style={styles.pendingRemove}
            >
              <X size={15} color={COLORS.textMuted} />
            </Pressable>
          </View>
        ) : null}
        <TextInput
          style={styles.askInput}
          placeholder={
            imageMode
              ? "Describe the image you want…"
              : editingImage
                ? "Describe the changes you want…"
              : "Ask Seneca anything…"
          }
          placeholderTextColor={COLORS.textSoft}
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={4000}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!disabled}
          testID="seneca-ask-input"
        />
        <View style={styles.askComposerFooter}>
          <View style={styles.composerTools}>
            <Pressable
              onPress={onOpenAttachments}
              disabled={disabled || imageMode}
              hitSlop={8}
              accessibilityLabel="Add attachment"
              testID="seneca-attach-button"
              accessibilityState={{ disabled: disabled || imageMode }}
              style={[
                styles.attachBtn,
                imageMode ? styles.attachBtnDisabled : null,
              ]}
            >
              <Paperclip size={18} color={COLORS.textSoft} strokeWidth={2.1} />
            </Pressable>
            <Pressable
              onPress={onToggleImageMode}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: imageMode }}
              accessibilityLabel={
                imageMode ? "Turn off image generation" : "Create an image"
              }
              style={[
                styles.promptBtn,
                imageMode ? styles.imageModeButtonActive : null,
              ]}
              testID="seneca-image-mode-button"
            >
              <ImagePlus
                size={14}
                color={imageMode ? "#FFFFFF" : COLORS.brandBright}
                strokeWidth={2.1}
              />
            </Pressable>
          </View>
          <Pressable
            onPress={onSend}
            disabled={!canSend}
            testID="seneca-ask-submit"
            accessibilityLabel="Send message"
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          >
            <ArrowUp size={16} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        </View>
      </View>
      {!inline ? <PrivacyNote /> : null}
    </View>
  );
}

function PrivacyNote() {
  return (
    <View style={styles.privacyRow}>
      <Lock size={10} color={COLORS.textSoft} strokeWidth={2.2} />
      <View style={styles.privacyCopy}>
        <Text style={styles.privacyText}>Private · Your data stays secure</Text>
        <Text style={styles.privacyDisclaimer}>
          Seneca can make mistakes. Verify important information.
        </Text>
      </View>
    </View>
  );
}

function AttachmentPickerSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (source: "library" | "camera" | "pdf") => void;
}) {
  const options = [
    { id: "library" as const, label: "Photo Library", Icon: Images },
    { id: "camera" as const, label: "Take Photo", Icon: Camera },
    { id: "pdf" as const, label: "Choose PDF", Icon: FileText },
  ];
  return (
    <AlenioBottomSheet
      visible={visible}
      title="Add attachment"
      subtitle="Images or PDF · up to 10 MB"
      onClose={onClose}
      compact
      showCloseButton
      scrollEnabled={false}
      testID="seneca-attachment-picker"
    >
      <View style={styles.pickerOptions}>
        {options.map(({ id, label, Icon }) => (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            style={styles.pickerOption}
            accessibilityRole="button"
            testID={`seneca-attachment-${id}`}
          >
            <View style={styles.pickerOptionIcon}>
              <Icon size={18} color={COLORS.brandBright} strokeWidth={2} />
            </View>
            <Text style={styles.pickerOptionText}>{label}</Text>
            <ChevronRight size={15} color={COLORS.textSoft} />
          </Pressable>
        ))}
      </View>
    </AlenioBottomSheet>
  );
}

export function SenecaAssistantSheet({ open, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const duoSheetTop = useDuoSheetTopClearance({ fullScreen: true });
  /** Clear the notch on phones, or stop just under the Duo status dock. */
  const sheetTopGap = Math.max(duoSheetTop, insets.top);
  const sheetMaxHeight = Math.round(windowH - sheetTopGap);
  const { iconRailEdge, iconRailWidth } = useAdaptiveLayout();
  const queryClient = useQueryClient();
  const pendingPrompt = useSenecaSheetStore((state) => state.pendingPrompt);
  const clearPendingPrompt = useSenecaSheetStore(
    (state) => state.clearPendingPrompt,
  );
  const pendingConversationId = useSenecaSheetStore(
    (state) => state.pendingConversationId,
  );
  const clearPendingConversation = useSenecaSheetStore(
    (state) => state.clearPendingConversation,
  );
  const {
    data: contextOptions = [],
  } = useQuery({
    queryKey: ["seneca-contexts"],
    queryFn: fetchSenecaContexts,
    enabled: open,
    staleTime: 60_000,
  });
  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMeUser(),
    enabled: open,
  });

  const userFirstName = firstNameFrom(me?.name);
  const greeting = timeBasedGreeting();

  const [chatMessages, setChatMessages] = useState<SenecaChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usingLabel, setUsingLabel] = useState<string | null>(null);
  const [askDraft, setAskDraft] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PickedFile | null>(
    null,
  );
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [preparingKind, setPreparingKind] = useState<PreparingKind>("default");
  const [chatError, setChatError] = useState<string | null>(null);
  const [failedImagePrompt, setFailedImagePrompt] = useState<string | null>(
    null,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteCurrentConfirmOpen, setDeleteCurrentConfirmOpen] =
    useState(false);
  const [exporting, setExporting] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const stickToBottomRef = useRef(true);
  const forcingInitialBottomRef = useRef(false);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    if (!open || !pendingPrompt) return;
    setAskDraft(pendingPrompt);
    clearPendingPrompt();
  }, [clearPendingPrompt, open, pendingPrompt]);

  const historyQueryKey = useMemo(
    () => ["seneca-conversations"] as const,
    [],
  );
  const {
    data: conversations = [],
    isFetching: historyFetching,
    isError: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => fetchSenecaConversations(),
    enabled: open,
    staleTime: 15_000,
  });
  const recentConversations = useMemo(
    () => recentSenecaConversations(conversations),
    [conversations],
  );

  const scrollChatToEnd = useCallback((animated = false) => {
    chatScrollRef.current?.scrollToEnd({ animated });
  }, []);

  const handleChatScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (forcingInitialBottomRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const handleChatContentSizeChange = useCallback(() => {
    if (!stickToBottomRef.current && !forcingInitialBottomRef.current) return;
    scrollChatToEnd(false);
    requestAnimationFrame(() => scrollChatToEnd(false));
  }, [scrollChatToEnd]);

  const clearCurrentChat = useCallback(() => {
    requestGenerationRef.current += 1;
    setChatMessages([]);
    setConversationId(null);
    setUsingLabel(null);
    setAskDraft("");
    setImageMode(false);
    setPendingAttachment(null);
    setAttachmentPickerOpen(false);
    setUploadingAttachment(false);
    setThinking(false);
    setPreparingKind("default");
    setChatError(null);
    setFailedImagePrompt(null);
  }, []);

  const chooseAttachment = useCallback(
    async (source: "library" | "camera" | "pdf") => {
      setAttachmentPickerOpen(false);
      try {
        const file =
          source === "library"
            ? await pickAttachmentImage()
            : source === "camera"
              ? await takeAttachmentPhoto()
              : await pickPdf();
        if (!file) return;
        if (
          file.mimeType !== "image/jpeg" &&
          file.mimeType !== "image/png" &&
          file.mimeType !== "image/webp" &&
          file.mimeType !== "application/pdf"
        ) {
          throw new Error("Choose a JPEG, PNG, WebP, or PDF file.");
        }
        if (file.sizeBytes !== undefined && file.sizeBytes > MAX_ATTACHMENT_BYTES) {
          throw new Error("Attachments must be 10 MB or smaller.");
        }
        setPendingAttachment(file);
        setImageMode(false);
        void Haptics.selectionAsync();
      } catch (error) {
        toast({
          title: "Could not add attachment",
          message: error instanceof Error ? error.message : "Please try again.",
          preset: "error",
        });
      }
    },
    [],
  );

  const toggleImageMode = useCallback(() => {
    setImageMode((current) => {
      const next = !current;
      if (next && pendingAttachment) {
        setPendingAttachment(null);
        toast({
          title: "Attachment removed",
          message: "Image creation cannot use an attachment.",
          preset: "none",
        });
      }
      return next;
    });
  }, [pendingAttachment]);

  const resetChat = useCallback(() => {
    clearCurrentChat();
    setHistoryOpen(false);
    setHistoryNotice(null);
    setPendingDeleteId(null);
    setDeleteCurrentConfirmOpen(false);
  }, [clearCurrentChat]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const {
    mutate: mutateLoadConversation,
    isPending: isLoadingConversation,
    variables: loadingConversationVariables,
  } = useMutation({
    mutationFn: ({
      id,
    }: {
      id: string;
      scopeKey: string;
      requestGeneration: number;
    }) => fetchSenecaConversation(id),
    onSuccess: (conversation, variables) => {
      if (
        variables.requestGeneration !== requestGenerationRef.current ||
        variables.scopeKey !== HISTORY_SCOPE
      ) {
        return;
      }
      setConversationId(conversation.id);
      const mapped = mapSenecaConversationMessages(conversation.messages);
      setChatMessages(mapped);
      const lastResolved = [...mapped]
        .reverse()
        .find((message) => message.resolvedContext)?.resolvedContext;
      setUsingLabel(usingLabelForContext(lastResolved ?? null));
      setHistoryOpen(false);
      setHistoryNotice(null);
      setPendingDeleteId(null);
      setChatError(null);
      stickToBottomRef.current = true;
    },
    onError: (error, variables) => {
      if (
        variables.requestGeneration !== requestGenerationRef.current ||
        variables.scopeKey !== HISTORY_SCOPE
      ) {
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        if (conversationId === variables.id) clearCurrentChat();
        setHistoryNotice("That chat expired or is no longer available.");
        void queryClient.invalidateQueries({ queryKey: historyQueryKey });
        return;
      }
      setHistoryNotice(
        error instanceof Error ? error.message : "Could not load that chat.",
      );
    },
  });

  const {
    mutate: mutateDeleteConversation,
    isPending: isDeletingConversation,
    variables: deletingConversationVariables,
  } = useMutation({
    mutationFn: ({
      id,
    }: {
      id: string;
      scopeKey: string;
    }) => deleteSenecaConversation(id),
    onSuccess: (_result, variables) => {
      if (variables.scopeKey !== HISTORY_SCOPE) return;
      if (conversationId === variables.id) {
        setDeleteCurrentConfirmOpen(false);
        clearCurrentChat();
        toast({ title: "Chat deleted", preset: "done" });
      }
      setPendingDeleteId(null);
      setHistoryNotice("Chat deleted.");
      void queryClient.invalidateQueries({ queryKey: historyQueryKey });
    },
    onError: (error, variables) => {
      if (variables.scopeKey !== HISTORY_SCOPE) return;
      if (error instanceof ApiError && error.status === 404) {
        if (conversationId === variables.id) clearCurrentChat();
        setPendingDeleteId(null);
        setHistoryNotice("That chat had already expired or been deleted.");
        void queryClient.invalidateQueries({ queryKey: historyQueryKey });
        return;
      }
      setHistoryNotice(
        error instanceof Error ? error.message : "Could not delete that chat.",
      );
      if (conversationId === variables.id) {
        toast({
          title: "Couldn’t delete chat",
          message: "Please check your connection and try again.",
          preset: "error",
        });
      }
    },
  });

  const startNewChat = useCallback(() => {
    clearCurrentChat();
    setHistoryOpen(false);
    setHistoryNotice(null);
    setPendingDeleteId(null);
  }, [clearCurrentChat]);

  const loadConversation = useCallback(
    (id: string) => {
      const requestGeneration = requestGenerationRef.current + 1;
      requestGenerationRef.current = requestGeneration;
      setThinking(false);
      setHistoryNotice(null);
      mutateLoadConversation({
        id,
        scopeKey: HISTORY_SCOPE,
        requestGeneration,
      });
    },
    [mutateLoadConversation],
  );

  /** Resume a conversation queued from outside the sheet (Home's card). */
  useEffect(() => {
    if (!open || !pendingConversationId) return;
    const id = pendingConversationId;
    clearPendingConversation();
    setHistoryOpen(false);
    loadConversation(id);
  }, [clearPendingConversation, loadConversation, open, pendingConversationId]);

  const runAsk = useCallback(
    (
      question: string,
      kindOverride?: PreparingKind,
      attachmentFile?: PickedFile,
    ) => {
      const trimmed = question.trim();
      if (!trimmed && !attachmentFile) return;
      const visibleQuestion = trimmed || ATTACHMENT_ONLY_QUESTION;
      const requestGeneration = requestGenerationRef.current;
      const requestConversationId = conversationId ?? undefined;

      const history: SenecaChatTurn[] = chatMessages
        .slice(-40)
        .map((message) => ({
          role: message.role,
          content: message.text,
        }));
      const userMessage: SenecaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: visibleQuestion,
        attachment: attachmentFile
          ? {
              url: attachmentFile.uri,
              mimeType: attachmentFile.mimeType as SenecaAttachment["mimeType"],
              fileName: attachmentFile.filename,
              sizeBytes: attachmentFile.sizeBytes ?? 0,
            }
          : null,
      };

      setChatMessages((prev) => [...prev, userMessage]);
      setPreparingKind(
        attachmentFile ? "upload" : kindOverride ?? resolvePreparingKind(trimmed),
      );
      setThinking(true);
      setChatError(null);
      setFailedImagePrompt(null);
      setAskDraft("");
      if (attachmentFile) {
        setPendingAttachment((current) =>
          current?.uri === attachmentFile.uri ? null : current,
        );
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void (async () => {
        try {
          let attachment: SenecaAttachment | undefined;
          if (attachmentFile) {
            setUploadingAttachment(true);
            const uploaded = await uploadFile(
              attachmentFile.uri,
              attachmentFile.filename,
              attachmentFile.mimeType,
            );
            if (uploaded.sizeBytes > MAX_ATTACHMENT_BYTES) {
              throw new Error("Attachments must be 10 MB or smaller.");
            }
            attachment = {
              url: uploaded.url,
              mimeType: attachmentFile.mimeType as SenecaAttachment["mimeType"],
              fileName: uploaded.originalFilename || attachmentFile.filename,
              sizeBytes: uploaded.sizeBytes,
            };
            if (requestGeneration !== requestGenerationRef.current) return;
            setUploadingAttachment(false);
            setPreparingKind(kindOverride ?? resolvePreparingKind(visibleQuestion));
          }
          const res = await askSeneca({
            question: trimmed || undefined,
            attachment,
            messages: history,
            conversationId: requestConversationId,
          });
          if (requestGeneration !== requestGenerationRef.current) {
            return;
          }
          setConversationId(res.conversationId);
          setUsingLabel(usingLabelForContext(res.resolvedContext ?? null));
          if (attachment) {
            setChatMessages((prev) =>
              prev.map((message) =>
                message.id === userMessage.id
                  ? { ...message, attachment }
                  : message,
              ),
            );
            setPendingAttachment((current) =>
              current?.uri === attachmentFile?.uri ? null : current,
            );
            setAskDraft("");
          }
          const assistantMessage: SenecaChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: res.message,
            planProposal: res.planOneOnOne ?? null,
            cancelProposal: res.cancelOneOnOne ?? null,
            createTaskProposal: res.createTask ?? null,
            resolvedContext: res.resolvedContext ?? null,
            clarifyOptions: res.clarify?.options ?? null,
          };
          setChatMessages((prev) => [...prev, assistantMessage]);
          void queryClient.invalidateQueries({ queryKey: historyQueryKey });
        } catch (e) {
          if (requestGeneration !== requestGenerationRef.current) return;
          if (attachmentFile) {
            setChatMessages((prev) =>
              prev.filter((message) => message.id !== userMessage.id),
            );
            setAskDraft(question);
            setPendingAttachment(attachmentFile);
          }
          if (
            e instanceof ApiError &&
            e.status === 404 &&
            requestConversationId
          ) {
            setConversationId(null);
            setChatError(
              "This saved chat expired. Your messages are still visible; send again to start a new chat.",
            );
            void queryClient.invalidateQueries({ queryKey: historyQueryKey });
            return;
          }
          setChatError(senecaFriendlyErrorMessage(e));
        } finally {
          if (requestGeneration === requestGenerationRef.current) {
            setUploadingAttachment(false);
            setThinking(false);
          }
        }
      })();
    },
    [
      chatMessages,
      conversationId,
      historyQueryKey,
      queryClient,
    ],
  );

  const runEditImage = useCallback(
    (prompt: string, attachmentFile: PickedFile) => {
      const trimmed = prompt.trim();
      if (!trimmed || thinking || !isEditableImageFile(attachmentFile)) return;

      const requestGeneration = requestGenerationRef.current;
      const requestConversationId = conversationId ?? undefined;
      const userMessage: SenecaChatMessage = {
        id: `user-image-edit-${Date.now()}`,
        role: "user",
        text: trimmed,
        attachment: {
          url: attachmentFile.uri,
          mimeType: attachmentFile.mimeType,
          fileName: attachmentFile.filename,
          sizeBytes: attachmentFile.sizeBytes ?? 0,
        },
      };

      setChatMessages((prev) => [...prev, userMessage]);
      setPreparingKind("imageEdit");
      setThinking(true);
      setChatError(null);
      setFailedImagePrompt(null);
      setAskDraft("");
      setPendingAttachment((current) =>
        current?.uri === attachmentFile.uri ? null : current,
      );
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void (async () => {
        try {
          const uploaded = await uploadFile(
            attachmentFile.uri,
            attachmentFile.filename,
            attachmentFile.mimeType,
          );
          if (uploaded.sizeBytes > MAX_ATTACHMENT_BYTES) {
            throw new Error("Attachments must be 10 MB or smaller.");
          }

          const attachment: SenecaImageAttachment = {
            url: uploaded.url,
            mimeType: attachmentFile.mimeType,
            fileName: uploaded.originalFilename || attachmentFile.filename,
            sizeBytes: uploaded.sizeBytes,
          };
          if (requestGeneration !== requestGenerationRef.current) return;

          setChatMessages((prev) =>
            prev.map((message) =>
              message.id === userMessage.id
                ? { ...message, attachment }
                : message,
            ),
          );

          const response = await editSenecaImage({
            prompt: trimmed,
            attachment,
            conversationId: requestConversationId,
          });
          if (requestGeneration !== requestGenerationRef.current) return;
          if (response.quota.remaining <= 2) {
            toast({
              title: `${response.quota.remaining} of ${response.quota.limit} image generations remaining`,
              message: `Your limit uses a rolling ${response.quota.windowHours}-hour window.`,
              preset: "none",
            });
          }

          const { conversationId: nextConversationId, ...image } = response;
          setConversationId(nextConversationId);
          setPendingAttachment((current) =>
            current?.uri === attachmentFile.uri ? null : current,
          );
          setAskDraft("");
          setChatMessages((prev) => [
            ...prev,
            {
              id: `assistant-image-edit-${Date.now()}`,
              role: "assistant",
              text: "Here’s the edited image. You can open it full screen or share it.",
              generatedImage: image,
            },
          ]);
          void queryClient.invalidateQueries({ queryKey: historyQueryKey });
        } catch (error) {
          if (requestGeneration !== requestGenerationRef.current) return;
          setChatMessages((prev) =>
            prev.filter((message) => message.id !== userMessage.id),
          );
          setAskDraft(trimmed);
          setPendingAttachment(attachmentFile);
          if (
            error instanceof ApiError &&
            error.status === 404 &&
            requestConversationId
          ) {
            setConversationId(null);
            setChatError(
              "This saved chat expired. Your image and instructions are ready to retry in a new chat.",
            );
            void queryClient.invalidateQueries({ queryKey: historyQueryKey });
            return;
          }
          setChatError(senecaFriendlyErrorMessage(error));
        } finally {
          if (requestGeneration === requestGenerationRef.current) {
            setThinking(false);
          }
        }
      })();
    },
    [
      conversationId,
      historyQueryKey,
      queryClient,
      thinking,
    ],
  );

  const runImage = useCallback(
    (prompt: string, appendUserMessage = true) => {
      const trimmed = prompt.trim();
      if (!trimmed || thinking) return;
      const requestGeneration = requestGenerationRef.current;
      const requestConversationId = conversationId ?? undefined;
      if (appendUserMessage) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `user-image-${Date.now()}`,
            role: "user",
            text: trimmed,
          },
        ]);
      }
      setPreparingKind("image");
      setThinking(true);
      setChatError(null);
      setFailedImagePrompt(null);
      setAskDraft("");
      setImageMode(false);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void (async () => {
        try {
          const response = await generateSenecaImage({
            prompt: trimmed,
            conversationId: requestConversationId,
          });
          if (requestGeneration !== requestGenerationRef.current) return;
          if (response.quota.remaining <= 2) {
            toast({
              title: `${response.quota.remaining} of ${response.quota.limit} image generations remaining`,
              message: `Your limit uses a rolling ${response.quota.windowHours}-hour window.`,
              preset: "none",
            });
          }
          const { conversationId: nextConversationId, ...image } = response;
          setConversationId(nextConversationId);
          setChatMessages((prev) => [
            ...prev,
            {
              id: `assistant-image-${Date.now()}`,
              role: "assistant",
              text: "Here’s the image I created for you.",
              generatedImage: image,
            },
          ]);
          void queryClient.invalidateQueries({ queryKey: historyQueryKey });
        } catch (error) {
          if (requestGeneration !== requestGenerationRef.current) return;
          setFailedImagePrompt(trimmed);
          if (
            error instanceof ApiError &&
            error.status === 404 &&
            requestConversationId
          ) {
            setConversationId(null);
            setChatError(
              "This saved chat expired. Your messages are still visible; try again to start a new chat.",
            );
            void queryClient.invalidateQueries({ queryKey: historyQueryKey });
            return;
          }
          setChatError(senecaFriendlyErrorMessage(error));
        } finally {
          if (requestGeneration === requestGenerationRef.current) {
            setThinking(false);
          }
        }
      })();
    },
    [
      conversationId,
      historyQueryKey,
      queryClient,
      thinking,
    ],
  );

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [chatMessages.length]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const timer = setTimeout(() => scrollChatToEnd(true), 50);
    return () => clearTimeout(timer);
  }, [chatMessages, thinking, chatError, scrollChatToEnd]);

  useEffect(() => {
    if (!open || historyOpen || !conversationId) return;
    stickToBottomRef.current = true;
    forcingInitialBottomRef.current = true;
    scrollChatToEnd(false);
    const shortTimer = setTimeout(() => scrollChatToEnd(false), 80);
    const layoutTimer = setTimeout(() => scrollChatToEnd(false), 320);
    const mediaTimer = setTimeout(() => scrollChatToEnd(false), 650);
    const releaseTimer = setTimeout(() => {
      scrollChatToEnd(false);
      forcingInitialBottomRef.current = false;
    }, 800);
    return () => {
      clearTimeout(shortTimer);
      clearTimeout(layoutTimer);
      clearTimeout(mediaTimer);
      clearTimeout(releaseTimer);
      forcingInitialBottomRef.current = false;
    };
  }, [conversationId, historyOpen, open, scrollChatToEnd]);

  const onAskSubmit = () => {
    if ((!askDraft.trim() && !pendingAttachment) || thinking) return;
    const prompt = askDraft.trim();
    if (
      pendingAttachment &&
      isSenecaImageEditRequest(prompt, pendingAttachment.mimeType)
    ) {
      runEditImage(prompt, pendingAttachment);
      return;
    }
    if (!pendingAttachment && (imageMode || isSenecaImageRequest(prompt))) {
      runImage(prompt);
      return;
    }
    runAsk(prompt, undefined, pendingAttachment ?? undefined);
  };

  const onPlanCheckInSaved = (messageId: string, summary: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: summary,
              planProposal: null,
              cancelProposal: null,
              createTaskProposal: null,
            }
          : message,
      ),
    );
  };

  const onCheckInCancelled = (messageId: string, summary: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: summary,
              planProposal: null,
              cancelProposal: null,
              createTaskProposal: null,
            }
          : message,
      ),
    );
  };

  const onTaskCreated = (messageId: string, summary: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: summary,
              planProposal: null,
              cancelProposal: null,
              createTaskProposal: null,
            }
          : message,
      ),
    );
  };

  const dismissPlanProposal = (messageId: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, planProposal: null } : message,
      ),
    );
  };

  const dismissCancelProposal = (messageId: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, cancelProposal: null } : message,
      ),
    );
  };

  const dismissCreateTaskProposal = (messageId: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, createTaskProposal: null } : message,
      ),
    );
  };

  const shareMessages = useMemo(
    () =>
      chatMessages.map((message) => ({
        role: message.role,
        text: message.text,
        attachmentFileName: message.attachment?.fileName,
        generatedImageUrl: message.generatedImage?.url,
      })),
    [chatMessages],
  );

  const onShareChat = useCallback(async () => {
    setExporting(true);
    try {
      await shareSenecaChat(shareMessages, usingLabel ?? "Seneca");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not share chat",
        preset: "error",
      });
    } finally {
      setExporting(false);
    }
  }, [shareMessages, usingLabel]);

  const onHistoryPress = useCallback(() => {
    Keyboard.dismiss();
    setPendingDeleteId(null);
    setHistoryNotice(null);
    setHistoryOpen((value) => !value);
  }, []);

  const onDeleteCurrentChat = useCallback(() => {
    if (!conversationId || thinking || isDeletingConversation) return;
    setDeleteCurrentConfirmOpen(true);
  }, [conversationId, isDeletingConversation, thinking]);

  const canExport = chatMessages.length > 0 && !thinking && !exporting;
  const canDeleteCurrentChat =
    Boolean(conversationId) && chatMessages.length > 0 && !historyOpen;
  const deletingCurrentChat =
    isDeletingConversation &&
    deletingConversationVariables?.id === conversationId;
  const showHome = chatMessages.length === 0 && !thinking && !chatError;
  const isSenecaHome = showHome && !historyOpen;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop} testID="seneca-assistant-sheet">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityLabel="Close Seneca"
        />
        <View style={[styles.sheet, { height: sheetMaxHeight }]}>
          <View style={styles.handle} />
          <SafeKeyboardAvoidingView style={styles.flex}>
          <View style={styles.headerBar}>
            <View
              style={[
                styles.header,
                iconRailEdge === "left" ? { paddingLeft: iconRailWidth } : null,
                iconRailEdge === "right" ? { paddingRight: iconRailWidth } : null,
              ]}
            >
              <View style={styles.headerIconWrap}>
                <SenecaIcon size={28} />
              </View>
              <View style={styles.headerText}>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Seneca</Text>
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>BETA</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>Your leadership assistant</Text>
              </View>
              <View style={styles.headerActions}>
                {canExport ? (
                  <Pressable
                    onPress={() => void onShareChat()}
                    style={styles.headerIconBtn}
                    accessibilityLabel="Share Seneca chat"
                    testID="seneca-share-button"
                  >
                    <Share2 size={21} color={COLORS.textMuted} strokeWidth={2.1} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onHistoryPress}
                  style={styles.headerIconBtn}
                  accessibilityLabel="Chat history"
                  testID="seneca-history-button"
                >
                  <History size={21} color={COLORS.textMuted} strokeWidth={2.1} />
                </Pressable>
                {canDeleteCurrentChat ? (
                  <Pressable
                    onPress={onDeleteCurrentChat}
                    disabled={thinking || deletingCurrentChat}
                    style={[
                      styles.headerIconBtn,
                      (thinking || deletingCurrentChat) &&
                        styles.headerIconBtnDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Delete this chat"
                    testID="seneca-delete-current-chat"
                  >
                    {deletingCurrentChat ? (
                      <ActivityIndicator size="small" color="#B45353" />
                    ) : (
                      <Trash2 size={21} color="#B45353" strokeWidth={2.1} />
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={isSenecaHome ? handleClose : startNewChat}
                  accessibilityLabel={
                    isSenecaHome ? "Close Seneca" : "Return to Seneca home"
                  }
                  style={styles.headerIconBtn}
                  testID="seneca-close-button"
                >
                  <X size={21} color={COLORS.textMuted} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>
          </View>

          {usingLabel && !historyOpen && !showHome ? (
            <View style={styles.contextSection} testID="seneca-using-label">
              <Text style={styles.usingLabel}>{usingLabel}</Text>
            </View>
          ) : null}

          {historyOpen ? (
            <ScrollView
              style={styles.historyPane}
              contentContainerStyle={[
                styles.historyContent,
                { paddingBottom: Math.max(insets.bottom, 18) },
              ]}
              showsVerticalScrollIndicator={false}
              testID="seneca-history-panel"
            >
              <View style={styles.historyHeadingRow}>
                <View style={styles.historyHeadingCopy}>
                  <Text style={styles.historyTitle}>Chat history</Text>
                  {conversations.length > 0 || historyFetching || historyError ? (
                    <Text style={styles.historyRetention}>
                      Chats are private and automatically removed 7 days after the latest message.
                    </Text>
                  ) : null}
                </View>
                {conversations.length > 0 ? (
                  <Pressable
                    onPress={startNewChat}
                    style={styles.newChatButton}
                    accessibilityRole="button"
                    testID="seneca-new-chat-button"
                  >
                    <Plus size={14} color="#FFFFFF" strokeWidth={2.4} />
                    <Text style={styles.newChatButtonText}>New chat</Text>
                  </Pressable>
                ) : null}
              </View>

              {historyNotice ? (
                <View style={styles.historyNotice} testID="seneca-history-notice">
                  <Text style={styles.historyNoticeText}>{historyNotice}</Text>
                </View>
              ) : null}

              {historyFetching && conversations.length === 0 ? (
                <View style={styles.historyState} testID="seneca-history-loading">
                  <ActivityIndicator color={COLORS.brandBright} />
                  <Text style={styles.historyStateText}>Loading chats…</Text>
                </View>
              ) : historyError ? (
                <View style={styles.historyState} testID="seneca-history-error">
                  <Text style={styles.historyStateText}>
                    Chat history could not be loaded.
                  </Text>
                  <Pressable
                    onPress={() => void refetchHistory()}
                    style={styles.historyRetry}
                    testID="seneca-history-retry"
                  >
                    <Text style={styles.historyRetryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : conversations.length === 0 ? (
                <View style={styles.historyEmpty} testID="seneca-history-empty">
                  <View style={styles.historyEmptyIcon}>
                    <History size={25} color={COLORS.brandBright} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.historyEmptyTitle}>Your chat history starts here</Text>
                  <Text style={styles.historyEmptyText}>
                    Conversations are private and saved for 7 days.
                  </Text>
                  <Pressable
                    onPress={startNewChat}
                    style={styles.historyEmptyButton}
                    accessibilityRole="button"
                    testID="seneca-empty-new-chat-button"
                  >
                    <Plus size={15} color="#FFFFFF" strokeWidth={2.4} />
                    <Text style={styles.historyEmptyButtonText}>Start a new chat</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.historyList}>
                  {conversations.map((conversation) => {
                    const deleting =
                      isDeletingConversation &&
                      deletingConversationVariables?.id === conversation.id;
                    const loading =
                      isLoadingConversation &&
                      loadingConversationVariables?.id === conversation.id;
                    const confirming = pendingDeleteId === conversation.id;
                    return (
                      <View
                        key={conversation.id}
                        style={[
                          styles.historyCard,
                          conversationId === conversation.id
                            ? styles.historyCardActive
                            : null,
                        ]}
                        testID={`seneca-history-item-${conversation.id}`}
                      >
                        <Pressable
                          onPress={() => loadConversation(conversation.id)}
                          disabled={loading || deleting}
                          style={styles.historyCardMain}
                          accessibilityRole="button"
                          accessibilityLabel={`Resume ${conversation.title}`}
                          testID={`seneca-history-open-${conversation.id}`}
                        >
                          <View style={styles.historyCardCopy}>
                            <Text style={styles.historyCardTitle} numberOfLines={1}>
                              {conversation.title || "Untitled chat"}
                            </Text>
                            <Text style={styles.historyCardPreview} numberOfLines={2}>
                              {conversation.preview || "No preview available"}
                            </Text>
                            <Text style={styles.historyCardMeta}>
                              {formatSenecaUpdatedAt(conversation.updatedAt)}
                              {" · "}
                              {formatSenecaExpiry(conversation.expiresAt)}
                            </Text>
                          </View>
                          {loading ? (
                            <ActivityIndicator
                              size="small"
                              color={COLORS.brandBright}
                            />
                          ) : (
                            <ChevronRight size={16} color={COLORS.textSoft} />
                          )}
                        </Pressable>

                        {confirming ? (
                          <View style={styles.deleteConfirm}>
                            <Text style={styles.deleteConfirmText}>
                              Delete this chat permanently?
                            </Text>
                            <Pressable
                              onPress={() => setPendingDeleteId(null)}
                              style={styles.deleteCancelButton}
                              disabled={deleting}
                              testID={`seneca-history-delete-cancel-${conversation.id}`}
                            >
                              <Text style={styles.deleteCancelText}>Cancel</Text>
                            </Pressable>
                            <Pressable
                              onPress={() =>
                                mutateDeleteConversation({
                                  id: conversation.id,
                                  scopeKey: HISTORY_SCOPE,
                                })
                              }
                              style={styles.deleteConfirmButton}
                              disabled={deleting}
                              testID={`seneca-history-delete-confirm-${conversation.id}`}
                            >
                              {deleting ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.deleteConfirmButtonText}>
                                  Delete
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            onPress={() => setPendingDeleteId(conversation.id)}
                            style={styles.historyDeleteButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${conversation.title}`}
                            testID={`seneca-history-delete-${conversation.id}`}
                          >
                            <Trash2 size={14} color="#B45353" strokeWidth={2} />
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          ) : showHome ? (
            <ScrollView
              style={styles.homePane}
              contentContainerStyle={[
                styles.homeContent,
                { paddingBottom: Math.max(insets.bottom, 18) },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              testID="seneca-home"
            >
              <View style={styles.welcomeSection}>
                <Text style={styles.welcomeGreeting} accessibilityRole="header">
                  👋 {greeting}, <Text style={styles.welcomeName}>{userFirstName}</Text>
                </Text>
                <Text style={styles.welcomeSupport} numberOfLines={2}>
                  What can I help you with?
                </Text>
              </View>

              {recentConversations.length > 0 ? (
                <View style={styles.homeSection} testID="seneca-home-recent">
                  <View style={styles.recentHeader}>
                    <Text style={styles.homeSectionTitle}>Recent chats</Text>
                    {conversations.length > 3 ? (
                      <Pressable
                        onPress={onHistoryPress}
                        accessibilityRole="button"
                        testID="seneca-home-recent-view-all"
                      >
                        <Text style={styles.recentViewAll}>View all</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.recentList}>
                    {recentConversations.map((conversation, index) => {
                      const loading =
                        isLoadingConversation &&
                        loadingConversationVariables?.id === conversation.id;
                      return (
                        <Pressable
                          key={conversation.id}
                          onPress={() => loadConversation(conversation.id)}
                          disabled={loading}
                          style={[
                            styles.recentRow,
                            index > 0 ? styles.recentRowBorder : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Resume ${conversation.title}`}
                          testID={`seneca-home-recent-${conversation.id}`}
                        >
                          <View style={styles.recentCopy}>
                            <Text style={styles.recentTitle} numberOfLines={1}>
                              {conversation.title || "Untitled chat"}
                            </Text>
                            <Text style={styles.recentPreview} numberOfLines={1}>
                              {conversation.preview || "No preview available"}
                            </Text>
                          </View>
                          <Text style={styles.recentUpdated}>
                            {formatSenecaUpdatedAt(conversation.updatedAt)}
                          </Text>
                          {loading ? (
                            <ActivityIndicator
                              size="small"
                              color={COLORS.brandBright}
                            />
                          ) : (
                            <ChevronRight
                              size={14}
                              color={COLORS.textSoft}
                              strokeWidth={2.2}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

            </ScrollView>
          ) : (
            <ScrollView
              ref={chatScrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.chatScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleChatScroll}
              scrollEventThrottle={16}
              onLayout={handleChatContentSizeChange}
              onContentSizeChange={handleChatContentSizeChange}
              testID="seneca-chat-scroll"
            >
              {chatMessages.map((chatMessage) =>
                chatMessage.role === "user" ? (
                  <View key={chatMessage.id} style={styles.userBubble}>
                    <Text style={styles.userBubbleText}>{chatMessage.text}</Text>
                    {chatMessage.attachment ? (
                      <SenecaAttachmentCard attachment={chatMessage.attachment} />
                    ) : null}
                  </View>
                ) : (
                  <View key={chatMessage.id} style={styles.senecaBlock}>
                    <View style={styles.senecaBlockBody}>
                      <View style={styles.senecaBlockHead}>
                        <View style={styles.senecaBlockAvatar}>
                          <SenecaIcon size={16} />
                        </View>
                        <Text style={styles.senecaBlockName}>Seneca</Text>
                      </View>
                      <Text style={styles.senecaMessage}>{chatMessage.text}</Text>
                      {chatMessage.clarifyOptions && chatMessage.clarifyOptions.length > 0 ? (
                        <View style={styles.clarifyRow} testID="seneca-clarify-options">
                          {chatMessage.clarifyOptions.map((option) => (
                            <Pressable
                              key={
                                option.type === "personal"
                                  ? "personal"
                                  : option.workspaceId
                              }
                              onPress={() =>
                                runAsk(
                                  option.type === "personal"
                                    ? "Use personal."
                                    : option.name,
                                )
                              }
                              disabled={thinking}
                              style={styles.clarifyChip}
                              testID={
                                option.type === "personal"
                                  ? "seneca-clarify-personal"
                                  : `seneca-clarify-${option.workspaceId}`
                              }
                            >
                              <Text style={styles.clarifyChipText}>{option.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      {chatMessage.generatedImage ? (
                        <SenecaGeneratedImageCard image={chatMessage.generatedImage} />
                      ) : null}

                      {(() => {
                        const workspace = managerWorkspaceFromMessage(
                          chatMessage.resolvedContext,
                          contextOptions,
                        );
                        if (!workspace || workspace.role === "member") return null;
                        return (
                          <>
                            {chatMessage.cancelProposal ? (
                              <SenecaCancelCheckInCard
                                teamId={workspace.teamId}
                                proposal={chatMessage.cancelProposal}
                                onCancelled={(summary) =>
                                  onCheckInCancelled(chatMessage.id, summary)
                                }
                                onDismiss={() => dismissCancelProposal(chatMessage.id)}
                              />
                            ) : null}
                            {chatMessage.planProposal ? (
                              <SenecaPlanCheckInCard
                                teamId={workspace.teamId}
                                proposal={chatMessage.planProposal}
                                onSaved={(summary) =>
                                  onPlanCheckInSaved(chatMessage.id, summary)
                                }
                                onDismiss={() => dismissPlanProposal(chatMessage.id)}
                              />
                            ) : null}
                            {chatMessage.createTaskProposal ? (
                              <SenecaCreateTaskCard
                                teamId={workspace.teamId}
                                role={workspace.role}
                                proposal={chatMessage.createTaskProposal}
                                onSaved={(summary) =>
                                  onTaskCreated(chatMessage.id, summary)
                                }
                                onDismiss={() => dismissCreateTaskProposal(chatMessage.id)}
                              />
                            ) : null}
                          </>
                        );
                      })()}
                    </View>
                  </View>
                ),
              )}

              {thinking ? (
                <View style={styles.senecaBlock}>
                  <View style={styles.senecaBlockBody}>
                    <View style={styles.senecaBlockHead}>
                      <View style={styles.senecaBlockAvatar}>
                        <SenecaIcon size={16} />
                      </View>
                      <Text style={styles.senecaBlockName}>Seneca</Text>
                    </View>
                    <PreparingStatus
                      kind={uploadingAttachment ? "upload" : preparingKind}
                    />
                  </View>
                </View>
              ) : null}

              {chatError ? (
                <View style={styles.errorCard} testID="seneca-chat-error">
                  <View style={styles.errorHeader}>
                    <SenecaIcon size={14} />
                    <Text style={styles.errorTitle}>Seneca</Text>
                  </View>
                  <Text style={styles.errorText}>{chatError}</Text>
                  {failedImagePrompt ? (
                    <Pressable
                      onPress={() => runImage(failedImagePrompt, false)}
                      style={styles.retryButton}
                      accessibilityRole="button"
                      testID="seneca-image-retry"
                    >
                      <Text style={styles.retryButtonText}>Try again</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          )}

          {!historyOpen ? (
            <StickyAskBar
              value={askDraft}
              onChange={setAskDraft}
              onSend={onAskSubmit}
              disabled={thinking}
              bottomInset={insets.bottom}
              imageMode={imageMode}
              onToggleImageMode={toggleImageMode}
              pendingAttachment={pendingAttachment}
              onOpenAttachments={() => {
                Keyboard.dismiss();
                setAttachmentPickerOpen(true);
              }}
              onRemoveAttachment={() => setPendingAttachment(null)}
            />
          ) : null}
          </SafeKeyboardAvoidingView>
          <AttachmentPickerSheet
            visible={attachmentPickerOpen}
            onClose={() => setAttachmentPickerOpen(false)}
            onPick={(source) => void chooseAttachment(source)}
          />
          <AlenioBottomSheet
            visible={deleteCurrentConfirmOpen}
            title="Delete this chat?"
            subtitle="This permanently removes the chat and its generated content."
            onClose={() => {
              if (!deletingCurrentChat) setDeleteCurrentConfirmOpen(false);
            }}
            compact
            showCloseButton={false}
            scrollEnabled={false}
            testID="seneca-delete-chat-confirmation"
          >
            <View style={styles.deleteSheetActions}>
              <Pressable
                onPress={() => setDeleteCurrentConfirmOpen(false)}
                disabled={deletingCurrentChat}
                style={styles.deleteSheetCancel}
                accessibilityRole="button"
                testID="seneca-delete-chat-cancel"
              >
                <Text style={styles.deleteSheetCancelText}>Keep chat</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!conversationId) return;
                  mutateDeleteConversation({
                    id: conversationId,
                    scopeKey: HISTORY_SCOPE,
                  });
                }}
                disabled={!conversationId || deletingCurrentChat}
                style={[
                  styles.deleteSheetConfirm,
                  (!conversationId || deletingCurrentChat) &&
                    styles.headerIconBtnDisabled,
                ]}
                accessibilityRole="button"
                testID="seneca-delete-chat-confirm"
              >
                {deletingCurrentChat ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Trash2 size={14} color="#FFFFFF" strokeWidth={2.2} />
                    <Text style={styles.deleteSheetConfirmText}>Delete chat</Text>
                  </>
                )}
              </Pressable>
            </View>
          </AlenioBottomSheet>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    width: "100%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0D5DD",
    marginTop: 8,
    marginBottom: 2,
  },
  headerBar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 7,
    paddingBottom: 11,
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },
  headerIconBtnDisabled: {
    opacity: 0.45,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.25,
  },
  headerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#4361EE",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  contextSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
  },
  usingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  clarifyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  clarifyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: COLORS.brandBorder,
  },
  clarifyChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.brand,
  },
  historyPane: {
    flex: 1,
    minHeight: 0,
  },
  historyContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
  },
  historyHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  historyHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
    color: COLORS.text,
  },
  historyRetention: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
  },
  newChatButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: COLORS.brandBright,
  },
  newChatButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  historyNotice: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: COLORS.brandBorder,
  },
  historyNoticeText: {
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
  },
  historyState: {
    minHeight: 150,
    padding: 18,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyStateText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    color: COLORS.textMuted,
  },
  historyEmpty: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 54,
  },
  historyEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brandSoft,
    marginBottom: 16,
  },
  historyEmptyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  historyEmptyText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  historyEmptyButton: {
    minHeight: 44,
    marginTop: 20,
    paddingHorizontal: 19,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: COLORS.brandBright,
  },
  historyEmptyButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  historyRetry: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brandSoft,
  },
  historyRetryText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.brandBright,
  },
  historyList: {
    gap: 9,
  },
  historyCard: {
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyCardActive: {
    borderColor: COLORS.brandBorder,
    backgroundColor: "#FBFCFF",
  },
  historyCardMain: {
    minHeight: 86,
    paddingLeft: 12,
    paddingRight: 44,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyCardCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyCardTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  historyCardPreview: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: COLORS.textMuted,
  },
  historyCardMeta: {
    marginTop: 5,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textSoft,
  },
  historyDeleteButton: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF5F5",
  },
  deleteConfirm: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3D5D5",
    backgroundColor: "#FFF8F8",
  },
  deleteConfirmText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
    color: "#7F1D1D",
  },
  deleteCancelButton: {
    minHeight: 30,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteCancelText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  deleteConfirmButton: {
    minWidth: 58,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B91C1C",
  },
  deleteConfirmButtonText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  chatScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
    flexGrow: 1,
  },
  homePane: {
    flex: 1,
    minHeight: 0,
  },
  homeContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 16,
  },
  welcomeSection: {
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 5,
  },
  welcomeGreeting: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.4,
    textAlign: "center",
    lineHeight: 25,
  },
  welcomeName: {
    color: COLORS.brandBright,
    fontWeight: "700",
  },
  welcomeSupport: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textMuted,
    textAlign: "center",
    maxWidth: 300,
    paddingHorizontal: 6,
  },
  homeSection: { gap: 8 },
  homeSectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: COLORS.text,
  },
  recentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recentViewAll: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    color: COLORS.brandBright,
  },
  recentList: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
  },
  recentRow: {
    minHeight: 54,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  recentCopy: { flex: 1, minWidth: 0 },
  recentTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  recentPreview: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textMuted,
  },
  recentUpdated: {
    maxWidth: 64,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textSoft,
  },
  tryAskingSection: {
    gap: 8,
  },
  tryAskingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tryAskingLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
  },
  tryAskingLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSoft,
  },
  tryAskingList: {
    gap: 6,
  },
  tryAskingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surfaceMute,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  tryAskingText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.text,
    fontWeight: "500",
  },
  emptyCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: COLORS.brandBright,
    borderRadius: 16,
    borderTopRightRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: {
    fontSize: 17,
    lineHeight: 23,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  senecaBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  senecaBlockBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  senecaBlockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  senecaBlockAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  senecaBlockName: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.brandBright,
    letterSpacing: 0.2,
  },
  senecaMessage: {
    fontSize: 17,
    lineHeight: 23,
    color: "#334155",
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thinkingDots: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    backgroundColor: COLORS.brandSoft,
  },
  thinkingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.brandBright,
  },
  thinkingText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textMuted,
  },
  errorCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  errorTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.brandBright,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 30,
    paddingHorizontal: 11,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  retryButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B91C1C",
  },
  askBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  inlineAskBar: {
    width: "100%",
  },
  askComposer: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    minHeight: 72,
  },
  inlineAskComposer: {
    minHeight: 112,
    borderRadius: 14,
    borderColor: "#B8C5FF",
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 10,
    shadowColor: "#4361EE",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  imageAskComposer: {
    borderColor: "#8EA2FF",
    backgroundColor: "#FBFCFF",
  },
  imageModeLabel: {
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  imageModeLabelText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: COLORS.brandBright,
  },
  pendingAttachment: {
    minHeight: 52,
    marginBottom: 8,
    padding: 6,
    paddingRight: 8,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pendingThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceMute,
  },
  pendingPdfIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F0",
  },
  pendingAttachmentCopy: { flex: 1, minWidth: 0 },
  pendingAttachmentName: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  pendingAttachmentType: {
    marginTop: 2,
    fontSize: 9,
    color: COLORS.textMuted,
  },
  pendingRemove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceMute,
  },
  askInput: {
    minHeight: 36,
    maxHeight: 96,
    fontSize: 17,
    lineHeight: 23,
    color: COLORS.text,
    padding: 0,
    textAlignVertical: "top",
  },
  askComposerFooter: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  composerTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtnDisabled: { opacity: 0.35 },
  promptBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6FF",
    borderWidth: 1,
    borderColor: "#E1E6F7",
  },
  imageModeButtonActive: {
    borderColor: COLORS.brandBright,
    backgroundColor: COLORS.brandBright,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.send,
  },
  sendBtnDisabled: {
    backgroundColor: "#AAB8F5",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  privacyCopy: {
    alignItems: "center",
  },
  privacyText: {
    fontSize: 10,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
  privacyDisclaimer: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
  pickerOptions: {
    overflow: "hidden",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerOption: {
    minHeight: 50,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  pickerOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.brandSoft,
  },
  pickerOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
  },
  deleteSheetActions: {
    flexDirection: "row",
    gap: 9,
  },
  deleteSheetCancel: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F4F8",
  },
  deleteSheetCancelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#526078",
  },
  deleteSheetConfirm: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#C83A32",
  },
  deleteSheetConfirmText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
