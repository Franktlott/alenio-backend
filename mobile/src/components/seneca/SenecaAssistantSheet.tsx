import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  ArrowLeft,
  ArrowUp,
  AlertTriangle,
  ChevronRight,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Star,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { SenecaIcon } from "./SenecaIcon";
import {
  loadWorkspaceSnapshot,
  type SenecaActionCard,
  type SenecaInsightItem,
  type WorkspaceSnapshot,
} from "@/lib/seneca-assistant";
import { buildTeamPulse, type TeamPulseMetric } from "@/lib/seneca-briefing";
import {
  buildMobileBriefingHeadlines,
  buildMobilePriorityInsights,
  managerFirstName,
  type MobilePriorityInsight,
} from "@/lib/seneca-mobile-briefing";
import { fetchSenecaAsk, type SenecaAskActionId, type SenecaCancelOneOnOneProposal, type SenecaChatTurn, type SenecaPlanOneOnOneProposal } from "@/lib/seneca-api";
import { SenecaPlanCheckInCard } from "./SenecaPlanCheckInCard";
import { SenecaCancelCheckInCard } from "./SenecaCancelCheckInCard";
import { quickActionNavigate, senecaActionNavigate } from "@/lib/seneca-navigation";
import { useTeamStore } from "@/lib/state/team-store";
import { ME_QUERY_KEY, fetchMeUser } from "@/lib/auth/me-query";
import { SafeKeyboardAvoidingView } from "@/lib/safe-keyboard-controller";

type Props = {
  open: boolean;
  onClose: () => void;
  teamId?: string | null;
};

type ViewMode = "briefing" | "chat";

type SenecaChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  insights?: SenecaInsightItem[];
  actions?: SenecaActionCard[];
  planProposal?: SenecaPlanOneOnOneProposal | null;
  cancelProposal?: SenecaCancelOneOnOneProposal | null;
};

const INSIGHT_STYLE: Record<
  MobilePriorityInsight["kind"],
  {
    icon: typeof AlertTriangle;
    accent: string;
    iconColor: string;
    iconBg: string;
    labelColor: string;
    pillBg: string;
    pillText: string;
  }
> = {
  follow_up: {
    icon: AlertTriangle,
    accent: "#F87171",
    iconColor: "#EF4444",
    iconBg: "#FEE2E2",
    labelColor: "#EF4444",
    pillBg: "#FEF2F2",
    pillText: "#DC2626",
  },
  coaching: {
    icon: Users,
    accent: "#FB923C",
    iconColor: "#EA580C",
    iconBg: "#FFEDD5",
    labelColor: "#EA580C",
    pillBg: "#FFF7ED",
    pillText: "#C2410C",
  },
  recognition: {
    icon: Star,
    accent: "#4ADE80",
    iconColor: "#059669",
    iconBg: "#D1FAE5",
    labelColor: "#059669",
    pillBg: "#ECFDF5",
    pillText: "#047857",
  },
};

function pulseStatusCopy(status: TeamPulseMetric["status"]): { text: string; color: string } {
  if (status === "strong" || status === "good") return { text: "On track", color: "#059669" };
  if (status === "watch") return { text: "Needs focus", color: "#D97706" };
  return { text: "At risk", color: "#DC2626" };
}

function pulseIcon(id: string) {
  if (id === "execution") return Target;
  if (id === "communication") return MessageCircle;
  return TrendingUp;
}

function PriorityInsightCard({
  insight,
  onAction,
}: {
  insight: MobilePriorityInsight;
  onAction: () => void;
}) {
  const tone = INSIGHT_STYLE[insight.kind];
  const Icon = tone.icon;

  return (
    <Pressable
      onPress={onAction}
      testID={`seneca-mobile-insight-${insight.id}`}
      style={({ pressed }) => [styles.priorityCard, pressed && styles.priorityCardPressed]}
    >
      <View style={[styles.priorityAccent, { backgroundColor: tone.accent }]} />
      <View style={[styles.priorityIconWrap, { backgroundColor: tone.iconBg }]}>
        <Icon size={18} color={tone.iconColor} strokeWidth={2.2} />
      </View>
      <View style={styles.priorityBody}>
        <Text style={[styles.priorityLabel, { color: tone.labelColor }]}>{insight.label.toUpperCase()}</Text>
        <Text style={styles.priorityTitle}>{insight.message}</Text>
        <Text style={styles.priorityDetail}>{insight.detail}</Text>
      </View>
      <View style={styles.priorityActions}>
        <View style={[styles.priorityPill, { backgroundColor: tone.pillBg }]}>
          <Text style={[styles.priorityPillText, { color: tone.pillText }]}>{insight.actionLabel}</Text>
        </View>
        <ChevronRight size={16} color="#CBD5E1" strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

function TeamPulseCard({ metrics }: { metrics: TeamPulseMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <View style={styles.pulseCard}>
      {metrics.map((metric, index) => {
        const Icon = pulseIcon(metric.id);
        const status = pulseStatusCopy(metric.status);
        return (
          <View key={metric.id} style={[styles.pulseCol, index > 0 && styles.pulseColBorder]}>
            <Icon size={16} color="#94A3B8" strokeWidth={2} />
            <Text style={styles.pulseValue}>{metric.value}%</Text>
            <Text style={styles.pulseLabel}>{metric.label}</Text>
            <Text style={[styles.pulseStatus, { color: status.color }]}>{status.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

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
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          testID="seneca-ask-submit"
        >
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
  const { data: me } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMeUser,
    enabled: open,
  });

  const [view, setView] = useState<ViewMode>("briefing");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<SenecaChatMessage[]>([]);
  const [activeInsight, setActiveInsight] = useState<MobilePriorityInsight | null>(null);
  const [askDraft, setAskDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const managerName = managerFirstName(me?.name);
  const headlines = useMemo(() => buildMobileBriefingHeadlines(managerName), [managerName, open]);
  const priorityInsights = useMemo(
    () => (snapshot?.fromLiveData ? buildMobilePriorityInsights(snapshot) : []),
    [snapshot],
  );
  const teamPulse = useMemo(
    () => (snapshot?.fromLiveData ? buildTeamPulse(snapshot) : []),
    [snapshot],
  );
  const teamName = snapshot?.teamName ?? "Workspace";
  const statusLabel = snapshotLoading
    ? "Analyzing workspace…"
    : snapshot?.fromLiveData
      ? "Live workspace insights"
      : snapshot?.loadError
        ? "Data unavailable"
        : "Briefing ready";

  const resetChat = useCallback(() => {
    setView("briefing");
    setChatMessages([]);
    setActiveInsight(null);
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
    if (!open) {
      resetChat();
      return;
    }
    if (!activeTeamId) return;

    let cancelled = false;
    setSnapshotLoading(true);
    void loadWorkspaceSnapshot(activeTeamId, me?.id, teamName)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeTeamId, me?.id, resetChat]);

  const runAsk = useCallback(
    (question: string, insight?: MobilePriorityInsight | null) => {
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

      setView("chat");
      if (insight) setActiveInsight(insight);
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
            insights: (res.insights ?? []).slice(0, 3).map((item, index) => ({
              id: `ask-insight-${index}`,
              label: item.label,
              detail: item.detail,
            })),
            actions: (res.suggestedActions ?? []).slice(0, 3).map((item) => ({
              id: item.action as SenecaAskActionId,
              title: item.title,
              description: item.description,
              memberUserId: insight?.memberUserId,
            })),
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
    if (view !== "chat") return;
    const timer = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatMessages, thinking, view, chatError]);

  const onInsightAction = (insight: MobilePriorityInsight) => {
    runAsk(insight.chatPrompt, insight);
  };

  const onAskSubmit = () => {
    if (!askDraft.trim() || thinking) return;
    runAsk(askDraft.trim(), null);
  };

  const backToBriefing = () => {
    setView("briefing");
    setChatMessages([]);
    setActiveInsight(null);
    setThinking(false);
    setChatError(null);
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

  const onSenecaAction = (action: SenecaActionCard) => {
    if (!activeTeamId) return;
    handleClose();
    senecaActionNavigate(
      action.id,
      activeTeamId,
      action.taskId,
      action.memberUserId ?? activeInsight?.memberUserId,
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
        <View style={styles.bgOrb} pointerEvents="none">
          <LinearGradient
            colors={["rgba(124, 58, 237, 0.14)", "rgba(67, 97, 238, 0.08)", "rgba(255,255,255,0)"]}
            style={styles.bgOrbGradient}
          />
        </View>

        <SafeAreaView style={styles.screen} edges={["top"]}>
          <SafeKeyboardAvoidingView style={styles.flex}>
            <View style={styles.header}>
              {view === "chat" ? (
                <Pressable onPress={backToBriefing} style={styles.headerIconBtn} testID="seneca-back-to-briefing">
                  <ArrowLeft size={20} color="#64748B" strokeWidth={2.2} />
                </Pressable>
              ) : (
                <SenecaIcon size={40} />
              )}

              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>Seneca</Text>
                <Text style={styles.headerSubtitle}>Your leadership partner</Text>
                {view === "briefing" ? (
                  <View style={styles.headerStatus}>
                    <View
                      style={[
                        styles.statusDot,
                        snapshot?.fromLiveData ? styles.statusDotLive : styles.statusDotIdle,
                      ]}
                    />
                    <Text style={styles.headerStatusText}>{statusLabel}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.headerActions}>
                {view === "chat" ? (
                  <Pressable
                    onPress={() => setMoreOpen((v) => !v)}
                    style={styles.headerIconBtn}
                    testID="seneca-more-menu"
                  >
                    <MoreHorizontal size={20} color="#64748B" />
                  </Pressable>
                ) : null}
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

            <View style={styles.body}>
              {view === "briefing" ? (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  testID="seneca-briefing-scroll"
                >
                  {!activeTeamId ? (
                    <View style={styles.emptyCard}>
                      <Text style={styles.emptyTitle}>Workspace required</Text>
                      <Text style={styles.emptyText}>Join a workspace to unlock your leadership brief.</Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.greetingBlock}>
                        <Text style={styles.greetingSalutation}>{headlines.salutation}</Text>
                        <Text style={styles.greetingTagline}>{headlines.tagline}</Text>
                      </View>

                      {snapshotLoading ? (
                        <View style={styles.loadingCard}>
                          <ActivityIndicator color="#4361EE" />
                          <Text style={styles.loadingText}>Reviewing workspace data…</Text>
                        </View>
                      ) : snapshot?.loadError ? (
                        <View style={styles.emptyCard}>
                          <Text style={styles.errorText}>{snapshot.loadError}</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.sectionTitle}>Today&apos;s priorities</Text>
                          <View style={styles.priorityList}>
                            {priorityInsights.map((insight) => (
                              <PriorityInsightCard
                                key={insight.id}
                                insight={insight}
                                onAction={() => onInsightAction(insight)}
                              />
                            ))}
                          </View>

                          {teamPulse.length > 0 ? (
                            <>
                              <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Team pulse</Text>
                              <TeamPulseCard metrics={teamPulse} />
                            </>
                          ) : null}
                        </>
                      )}
                    </>
                  )}
                </ScrollView>
              ) : (
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.scroll}
                  contentContainerStyle={styles.chatScrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  testID="seneca-chat-scroll"
                >
                  {chatMessages.map((chatMessage) =>
                    chatMessage.role === "user" ? (
                      <View key={chatMessage.id} style={styles.userBubble}>
                        <Text style={styles.userBubbleText}>{chatMessage.text}</Text>
                      </View>
                    ) : (
                      <View key={chatMessage.id}>
                        <View style={styles.senecaBlock}>
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

                          {chatMessage.insights && chatMessage.insights.length > 0 ? (
                            <View style={styles.chatNotes}>
                              {chatMessage.insights.map((item) => (
                                <Text key={item.id} style={styles.chatNote}>
                                  {item.label}
                                  {item.detail ? ` — ${item.detail}` : null}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                        </View>

                        {chatMessage.actions && chatMessage.actions.length > 0 ? (
                          <View style={styles.nextSteps}>
                            <Text style={styles.nextStepsLabel}>Recommended actions</Text>
                            {chatMessage.actions.map((item, index) => (
                              <Pressable
                                key={`${chatMessage.id}-${item.id}`}
                                onPress={() => onSenecaAction(item)}
                                style={[styles.nextStepRow, index > 0 && styles.nextStepRowBorder]}
                                testID={`seneca-action-${item.id}`}
                              >
                                <View style={styles.nextStepCopy}>
                                  <Text style={styles.nextStepTitle}>{item.title}</Text>
                                  <Text style={styles.nextStepDesc}>{item.description}</Text>
                                </View>
                                <ChevronRight size={16} color="#94A3B8" />
                              </Pressable>
                            ))}
                          </View>
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
                        <Text style={styles.thinkingText}>Analyzing workspace…</Text>
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
            </View>

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
    backgroundColor: "transparent",
  },
  bgOrb: {
    position: "absolute",
    top: -20,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: "hidden",
  },
  bgOrbGradient: {
    width: "100%",
    height: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
    backgroundColor: "transparent",
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
  headerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  headerStatusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotLive: { backgroundColor: "#10B981" },
  statusDotIdle: { backgroundColor: "#94A3B8" },
  moreMenu: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
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
  body: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  chatScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 14,
  },
  greetingBlock: {
    marginBottom: 24,
  },
  greetingSalutation: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  greetingTagline: {
    fontSize: 18,
    fontWeight: "600",
    color: "#7C3AED",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 12,
  },
  sectionTitleSpaced: {
    marginTop: 24,
  },
  priorityList: {
    gap: 10,
  },
  priorityCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingVertical: 14,
    paddingRight: 12,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  priorityCardPressed: {
    opacity: 0.96,
  },
  priorityAccent: {
    width: 4,
    alignSelf: "stretch",
    marginRight: 12,
  },
  priorityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  priorityBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  priorityLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  priorityTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 20,
  },
  priorityDetail: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
    lineHeight: 16,
  },
  priorityActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  priorityPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  priorityPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pulseCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingVertical: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  pulseCol: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 4,
  },
  pulseColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: "#F1F5F9",
  },
  pulseValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  pulseLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  pulseStatus: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
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
  loadingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#DC2626",
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
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
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  thinkingText: {
    fontSize: 14,
    color: "#64748B",
  },
  senecaMessage: {
    fontSize: 15,
    lineHeight: 23,
    color: "#334155",
    fontWeight: "400",
  },
  chatNotes: {
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  chatNote: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  nextSteps: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    overflow: "hidden",
  },
  nextStepsLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  nextStepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  nextStepRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  nextStepCopy: { flex: 1, paddingRight: 8 },
  nextStepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  nextStepDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
    marginTop: 2,
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
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 4,
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
