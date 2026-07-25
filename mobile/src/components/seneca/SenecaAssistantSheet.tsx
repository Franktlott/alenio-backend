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
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Briefcase, ChevronRight, Lock, MoreHorizontal, Printer, Share2, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { toast } from "burnt";
import { SenecaIcon } from "./SenecaIcon";
import {
  fetchSenecaAsk,
  type SenecaCancelOneOnOneProposal,
  type SenecaChatTurn,
  type SenecaCreateTaskProposal,
  type SenecaPlanOneOnOneProposal,
} from "@/lib/seneca-api";
import { SenecaPlanCheckInCard } from "./SenecaPlanCheckInCard";
import { SenecaCancelCheckInCard } from "./SenecaCancelCheckInCard";
import { SenecaCreateTaskCard } from "./SenecaCreateTaskCard";
import { quickActionNavigate } from "@/lib/seneca-navigation";
import { useTeamStore } from "@/lib/state/team-store";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { printSenecaChat, shareSenecaChat } from "@/lib/seneca-chat-share";

function ThinkingDots() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 3), 380);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={styles.thinkingRow} testID="seneca-thinking" accessibilityLabel="Thinking">
      <View style={styles.thinkingDots}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[styles.thinkingDot, { opacity: step === i ? 1 : 0.28 }]}
          />
        ))}
      </View>
      <Text style={styles.thinkingText}>Thinking</Text>
    </View>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  teamId?: string | null;
};

type SenecaChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  planProposal?: SenecaPlanOneOnOneProposal | null;
  cancelProposal?: SenecaCancelOneOnOneProposal | null;
  createTaskProposal?: SenecaCreateTaskProposal | null;
};

const COLORS = {
  bg: "#F4F6F8",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderLight: "#EEF2F6",
  text: "#0F172A",
  textMuted: "#64748B",
  textSoft: "#94A3B8",
  brand: "#4361EE",
  brandSoft: "#EEF2FF",
  brandBorder: "#C7D2FE",
};

function StickyAskBar({
  value,
  onChange,
  onSend,
  disabled,
  bottomInset,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled: boolean;
  bottomInset: number;
}) {
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <View style={[styles.askBar, { paddingBottom: Math.max(bottomInset, 8) }]}>
      <View style={styles.askBarDivider} />
      <View style={styles.askBarInner}>
        <TextInput
          style={styles.askInput}
          placeholder="Ask a leadership question…"
          placeholderTextColor={COLORS.textSoft}
          value={value}
          onChangeText={onChange}
          returnKeyType="send"
          onSubmitEditing={() => {
            if (canSend) onSend();
          }}
          editable={!disabled}
          testID="seneca-ask-input"
        />
        <Pressable onPress={onSend} disabled={!canSend} testID="seneca-ask-submit">
          {canSend ? (
            <LinearGradient
              colors={["#4361EE", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtn}
            >
              <ArrowUp size={16} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
          ) : (
            <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
              <ArrowUp size={16} color="#94A3B8" strokeWidth={2.6} />
            </View>
          )}
        </Pressable>
      </View>
      <View style={styles.privacyRow}>
        <Lock size={10} color={COLORS.textSoft} strokeWidth={2.2} />
        <Text style={styles.privacyText}>Private · Verify AI guidance · Settings at </Text>
        <Text
          style={styles.settingsLink}
          onPress={() => {
            void Linking.openURL("https://alenio.com");
          }}
        >
          alenio.com
        </Text>
      </View>
    </View>
  );
}

export function SenecaAssistantSheet({ open, onClose, teamId: teamIdProp }: Props) {
  const insets = useSafeAreaInsets();
  const activeTeamIdFromStore = useTeamStore((s) => s.activeTeamId);
  const activeTeamId = teamIdProp ?? activeTeamIdFromStore ?? "";
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: open,
  });
  const workspaceName = useMemo(
    () => teams.find((team) => team.id === activeTeamId)?.name ?? "Workspace",
    [teams, activeTeamId],
  );

  const [chatMessages, setChatMessages] = useState<SenecaChatMessage[]>([]);
  const [askDraft, setAskDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const stickToBottomRef = useRef(true);

  const scrollChatToEnd = useCallback((animated = false) => {
    chatScrollRef.current?.scrollToEnd({ animated });
  }, []);

  const handleChatScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const handleChatContentSizeChange = useCallback(() => {
    if (!stickToBottomRef.current) return;
    scrollChatToEnd(false);
    requestAnimationFrame(() => scrollChatToEnd(false));
  }, [scrollChatToEnd]);

  const resetChat = useCallback(() => {
    setChatMessages([]);
    setAskDraft("");
    setThinking(false);
    setChatError(null);
    setMoreOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    resetChat();
    onClose();
  }, [onClose, resetChat]);

  useEffect(() => {
    if (!open) resetChat();
  }, [open, resetChat]);

  const runAsk = useCallback(
    (question: string) => {
      if (!activeTeamId) return;

      const trimmed = question.trim();
      if (!trimmed) return;

      const history: SenecaChatTurn[] = chatMessages.map((message) => ({
        role: message.role,
        content: message.text,
      }));
      const userMessage: SenecaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed,
      };

      setChatMessages((prev) => [...prev, userMessage]);
      setThinking(true);
      setChatError(null);
      setAskDraft("");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void (async () => {
        try {
          const res = await fetchSenecaAsk(activeTeamId, trimmed, history);
          const assistantMessage: SenecaChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: res.message,
            planProposal: res.planOneOnOne ?? null,
            cancelProposal: res.cancelOneOnOne ?? null,
            createTaskProposal: res.createTask ?? null,
          };
          setChatMessages((prev) => [...prev, assistantMessage]);
        } catch (e) {
          setChatError(e instanceof Error ? e.message : "Seneca could not answer right now.");
        } finally {
          setThinking(false);
        }
      })();
    },
    [activeTeamId, chatMessages],
  );

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [activeTeamId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const timer = setTimeout(() => scrollChatToEnd(true), 50);
    return () => clearTimeout(timer);
  }, [chatMessages, thinking, chatError, scrollChatToEnd]);

  const onAskSubmit = () => {
    if (!askDraft.trim() || thinking) return;
    runAsk(askDraft.trim());
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

  const onMoreAction = (kind: "task" | "checklist" | "check_in" | "recognize") => {
    if (!activeTeamId) return;
    setMoreOpen(false);
    handleClose();
    quickActionNavigate(kind, activeTeamId);
  };

  const shareMessages = useMemo(
    () => chatMessages.map((message) => ({ role: message.role, text: message.text })),
    [chatMessages],
  );

  const onShareChat = useCallback(async () => {
    setMoreOpen(false);
    setExporting(true);
    try {
      await shareSenecaChat(shareMessages, workspaceName);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not share chat",
        preset: "error",
      });
    } finally {
      setExporting(false);
    }
  }, [shareMessages, workspaceName]);

  const onPrintChat = useCallback(async () => {
    setMoreOpen(false);
    setExporting(true);
    try {
      await printSenecaChat(shareMessages, workspaceName);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not print chat",
        preset: "error",
      });
    } finally {
      setExporting(false);
    }
  }, [shareMessages, workspaceName]);

  const canExport = chatMessages.length > 0 && !thinking && !exporting;

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
        <SafeKeyboardAvoidingView style={styles.flex}>
          <View style={styles.headerBar}>
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <SenecaIcon size={24} />
              </View>
              <View style={styles.headerText}>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Seneca</Text>
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>BETA</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>AI leadership assistant</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => void onShareChat()}
                  disabled={!canExport}
                  style={[styles.headerIconBtn, !canExport && styles.headerIconBtnDisabled]}
                  accessibilityLabel="Share Seneca chat"
                  testID="seneca-share-button"
                >
                  <Share2 size={16} color={canExport ? COLORS.textMuted : COLORS.textSoft} />
                </Pressable>
                <Pressable
                  onPress={() => void onPrintChat()}
                  disabled={!canExport}
                  style={[styles.headerIconBtn, !canExport && styles.headerIconBtnDisabled]}
                  accessibilityLabel="Print Seneca chat"
                  testID="seneca-print-button"
                >
                  <Printer size={16} color={canExport ? COLORS.textMuted : COLORS.textSoft} />
                </Pressable>
                <Pressable
                  onPress={() => setMoreOpen((value) => !value)}
                  style={[styles.headerIconBtn, moreOpen && styles.headerIconBtnActive]}
                  testID="seneca-more-menu"
                >
                  <MoreHorizontal size={16} color={moreOpen ? COLORS.brand : COLORS.textMuted} />
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  accessibilityLabel="Close Seneca"
                  style={styles.headerIconBtn}
                  testID="seneca-close-button"
                >
                  <X size={16} color={COLORS.textMuted} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>
          </View>

            {moreOpen ? (
              <View style={styles.moreMenu}>
                <Text style={styles.moreMenuLabel}>Quick actions</Text>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => void onShareChat()}
                  disabled={!canExport}
                  testID="seneca-more-share"
                >
                  <Text style={[styles.moreItemText, !canExport && styles.moreItemTextDisabled]}>Share chat</Text>
                  <Share2 size={15} color={canExport ? COLORS.textSoft : COLORS.border} />
                </Pressable>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => void onPrintChat()}
                  disabled={!canExport}
                  testID="seneca-more-print"
                >
                  <Text style={[styles.moreItemText, !canExport && styles.moreItemTextDisabled]}>Print chat</Text>
                  <Printer size={15} color={canExport ? COLORS.textSoft : COLORS.border} />
                </Pressable>
                <Pressable style={styles.moreItem} onPress={() => onMoreAction("task")} testID="seneca-more-task">
                  <Text style={styles.moreItemText}>Create task</Text>
                  <ChevronRight size={15} color={COLORS.textSoft} />
                </Pressable>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => onMoreAction("checklist")}
                  testID="seneca-more-checklist"
                >
                  <Text style={styles.moreItemText}>Create checklist</Text>
                  <ChevronRight size={15} color={COLORS.textSoft} />
                </Pressable>
                <Pressable
                  style={[styles.moreItem, styles.moreItemLast]}
                  onPress={() => onMoreAction("check_in")}
                  testID="seneca-more-checkin"
                >
                  <Text style={styles.moreItemText}>Schedule check-in</Text>
                  <ChevronRight size={15} color={COLORS.textSoft} />
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              ref={chatScrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.chatScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleChatScroll}
              scrollEventThrottle={16}
              onContentSizeChange={handleChatContentSizeChange}
              testID="seneca-chat-scroll"
            >
              {!activeTeamId ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Workspace required</Text>
                  <Text style={styles.emptyText}>Join a workspace to chat with Seneca.</Text>
                </View>
              ) : chatMessages.length === 0 && !thinking ? (
                <View style={styles.welcomeCard}>
                  <View style={styles.welcomeIconWrap}>
                    <Briefcase size={18} color={COLORS.brand} strokeWidth={2} />
                  </View>
                  <Text style={styles.welcomeTitle}>How can I support your team?</Text>
                  <Text style={styles.welcomeText}>
                    Coaching, check-ins, and leadership prep for this workspace.
                  </Text>
                </View>
              ) : null}

              {chatMessages.map((chatMessage) =>
                chatMessage.role === "user" ? (
                  <View key={chatMessage.id} style={styles.userBubble}>
                    <Text style={styles.userBubbleText}>{chatMessage.text}</Text>
                  </View>
                ) : (
                  <View key={chatMessage.id} style={styles.senecaBlock}>
                    <View style={styles.senecaAccent} />
                    <View style={styles.senecaBlockBody}>
                      <View style={styles.senecaBlockHead}>
                        <SenecaIcon size={16} />
                        <Text style={styles.senecaBlockName}>Seneca</Text>
                      </View>
                      <Text style={styles.senecaMessage}>{chatMessage.text}</Text>

                    {chatMessage.cancelProposal && activeTeamId ? (
                      <SenecaCancelCheckInCard
                        teamId={activeTeamId}
                        proposal={chatMessage.cancelProposal}
                        onCancelled={(summary) => onCheckInCancelled(chatMessage.id, summary)}
                        onDismiss={() => dismissCancelProposal(chatMessage.id)}
                      />
                    ) : null}

                    {chatMessage.planProposal && activeTeamId ? (
                      <SenecaPlanCheckInCard
                        teamId={activeTeamId}
                        proposal={chatMessage.planProposal}
                        onSaved={(summary) => onPlanCheckInSaved(chatMessage.id, summary)}
                        onDismiss={() => dismissPlanProposal(chatMessage.id)}
                      />
                    ) : null}

                    {chatMessage.createTaskProposal && activeTeamId ? (
                      <SenecaCreateTaskCard
                        teamId={activeTeamId}
                        proposal={chatMessage.createTaskProposal}
                        onSaved={(summary) => onTaskCreated(chatMessage.id, summary)}
                        onDismiss={() => dismissCreateTaskProposal(chatMessage.id)}
                      />
                    ) : null}
                    </View>
                  </View>
                ),
              )}

              {thinking ? (
                <View style={styles.senecaBlock}>
                  <View style={styles.senecaAccent} />
                  <View style={styles.senecaBlockBody}>
                    <View style={styles.senecaBlockHead}>
                      <SenecaIcon size={16} />
                      <Text style={styles.senecaBlockName}>Seneca</Text>
                    </View>
                    <ThinkingDots />
                  </View>
                </View>
              ) : null}

              {chatError ? (
                <Text style={styles.errorText} testID="seneca-chat-error">
                  {chatError}
                </Text>
              ) : null}
            </ScrollView>

            <StickyAskBar
              value={askDraft}
              onChange={setAskDraft}
              onSend={onAskSubmit}
              disabled={thinking || !activeTeamId}
              bottomInset={insets.bottom}
            />
          </SafeKeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenRoot: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  headerBar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  headerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerIconBtnActive: {
    backgroundColor: COLORS.brandSoft,
    borderColor: COLORS.brandBorder,
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
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  headerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#C2410C",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  moreMenu: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  moreMenuLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  moreItemLast: {
    borderBottomWidth: 0,
  },
  moreItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  moreItemTextDisabled: {
    color: COLORS.textSoft,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  chatScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    flexGrow: 1,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
  },
  welcomeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 4,
  },
  welcomeIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    overflow: "hidden",
  },
  welcomeTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  welcomeText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: COLORS.brand,
    borderRadius: 12,
    borderTopRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  userBubbleText: {
    fontSize: 14,
    lineHeight: 19,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  senecaBlock: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  senecaAccent: {
    width: 3,
    backgroundColor: COLORS.brand,
  },
  senecaBlockBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  senecaBlockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  senecaBlockName: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  senecaMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thinkingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  thinkingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.brand,
  },
  thinkingText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#DC2626",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 10,
  },
  askBar: {
    paddingHorizontal: 12,
    paddingTop: 0,
    backgroundColor: COLORS.surface,
  },
  askBarDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 8,
  },
  askBarInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 3,
  },
  askInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 8,
    paddingRight: 8,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 2,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  privacyText: {
    fontSize: 10,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
  settingsLink: {
    color: "#4361EE",
    fontWeight: "700",
    fontSize: 10,
    textDecorationLine: "underline",
  },
});
