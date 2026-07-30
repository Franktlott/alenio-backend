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
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUp,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  History,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Printer,
  Share2,
  Sparkles,
  UserCog,
  X,
} from "lucide-react-native";
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
import { ME_QUERY_KEY, fetchMeUser } from "@/lib/auth/me-query";

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
  brand: "#6D28D9",
  brandBright: "#7C3AED",
  brandSoft: "#F3E8FF",
  brandBorder: "#E9D5FF",
  send: "#7C3AED",
};

type PreparingKind = "default" | "coach" | "oneOnOne" | "checkIns" | "plan";

function preparingLabel(kind: PreparingKind): string {
  switch (kind) {
    case "coach":
      return "Considering your leadership approach…";
    case "oneOnOne":
      return "Building your talking points…";
    case "checkIns":
      return "Reviewing recent check-ins…";
    case "plan":
      return "Drafting your plan…";
    default:
      return "Preparing guidance…";
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

  const opacity = 0.45 + pulse * 0.27;

  return (
    <View style={styles.thinkingRow} testID="seneca-thinking" accessibilityLabel={preparingLabel(kind)}>
      <View style={[styles.thinkingSparkle, { opacity }]}>
        <Sparkles size={13} color={COLORS.brandBright} strokeWidth={2.2} />
      </View>
      <Text style={styles.thinkingText}>{preparingLabel(kind)}</Text>
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

type QuickAction = {
  id: "coach" | "prepare_1on1" | "review_checkins" | "create_task";
  title: string;
  description: string;
  prompt: string;
  Icon: typeof UserCog;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "coach",
    title: "Coach me",
    description: "Get advice on a leadership challenge",
    prompt:
      "Using this workspace's live data, who needs coaching most this week and why? Name specific people, cite overdue tasks / check-in status / goal risk, and give me 2 concrete coaching moves I can take.",
    Icon: UserCog,
  },
  {
    id: "prepare_1on1",
    title: "Prepare a 1:1",
    description: "Build talking points for your 1:1",
    prompt:
      "Who should I check in with next in this workspace? Use membersNeedingCheckIn, upcomingCalendar, openTasks, and lastCheckIns. Give talking points from their last check-in notes plus current overdue/open work, then offer to schedule the 1:1.",
    Icon: MessagesSquare,
  },
  {
    id: "review_checkins",
    title: "Review check-ins",
    description: "Analyze progress and team trends",
    prompt:
      "Summarize check-in status for this workspace right now. If noPublishedCheckInsYet is true, say there are no published check-ins yet (not that everyone is overdue). Otherwise separate no_check_in_yet vs overdue vs due_soon, note lastCheckIns highlights when present, and give the top 3 actions for this week.",
    Icon: ClipboardList,
  },
  {
    id: "create_task",
    title: "Create a task",
    description: "Build a task or checklist",
    prompt:
      "Based on overdue tasks and last-check-in follow-ups in this workspace, draft the top 1–2 follow-up tasks I should assign. Include assignee names, clear titles, and suggested due dates, then ask me to confirm.",
    Icon: CheckSquare,
  },
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
    <View style={[styles.askBar, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <View style={styles.askComposer}>
        <TextInput
          style={styles.askInput}
          placeholder="Ask Seneca anything…"
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
          <Pressable
            onPress={() =>
              toast({
                title: "Attachments coming soon",
                preset: "none",
              })
            }
            disabled={disabled}
            hitSlop={8}
            accessibilityLabel="Add attachment"
            testID="seneca-attach-button"
            style={styles.attachBtn}
          >
            <Paperclip size={18} color={COLORS.textSoft} strokeWidth={2.1} />
          </Pressable>
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
      <View style={styles.privacyRow}>
        <Lock size={10} color={COLORS.textSoft} strokeWidth={2.2} />
        <Text style={styles.privacyText}> Private · AI guidance · Settings · </Text>
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
  const { width: windowWidth } = useWindowDimensions();
  const activeTeamIdFromStore = useTeamStore((s) => s.activeTeamId);
  const activeTeamId = teamIdProp ?? activeTeamIdFromStore ?? "";
  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: open,
  });
  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMeUser(),
    enabled: open,
  });

  const workspaceName = useMemo(
    () => teams.find((team) => team.id === activeTeamId)?.name ?? "Workspace",
    [teams, activeTeamId],
  );
  const userFirstName = firstNameFrom(me?.name);
  const greeting = timeBasedGreeting();

  const suggestedPrompts = useMemo(
    () => [
      `Who is most at risk in ${workspaceName} this week, and what should I do first?`,
      `Summarize overdue work and check-in gaps for ${workspaceName}.`,
      `Which follow-up tasks should I assign from recent check-ins in ${workspaceName}?`,
    ],
    [workspaceName],
  );

  const actionCardWidth = Math.max(140, Math.floor((windowWidth - 24 - 10) / 2));

  const [chatMessages, setChatMessages] = useState<SenecaChatMessage[]>([]);
  const [askDraft, setAskDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [preparingKind, setPreparingKind] = useState<PreparingKind>("default");
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
    setPreparingKind("default");
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
    (question: string, kindOverride?: PreparingKind) => {
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
      setPreparingKind(kindOverride ?? resolvePreparingKind(trimmed));
      setThinking(true);
      setChatError(null);
      setAskDraft("");
      setMoreOpen(false);
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

  const onQuickAction = (action: QuickAction) => {
    if (!activeTeamId || thinking) return;
    const kind: PreparingKind =
      action.id === "coach"
        ? "coach"
        : action.id === "prepare_1on1"
          ? "oneOnOne"
          : action.id === "review_checkins"
            ? "checkIns"
            : "plan";
    runAsk(action.prompt, kind);
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

  const onHistoryPress = useCallback(() => {
    toast({
      title: "Chat history coming soon",
      preset: "none",
    });
  }, []);

  const canExport = chatMessages.length > 0 && !thinking && !exporting;
  const showHome = !!activeTeamId && chatMessages.length === 0 && !thinking && !chatError;

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
                    <Text style={styles.headerBadgeText}>BETA</Text>
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>AI Leadership Assistant</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => void onShareChat()}
                  disabled={!canExport}
                  style={[styles.headerIconBtn, !canExport && styles.headerIconBtnDisabled]}
                  accessibilityLabel="Share Seneca chat"
                  testID="seneca-share-button"
                >
                  <Share2 size={15} color={canExport ? COLORS.textMuted : COLORS.textSoft} strokeWidth={2.1} />
                </Pressable>
                <Pressable
                  onPress={onHistoryPress}
                  style={styles.headerIconBtn}
                  accessibilityLabel="Chat history"
                  testID="seneca-history-button"
                >
                  <History size={15} color={COLORS.textMuted} strokeWidth={2.1} />
                </Pressable>
                <Pressable
                  onPress={() => setMoreOpen((value) => !value)}
                  style={[styles.headerIconBtn, moreOpen && styles.headerIconBtnActive]}
                  accessibilityLabel="More actions"
                  testID="seneca-more-menu"
                >
                  <MoreHorizontal size={15} color={moreOpen ? COLORS.brandBright : COLORS.textMuted} strokeWidth={2.1} />
                </Pressable>
                <Pressable
                  onPress={handleClose}
                  accessibilityLabel="Close Seneca"
                  style={styles.headerIconBtn}
                  testID="seneca-close-button"
                >
                  <X size={15} color={COLORS.textMuted} strokeWidth={2.2} />
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

          {showHome ? (
            <View style={styles.homePane} testID="seneca-home">
              <View style={styles.welcomeSection}>
                <View style={styles.welcomeSparkle}>
                  <Sparkles size={14} color={COLORS.brandBright} strokeWidth={2.2} />
                </View>
                <Text style={styles.welcomeGreeting} accessibilityRole="header">
                  {greeting}, <Text style={styles.welcomeName}>{userFirstName}</Text>
                </Text>
                <Text style={styles.welcomeSupport} numberOfLines={2}>
                  Helping leaders coach, recognize, and develop their teams.
                </Text>
              </View>

              <View style={styles.actionGrid}>
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.Icon;
                  return (
                    <Pressable
                      key={action.id}
                      onPress={() => onQuickAction(action)}
                      style={[styles.actionCard, { width: actionCardWidth }]}
                      accessibilityRole="button"
                      accessibilityLabel={action.title}
                      testID={`seneca-quick-${action.id}`}
                    >
                      <View style={styles.actionCardTop}>
                        <View style={styles.actionIconWrap}>
                          <Icon size={14} color={COLORS.brandBright} strokeWidth={2.15} />
                        </View>
                        <ChevronRight size={13} color={COLORS.textSoft} strokeWidth={2.2} />
                      </View>
                      <Text style={styles.actionTitle}>{action.title}</Text>
                      <Text style={styles.actionDescription} numberOfLines={2}>
                        {action.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.tryAskingSection}>
                <View style={styles.tryAskingHeader}>
                  <View style={styles.tryAskingLine} />
                  <Text style={styles.tryAskingLabel}>Try asking</Text>
                  <View style={styles.tryAskingLine} />
                </View>
                <View style={styles.tryAskingList}>
                  {suggestedPrompts.map((prompt) => (
                    <Pressable
                      key={prompt}
                      onPress={() => runAsk(prompt)}
                      style={styles.tryAskingPill}
                      accessibilityRole="button"
                      accessibilityLabel={prompt}
                      testID="seneca-suggested-prompt"
                    >
                      <Sparkles size={12} color={COLORS.brandBright} strokeWidth={2.2} />
                      <Text style={styles.tryAskingText} numberOfLines={1}>
                        {prompt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : (
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
              ) : null}

              {chatMessages.map((chatMessage) =>
                chatMessage.role === "user" ? (
                  <View key={chatMessage.id} style={styles.userBubble}>
                    <Text style={styles.userBubbleText}>{chatMessage.text}</Text>
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
                  <View style={styles.senecaBlockBody}>
                    <View style={styles.senecaBlockHead}>
                      <View style={styles.senecaBlockAvatar}>
                        <SenecaIcon size={16} />
                      </View>
                      <Text style={styles.senecaBlockName}>Seneca</Text>
                    </View>
                    <PreparingStatus kind={preparingKind} />
                  </View>
                </View>
              ) : null}

              {chatError ? (
                <Text style={styles.errorText} testID="seneca-chat-error">
                  {chatError}
                </Text>
              ) : null}
            </ScrollView>
          )}

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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerIconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: COLORS.surface,
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
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.25,
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
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
    fontWeight: "500",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  moreMenu: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
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
    paddingTop: 10,
    paddingBottom: 4,
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
    flexGrow: 1,
  },
  homePane: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    justifyContent: "space-between",
  },
  welcomeSection: {
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  welcomeSparkle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeGreeting: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.4,
    textAlign: "center",
    lineHeight: 28,
  },
  welcomeName: {
    color: COLORS.brandBright,
    fontWeight: "700",
  },
  welcomeSupport: {
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textMuted,
    textAlign: "center",
    maxWidth: 300,
    paddingHorizontal: 6,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  actionCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 92,
  },
  actionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  actionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.text,
    letterSpacing: -0.15,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 11,
    lineHeight: 14,
    color: COLORS.textMuted,
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
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
  },
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thinkingSparkle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  thinkingText: {
    flex: 1,
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
    borderRadius: 10,
    padding: 10,
  },
  askBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: COLORS.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
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
  askInput: {
    minHeight: 32,
    maxHeight: 88,
    fontSize: 14,
    lineHeight: 20,
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
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#C4B5FD",
  },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 2,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  privacyText: {
    fontSize: 10,
    color: COLORS.textSoft,
    fontWeight: "500",
  },
  settingsLink: {
    color: "#6366F1",
    fontWeight: "600",
    fontSize: 10,
  },
});
