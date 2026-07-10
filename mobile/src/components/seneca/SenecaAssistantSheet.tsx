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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Lock, MoreHorizontal, X } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { SenecaIcon } from "./SenecaIcon";
import {
  fetchSenecaAsk,
  type SenecaCancelOneOnOneProposal,
  type SenecaChatTurn,
  type SenecaPlanOneOnOneProposal,
} from "@/lib/seneca-api";
import { SenecaPlanCheckInCard } from "./SenecaPlanCheckInCard";
import { SenecaCancelCheckInCard } from "./SenecaCancelCheckInCard";
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
};

const STARTER_PROMPTS = [
  "Schedule a check-in with a team member",
  "Help me prep for a difficult conversation",
  "Give me a leadership quote for today",
];

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
      <View style={styles.askBarInner}>
        <TextInput
          style={styles.askInput}
          placeholder="Ask Seneca…"
          placeholderTextColor="#94A3B8"
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
        <Lock size={11} color="#94A3B8" strokeWidth={2.2} />
        <Text style={styles.privacyText}>Private to you. Only you can see this conversation.</Text>
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
    const timer = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatMessages, thinking, chatError]);

  const onAskSubmit = () => {
    if (!askDraft.trim() || thinking) return;
    runAsk(askDraft.trim());
  };

  const onPlanCheckInSaved = (messageId: string, summary: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, text: summary, planProposal: null, cancelProposal: null }
          : message,
      ),
    );
  };

  const onCheckInCancelled = (messageId: string, summary: string) => {
    setChatMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, text: summary, planProposal: null, cancelProposal: null }
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

  const onMoreAction = (kind: "task" | "checklist" | "check_in" | "recognize") => {
    if (!activeTeamId) return;
    setMoreOpen(false);
    handleClose();
    quickActionNavigate(kind, activeTeamId);
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <View style={styles.screenRoot}>
        <SafeAreaView style={styles.screen} edges={["top"]}>
          <SafeKeyboardAvoidingView style={styles.flex}>
            <View style={styles.header}>
              <SenecaIcon size={40} />
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>Seneca</Text>
                <Text style={styles.headerSubtitle}>Leadership chat</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setMoreOpen((value) => !value)}
                  style={styles.headerIconBtn}
                  testID="seneca-more-menu"
                >
                  <MoreHorizontal size={20} color="#64748B" />
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  accessibilityLabel="Close Seneca"
                  style={styles.headerIconBtn}
                  testID="seneca-close-button"
                >
                  <X size={20} color="#64748B" strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>

            {moreOpen ? (
              <View style={styles.moreMenu}>
                <Pressable style={styles.moreItem} onPress={() => onMoreAction("task")} testID="seneca-more-task">
                  <Text style={styles.moreItemText}>Create task</Text>
                </Pressable>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => onMoreAction("checklist")}
                  testID="seneca-more-checklist"
                >
                  <Text style={styles.moreItemText}>Create checklist</Text>
                </Pressable>
                <Pressable
                  style={styles.moreItem}
                  onPress={() => onMoreAction("check_in")}
                  testID="seneca-more-checkin"
                >
                  <Text style={styles.moreItemText}>Schedule check-in</Text>
                </Pressable>
              </View>
            ) : null}

            <ScrollView
              ref={chatScrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.chatScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              testID="seneca-chat-scroll"
            >
              {!activeTeamId ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Workspace required</Text>
                  <Text style={styles.emptyText}>Join a workspace to chat with Seneca.</Text>
                </View>
              ) : chatMessages.length === 0 && !thinking ? (
                <View style={styles.welcomeCard}>
                  <Text style={styles.welcomeTitle}>How can I help?</Text>
                  <Text style={styles.welcomeText}>
                    Ask about coaching, scheduling check-ins, handling team situations, or leadership advice.
                  </Text>
                  <View style={styles.starterList}>
                    {STARTER_PROMPTS.map((prompt) => (
                      <Pressable
                        key={prompt}
                        onPress={() => runAsk(prompt)}
                        style={styles.starterChip}
                        testID={`seneca-starter-${prompt}`}
                      >
                        <Text style={styles.starterChipText}>{prompt}</Text>
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
                    <View style={styles.senecaBlockHead}>
                      <SenecaIcon size={24} />
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
                  </View>
                ),
              )}

              {thinking ? (
                <View style={styles.senecaBlock}>
                  <View style={styles.senecaBlockHead}>
                    <SenecaIcon size={24} />
                    <Text style={styles.senecaBlockName}>Seneca</Text>
                  </View>
                  <View style={styles.thinkingRow} testID="seneca-thinking">
                    <ActivityIndicator size="small" color="#4361EE" />
                    <Text style={styles.thinkingText}>Thinking…</Text>
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
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenRoot: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  screen: {
    flex: 1,
    backgroundColor: "#FAFBFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8EDF2",
    marginTop: 2,
  },
  headerText: { flex: 1, paddingTop: 2 },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  moreMenu: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    overflow: "hidden",
  },
  moreItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  moreItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  chatScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
    flexGrow: 1,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
  },
  welcomeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    padding: 20,
    gap: 10,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  welcomeText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
  },
  starterList: {
    gap: 8,
    marginTop: 4,
  },
  starterChip: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  starterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    backgroundColor: "#EEF2FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#0F172A",
    fontWeight: "500",
  },
  senecaBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  senecaBlockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  senecaBlockName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4361EE",
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
    color: "#64748B",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#DC2626",
  },
  askBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "#FAFBFC",
  },
  askBarInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
  },
  askInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: 10,
    paddingRight: 10,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#F1F5F9",
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
    color: "#94A3B8",
    fontWeight: "500",
  },
});
