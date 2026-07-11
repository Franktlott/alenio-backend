import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Briefcase, ChevronRight, Lock, MoreHorizontal, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
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

const STARTER_PROMPTS = [
  "Create a task for a team member",
  "Schedule a check-in with a team member",
  "Help me prep for a difficult conversation",
];

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
    <View style={[styles.askBar, { paddingBottom: Math.max(bottomInset, 14) }]}>
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
              <ArrowUp size={18} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
          ) : (
            <View style={[styles.sendBtn, styles.sendBtnDisabled]}>
              <ArrowUp size={18} color="#94A3B8" strokeWidth={2.6} />
            </View>
          )}
        </Pressable>
      </View>
      <View style={styles.privacyRow}>
        <Lock size={11} color={COLORS.textSoft} strokeWidth={2.2} />
        <Text style={styles.privacyText}>Private to you · Workspace data stays secure</Text>
      </View>
    </View>
  );
}

export function SenecaAssistantSheet({ open, onClose, teamId: teamIdProp }: Props) {
  const insets = useSafeAreaInsets();
  const activeTeamIdFromStore = useTeamStore((s) => s.activeTeamId);
  const activeTeamId = teamIdProp ?? activeTeamIdFromStore ?? "";

  const [chatMessages, setChatMessages] = useState<SenecaChatMessage[]>([]);
  const [askDraft, setAskDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
        <SafeKeyboardAvoidingView style={styles.flex}>
          <View style={styles.headerBar}>
            <View style={styles.header}>
              <View style={styles.headerIconWrap}>
                <SenecaIcon size={28} />
              </View>
              <View style={styles.headerText}>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Seneca</Text>
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>BETA mode</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>Early access AI leadership assistant</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setMoreOpen((value) => !value)}
                  style={[styles.headerIconBtn, moreOpen && styles.headerIconBtnActive]}
                  testID="seneca-more-menu"
                >
                  <MoreHorizontal size={18} color={moreOpen ? COLORS.brand : COLORS.textMuted} />
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  accessibilityLabel="Close Seneca"
                  style={styles.headerIconBtn}
                  testID="seneca-close-button"
                >
                  <X size={18} color={COLORS.textMuted} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>
          </View>

            {moreOpen ? (
              <View style={styles.moreMenu}>
                <Text style={styles.moreMenuLabel}>Quick actions</Text>
                <Pressable style={styles.moreItem} onPress={() => onMoreAction("task")} testID="seneca-more-task">
                  <Text style={styles.moreItemText}>Create task</Text>
                  <ChevronRight size={16} color={COLORS.textSoft} />
                </Pressable>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => onMoreAction("checklist")}
                  testID="seneca-more-checklist"
                >
                  <Text style={styles.moreItemText}>Create checklist</Text>
                  <ChevronRight size={16} color={COLORS.textSoft} />
                </Pressable>
                <Pressable
                  style={[styles.moreItem, styles.moreItemLast]}
                  onPress={() => onMoreAction("check_in")}
                  testID="seneca-more-checkin"
                >
                  <Text style={styles.moreItemText}>Schedule check-in</Text>
                  <ChevronRight size={16} color={COLORS.textSoft} />
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
                    <Briefcase size={22} color={COLORS.brand} strokeWidth={2} />
                  </View>
                  <Text style={styles.welcomeEyebrow}>BETA mode</Text>
                  <Text style={styles.welcomeTitle}>How can I support your team today?</Text>
                  <Text style={styles.welcomeText}>
                    Get coaching guidance, schedule check-ins, and prepare for leadership conversations.
                  </Text>
                  <Text style={styles.starterLabel}>Suggested prompts</Text>
                  <View style={styles.starterList}>
                    {STARTER_PROMPTS.map((prompt) => (
                      <Pressable
                        key={prompt}
                        onPress={() => runAsk(prompt)}
                        style={styles.starterChip}
                        testID={`seneca-starter-${prompt}`}
                      >
                        <Text style={styles.starterChipText}>{prompt}</Text>
                        <ChevronRight size={16} color={COLORS.brand} />
                      </Pressable>
                    ))}
                  </View>
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
                        <SenecaIcon size={20} />
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
                      <SenecaIcon size={20} />
                      <Text style={styles.senecaBlockName}>Seneca</Text>
                    </View>
                    <View style={styles.thinkingRow} testID="seneca-thinking">
                      <ActivityIndicator size="small" color={COLORS.brand} />
                      <Text style={styles.thinkingText}>Analyzing your request…</Text>
                    </View>
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
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 12,
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 1,
    borderColor: COLORS.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerIconBtnActive: {
    backgroundColor: COLORS.brandSoft,
    borderColor: COLORS.brandBorder,
  },
  headerText: { flex: 1 },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#C2410C",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 3,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moreMenu: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  moreMenuLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  moreItemLast: {
    borderBottomWidth: 0,
  },
  moreItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  chatScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
    flexGrow: 1,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
  },
  welcomeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    gap: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  welcomeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  welcomeEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.brand,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  welcomeText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  starterLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 8,
  },
  starterList: {
    gap: 8,
  },
  starterChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  starterChipText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    paddingRight: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: COLORS.brand,
    borderRadius: 14,
    borderTopRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: COLORS.brand,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userBubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  senecaBlock: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  senecaAccent: {
    width: 3,
    backgroundColor: COLORS.brand,
  },
  senecaBlockBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  senecaBlockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  senecaBlockName: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.brand,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  senecaMessage: {
    fontSize: 15,
    lineHeight: 23,
    color: "#334155",
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thinkingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#DC2626",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
  },
  askBar: {
    paddingHorizontal: 20,
    paddingTop: 0,
    backgroundColor: COLORS.surface,
  },
  askBarDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  askBarInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 5,
  },
  askInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 10,
    paddingRight: 10,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
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
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 8,
  },
  privacyText: {
    fontSize: 11,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
});
