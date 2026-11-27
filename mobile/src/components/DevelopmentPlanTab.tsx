import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  StyleSheet,
} from "react-native";
import { toast } from "burnt";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Plus,
  X,
  Target,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  ChevronLeft,
  Pencil,
  Trash2,
  Check,
  Printer,
  Download,
  Calendar,
  UserRound,
  ArrowDown,
  ChartColumn,
  CircleCheck,
  ListChecks,
  ArrowRight,
  Sparkles,
} from "lucide-react-native";
import {
  addDevelopmentGoalNote,
  createDevelopmentGoal,
  deleteDevelopmentGoal,
  deleteDevelopmentGoalNote,
  fetchDevelopmentGoals,
  setDevelopmentGoalStatus,
  updateDevelopmentGoal,
  updateDevelopmentGoalStepCompletion,
  updateDevelopmentGoalNote,
  type DevelopmentGoal,
  type DevelopmentGoalNote,
} from "@/lib/member-profile-api";
import {
  canMarkGoalComplete,
  developmentPlanSummary,
  goalProgress,
  isGoalStepComplete,
  type DevelopmentPlanSummary,
} from "@/lib/development-goal-progress";
import { realtimeClient } from "@/lib/realtime-client";
import { printDevelopmentPlan, downloadDevelopmentPlanPdf } from "@/lib/development-plan-print";
import {
  goalStatusLabel,
  normalizeDevelopmentGoalStatus,
} from "@/lib/development-goal-activity";
import {
  extractGoalDuePriorityFromNotes,
  parseGoalBootstrapNote,
  type GoalStarter,
} from "@/lib/development-goal-presets";
import {
  CreateDevelopmentGoalModal,
  type CreateDevelopmentGoalMode,
  type CreateDevelopmentGoalPayload,
} from "@/components/CreateDevelopmentGoalModal";
import { invalidateDevelopmentCaches } from "@/lib/invalidate-development-caches";
import { GoalEmptyState } from "@/components/development/GoalEmptyState";
import { CreateGoalEntrySheet } from "@/components/development/CreateGoalEntrySheet";
import { SenecaGenerateGoalSheet } from "@/components/development/SenecaGenerateGoalSheet";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  /** The signed-in person is this member. */
  isSelf?: boolean;
  memberImage?: string | null;
  managerName?: string | null;
  canCreate: boolean;
  canAddNotes: boolean;
  canCompleteSteps?: boolean;
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
  embeddedListScroll?: boolean;
  /** Lets a parent summarize the plan without fetching the goals again. */
  onGoalsChange?: (goals: DevelopmentGoal[]) => void;
  /** Off when the parent already shows these numbers in its own summary card. */
  showProgressCard?: boolean;
};

const VISIBLE_DETAIL_ROWS = 3;
const GOAL_STEP_ROW_HEIGHT = 44;
const GOAL_NOTE_ROW_HEIGHT = 48;
const DETAIL_ROW_GAP = 4;

function GoalListContainer({
  scroll,
  children,
}: {
  scroll: boolean;
  children: React.ReactNode;
}) {
  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, gap: 14, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={{ gap: 14 }}>{children}</View>;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatNoteWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function goalDuePriority(goal: DevelopmentGoal): {
  dueLabel: string;
  priorityLabel: string;
} | null {
  if (goal.dueDate) {
    const priorityLabel =
      goal.priority === "low" ? "Low" : goal.priority === "high" ? "High" : "Normal";
    return { dueLabel: formatWhen(goal.dueDate), priorityLabel };
  }
  return extractGoalDuePriorityFromNotes(goal.notes);
}

function visibleGoalNotes(goal: DevelopmentGoal) {
  return goal.notes
    .map((note) => {
      const legacy = parseGoalBootstrapNote(note.body);
      return legacy ? { ...note, body: legacy.coachingBody ?? "" } : note;
    })
    .filter((note) => note.body.trim().length > 0);
}

function lastUpdatedAt(goal: DevelopmentGoal): string {
  if (goal.notes.length === 0) return goal.createdAt;
  return goal.notes.reduce(
    (latest, note) => (new Date(note.createdAt) > new Date(latest) ? note.createdAt : latest),
    goal.notes[0].createdAt,
  );
}

function displayUserName(user: { name: string; email: string } | undefined): string {
  return user?.name?.trim() || user?.email || "Someone";
}

function DevelopmentProgressCard({
  summary,
}: {
  summary: DevelopmentPlanSummary;
}) {
  const stats = [
    {
      key: "active",
      icon: Target,
      color: "#6D4AFF",
      bg: "#F1EDFF",
      value: String(summary.activeCount),
      label: summary.activeCount === 1 ? "Active goal" : "Active goals",
    },
    {
      key: "completed",
      icon: CircleCheck,
      color: "#0F9D6E",
      bg: "#E7F8F1",
      value: String(summary.completedCount),
      label: "Completed",
    },
    {
      key: "overall",
      icon: ChartColumn,
      color: "#3B6FF5",
      bg: "#EAF1FE",
      value: `${summary.overallPercent}%`,
      label: "Overall progress",
    },
  ];

  return (
    <View style={progressStyles.card} testID="development-progress-card">
      <Text style={progressStyles.eyebrow}>DEVELOPMENT PROGRESS</Text>
      <View style={progressStyles.row}>
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <React.Fragment key={stat.key}>
              {index > 0 ? <View style={progressStyles.divider} /> : null}
              <View style={progressStyles.cell}>
                <View style={progressStyles.cellHead}>
                  <View
                    style={[progressStyles.icon, { backgroundColor: stat.bg }]}
                  >
                    <Icon size={14} color={stat.color} strokeWidth={2.3} />
                  </View>
                  <Text style={progressStyles.value} numberOfLines={1}>
                    {stat.value}
                  </Text>
                </View>
                <Text style={progressStyles.label} numberOfLines={1}>
                  {stat.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ECEFF5",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  eyebrow: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 0.75,
    color: "#66748C",
  },
  row: { flexDirection: "row", alignItems: "stretch" },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    backgroundColor: "#EDF0F6",
  },
  cell: { flex: 1, minWidth: 0 },
  cellHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#0F172A",
  },
  label: {
    marginTop: 5,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    color: "#3C4A61",
  },
});

/**
 * Heading over one group of goals. Groups that can be folded away pass
 * onToggle; the active group is always open, so it has no chevron to tap.
 */
function GoalSectionHeader({
  title,
  count,
  open,
  onToggle,
  testID,
}: {
  title: string;
  count?: number;
  open?: boolean;
  onToggle?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={sectionStyles.title}>{title}</Text>
        {typeof count === "number" ? (
          <Text style={sectionStyles.count}>{count}</Text>
        ) : null}
      </View>
      {onToggle ? (
        open ? (
          <ChevronUp size={16} color="#94A3B8" />
        ) : (
          <ChevronDown size={16} color="#94A3B8" />
        )
      ) : null}
    </>
  );

  if (!onToggle) {
    return (
      <View style={sectionStyles.row} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onToggle}
      style={sectionStyles.row}
      accessibilityRole="button"
      accessibilityLabel={`${open ? "Hide" : "Show"} ${title.toLowerCase()}`}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  count: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
});

function GoalCompletePulse({ delay, size }: { delay: number; size: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - progress.value),
    transform: [{ scale: 0.78 + progress.value * 0.5 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: "#A78BFA",
        },
        style,
      ]}
    />
  );
}

function GoalCompletionEffect({
  celebrating,
  percent,
}: {
  celebrating: boolean;
  percent: number;
}) {
  const fill = useSharedValue(Math.max(0, Math.min(100, percent)) / 100);
  const burst = useSharedValue(0);

  useEffect(() => {
    if (celebrating) {
      fill.value = withTiming(1, {
        duration: 700,
        easing: Easing.out(Easing.cubic),
      });
      burst.value = withSequence(
        withSpring(1, { damping: 12, stiffness: 160 }),
        withTiming(0.92, { duration: 180 }),
      );
    } else {
      fill.value = withTiming(Math.max(0, Math.min(100, percent)) / 100, {
        duration: 450,
      });
      burst.value = withTiming(0, { duration: 200 });
    }
  }, [burst, celebrating, fill, percent]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(fill.value * 100)}%`,
  }));

  const markStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrating ? 0.92 + burst.value * 0.18 : 1 }],
  }));

  return (
    <View style={completionStyles.stage}>
      {!celebrating ? (
        <>
          <GoalCompletePulse delay={0} size={92} />
          <GoalCompletePulse delay={700} size={92} />
        </>
      ) : null}
      <Animated.View style={[completionStyles.mark, markStyle]}>
        {celebrating ? (
          <CircleCheck size={34} color="#0F9D6E" strokeWidth={2.2} />
        ) : (
          <Target size={30} color="#6D28D9" strokeWidth={2.2} />
        )}
      </Animated.View>
      <View style={completionStyles.barTrack}>
        <Animated.View style={[completionStyles.barFill, fillStyle]} />
      </View>
      {celebrating ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={completionStyles.sparkRow}
        >
          <Sparkles size={14} color="#A78BFA" strokeWidth={2.2} />
          <Text style={completionStyles.sparkLabel}>Goal complete</Text>
          <Sparkles size={14} color="#F2B84B" strokeWidth={2.2} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const completionStyles = StyleSheet.create({
  stage: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 118,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0FF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4DEFF",
    zIndex: 1,
  },
  barTrack: {
    marginTop: 14,
    width: "100%",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#E9ECF3",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#6D28D9",
  },
  sparkRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sparkLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#6D28D9",
  },
});

export function DevelopmentPlanTab({
  teamId,
  memberUserId,
  memberName,
  isSelf = false,
  memberImage = null,
  managerName = null,
  canCreate,
  canAddNotes,
  canCompleteSteps = false,
  autoOpenCreate = false,
  onAutoOpenCreateHandled,
  embeddedListScroll = false,
  onGoalsChange,
  showProgressCard = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [goalCompleteCelebrating, setGoalCompleteCelebrating] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [stepSavingKey, setStepSavingKey] = useState<string | null>(null);
  const [stepCompletionConfirmation, setStepCompletionConfirmation] = useState<{
    goal: DevelopmentGoal;
    stepIndex: number;
  } | null>(null);
  const [completeGoal, setCompleteGoal] = useState<DevelopmentGoal | null>(null);
  const [deleteGoalConfirmation, setDeleteGoalConfirmation] =
    useState<DevelopmentGoal | null>(null);
  const [deletingGoal, setDeletingGoal] = useState(false);
  const [planActionsOpen, setPlanActionsOpen] = useState(false);
  const detailScrollRef = React.useRef<ScrollView>(null);
  const [detailScrollContentHeight, setDetailScrollContentHeight] = useState(0);
  const [detailScrollViewportHeight, setDetailScrollViewportHeight] = useState(0);
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [previewGoal, setPreviewGoal] = useState<DevelopmentGoal | null>(null);
  const previewGoalCanComplete = previewGoal
    ? canMarkGoalComplete(previewGoal)
    : false;
  const previewGoalRemainingSteps = previewGoal
    ? Math.max(
        0,
        goalProgress(previewGoal).totalStepCount -
          goalProgress(previewGoal).completedStepCount,
      )
    : 0;
  /**
   * True when the action awaiting confirmation is the only one left, so
   * confirming it also completes the goal. Worth saying up front, since that
   * is a bigger change than ticking a box.
   */
  const stepCompletionFinishesGoal = (() => {
    if (!stepCompletionConfirmation) return false;
    const { goal, stepIndex } = stepCompletionConfirmation;
    const progress = goalProgress(goal);
    return (
      progress.totalStepCount > 0 &&
      progress.completedStepCount === progress.totalStepCount - 1 &&
      !progress.completedStepIndexes.includes(stepIndex)
    );
  })();
  const previewGoalNotes = previewGoal ? visibleGoalNotes(previewGoal) : [];
  const [goalActionMenu, setGoalActionMenu] = useState<DevelopmentGoal | null>(null);
  const [noteGoal, setNoteGoal] = useState<DevelopmentGoal | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const autoCreateHandledRef = React.useRef(false);

  const [createChooserOpen, setCreateChooserOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateDevelopmentGoalMode>("scratch");
  const [starterPrefill, setStarterPrefill] = useState<{
    skill: string;
    description: string;
    steps: string[];
  } | null>(null);
  const [updateGoal, setUpdateGoal] = useState<DevelopmentGoal | null>(null);
  const [skill, setSkill] = useState("");
  const [skillDescription, setSkillDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [newNotes, setNewNotes] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const loadGoals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const list = await fetchDevelopmentGoals(teamId, memberUserId);
      setGoals(list);
      setPreviewGoal((current) =>
        current ? list.find((goal) => goal.id === current.id) ?? null : null,
      );
      setUpdateGoal((current) =>
        current ? list.find((goal) => goal.id === current.id) ?? null : null,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load development plan.");
      setGoals([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    onGoalsChange?.(goals);
  }, [goals, onGoalsChange]);

  useEffect(
    () =>
      realtimeClient.onInboxUpdated((event) => {
        if (
          event.kind !== "team" ||
          event.teamId !== teamId ||
          (event.resource && event.resource !== "goals")
        ) {
          return;
        }
        void loadGoals(true);
      }),
    [loadGoals, teamId],
  );

  const activeGoals = goals.filter((g) => g.status === "active");
  const inactiveGoals = goals.filter((g) => g.status === "inactive");
  const closedGoals = goals.filter((g) => g.status === "closed");
  const planSummary = developmentPlanSummary(goals);
  const isReadOnlyPlan = goals.length > 0 && goals.every((goal) => goal.readOnly);
  const isArchivedPlan = goals.length > 0 && goals.every((goal) => goal.isArchived);
  const canUpdate = (canCreate || canAddNotes) && !isReadOnlyPlan;
  const canCreateGoal = canCreate && !isReadOnlyPlan;

  const onPrint = async () => {
    if (goals.length === 0) return;
    setPrintingPdf(true);
    setErr(null);
    try {
      await printDevelopmentPlan({
        goals,
        memberName,
        managerName,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not open print view.";
      setErr(message);
      toast({ title: message, preset: "error" });
    } finally {
      setPrintingPdf(false);
    }
  };

  const onDownloadPdf = async () => {
    if (goals.length === 0) return;
    setDownloadingPdf(true);
    setErr(null);
    try {
      await downloadDevelopmentPlanPdf({
        goals,
        memberName,
        managerName,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not download PDF.";
      setErr(message);
      toast({ title: message, preset: "error" });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openCreateChooser = () => {
    setModalErr(null);
    setStarterPrefill(null);
    setCreateChooserOpen(true);
  };

  const openCreate = (
    mode: CreateDevelopmentGoalMode = "scratch",
    starter?: GoalStarter,
  ) => {
    setModalErr(null);
    setCreateChooserOpen(false);
    setCreateMode(mode);
    setStarterPrefill(
      starter
        ? {
            skill: starter.skill,
            description: starter.description,
            steps: starter.steps,
          }
        : null,
    );
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!autoOpenCreate) {
      autoCreateHandledRef.current = false;
      return;
    }
    if (!canCreateGoal || autoCreateHandledRef.current || loading) return;
    autoCreateHandledRef.current = true;
    onAutoOpenCreateHandled?.();
    openCreateChooser();
  }, [
    autoOpenCreate,
    canCreateGoal,
    loading,
    onAutoOpenCreateHandled,
  ]);

  const onCreateGoalFromSheet = async (payload: CreateDevelopmentGoalPayload) => {
    if (!payload.skill.trim()) {
      setModalErr("Choose or enter a developmental skill.");
      return;
    }
    if (payload.steps.length === 0) {
      setModalErr("Add at least one action.");
      return;
    }
    setSaving(true);
    setModalErr(null);
    try {
      const created = await createDevelopmentGoal(teamId, memberUserId, {
        skill: payload.skill.trim(),
        description: payload.description?.trim() || null,
        dueDate: payload.dueDate,
        priority: payload.priority,
        steps: payload.steps,
      });
      if (payload.notes?.trim()) {
        await addDevelopmentGoalNote(teamId, memberUserId, created.id, payload.notes.trim());
      }
      toast({ title: "Goal created", preset: "done" });
      closeModal();
      await loadGoals();
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Could not create goal.");
    } finally {
      setSaving(false);
    }
  };

  const openUpdate = (goal: DevelopmentGoal) => {
    setUpdateGoal(goal);
    setSkill(goal.skill);
    setSkillDescription(goal.description ?? "");
    setSteps(goal.steps.length > 0 ? [...goal.steps] : [""]);
    setNewNotes([]);
    setEditingNoteId(null);
    setEditDraft("");
    setModalErr(null);
  };

  const openAddNote = (goal: DevelopmentGoal) => {
    setNoteGoal(goal);
    setNoteDraft("");
    setNoteErr(null);
  };

  const closeNoteModal = () => {
    const goal = noteGoal;
    setNoteGoal(null);
    setNoteDraft("");
    setNoteErr(null);
    if (goal) setPreviewGoal(goal);
  };

  const onSaveProgressNote = async () => {
    if (!noteGoal) return;
    const body = noteDraft.trim();
    if (!body) {
      setNoteErr("Enter a progress note.");
      return;
    }
    setNoteSaving(true);
    setNoteErr(null);
    try {
      const updated = await addDevelopmentGoalNote(
        teamId,
        memberUserId,
        noteGoal.id,
        body,
      );
      setGoals((current) =>
        current.map((goal) => (goal.id === updated.id ? updated : goal)),
      );
      toast({ title: "Progress note added", preset: "done" });
      setNoteGoal(null);
      setNoteDraft("");
      setNoteErr(null);
      setPreviewGoal(updated);
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setNoteSaving(false);
    }
  };

  const closeModal = () => {
    setCreateChooserOpen(false);
    setCreateOpen(false);
    setUpdateGoal(null);
    setModalErr(null);
    setNewNotes([]);
    setEditingNoteId(null);
  };

  const onSaveGoal = async () => {
    const trimmedSkill = skill.trim();
    const trimmedDescription = skillDescription.trim();
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!trimmedSkill) {
      setModalErr("Enter a developmental skill.");
      return;
    }
    setSaving(true);
    setModalErr(null);
    try {
      if (updateGoal) {
        const goalDetailsChanged =
          trimmedSkill !== updateGoal.skill ||
          trimmedDescription !== (updateGoal.description ?? "") ||
          JSON.stringify(trimmedSteps) !== JSON.stringify(updateGoal.steps);
        if (goalDetailsChanged) {
          await updateDevelopmentGoal(teamId, memberUserId, updateGoal.id, {
            skill: trimmedSkill,
            description: trimmedDescription || null,
            steps: trimmedSteps,
          });
        }
        for (let i = 0; i < newNotes.length; i++) {
          const body = newNotes[i].trim();
          if (body) await addDevelopmentGoalNote(teamId, memberUserId, updateGoal.id, body);
        }
        toast({ title: "Changes saved", preset: "done" });
        closeModal();
      }
      await loadGoals();
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  };

  const onMarkComplete = (goal: DevelopmentGoal) => {
    setCompleteGoal(goal);
  };

  /** True when marking this action complete would finish every action on an active goal. */
  const stepWouldFinishGoal = (goal: DevelopmentGoal, stepIndex: number) => {
    if (isGoalStepComplete(goal, stepIndex)) return false;
    if (normalizeDevelopmentGoalStatus(goal.status) !== "active") return false;
    const progress = goalProgress(goal);
    return (
      progress.totalStepCount > 0 &&
      progress.completedStepCount === progress.totalStepCount - 1 &&
      !progress.completedStepIndexes.includes(stepIndex)
    );
  };

  /**
   * Ask before the last action closes the goal; other toggles stay one-tap.
   */
  const requestToggleGoalStep = (
    goal: DevelopmentGoal,
    stepIndex: number,
  ) => {
    if (stepWouldFinishGoal(goal, stepIndex)) {
      setStepCompletionConfirmation({ goal, stepIndex });
      return;
    }
    void toggleGoalStep(goal, stepIndex);
  };

  const toggleGoalStep = async (
    goal: DevelopmentGoal,
    stepIndex: number,
  ) => {
    const key = `${goal.id}:${stepIndex}`;
    const completed = !isGoalStepComplete(goal, stepIndex);
    setStepSavingKey(key);
    try {
      const updated = await updateDevelopmentGoalStepCompletion(
        teamId,
        memberUserId,
        goal.id,
        { stepIndex, completed },
      );
      setGoals((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setPreviewGoal((current) =>
        current?.id === updated.id ? updated : current,
      );
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);

      // After the user confirms the last action, close the goal.
      if (
        completed &&
        normalizeDevelopmentGoalStatus(updated.status) === "active" &&
        canMarkGoalComplete(updated)
      ) {
        await closeGoalAfterFinalAction(updated);
      }
    } catch (error) {
      toast({
        title:
          error instanceof Error
            ? error.message
            : "Could not update action",
        preset: "error",
      });
    } finally {
      setStepSavingKey(null);
    }
  };

  /**
   * Closes a goal whose final action was just ticked off. A failure here is
   * not worth an error: the action itself is saved either way, and the goal
   * can still be completed from its menu.
   */
  const closeGoalAfterFinalAction = async (goal: DevelopmentGoal) => {
    try {
      await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "closed");
      await loadGoals();
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
      toast({ title: "Goal completed", preset: "done" });
    } catch {
      /* left active, completable by hand */
    }
  };

  const confirmMarkComplete = async () => {
    if (!completeGoal) return;
    setStatusSavingId(completeGoal.id);
    try {
      await setDevelopmentGoalStatus(teamId, memberUserId, completeGoal.id, "closed");
      await loadGoals();
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
      toast({ title: "Goal completed", preset: "done" });
      setCompleteGoal(null);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not update", preset: "error" });
    } finally {
      setStatusSavingId(null);
    }
  };

  const onReopen = (goal: DevelopmentGoal) => {
    const isInactive = normalizeDevelopmentGoalStatus(goal.status) === "inactive";
    Alert.alert(
      isInactive ? "Reactivate goal?" : "Reopen goal?",
      isInactive
        ? `Reactivate "${goal.skill}"? Add progress updates to keep it active.`
        : `Reopen "${goal.skill}"? It will return to the active goals list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isInactive ? "Reactivate" : "Reopen",
          onPress: async () => {
            setStatusSavingId(goal.id);
            try {
              await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "active");
              await loadGoals();
              void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
              toast({
                title: isInactive ? "Goal reactivated" : "Goal reopened",
                preset: "done",
              });
            } catch (e) {
              toast({
                title: e instanceof Error ? e.message : "Could not reopen goal",
                preset: "error",
              });
            } finally {
              setStatusSavingId(null);
            }
          },
        },
      ],
    );
  };

  const onDelete = (goal: DevelopmentGoal) => {
    setDeleteGoalConfirmation(goal);
  };

  const confirmDeleteGoal = async () => {
    if (!deleteGoalConfirmation) return;
    setDeletingGoal(true);
    try {
      await deleteDevelopmentGoal(
        teamId,
        memberUserId,
        deleteGoalConfirmation.id,
      );
      setDeleteGoalConfirmation(null);
      await loadGoals();
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
      toast({ title: "Goal deleted", preset: "done" });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not delete",
        preset: "error",
      });
    } finally {
      setDeletingGoal(false);
    }
  };

  const openGoalMenu = (goal: DevelopmentGoal, closePreview = false) => {
    if (goal.readOnly) return;
    if (closePreview) setPreviewGoal(null);
    setGoalActionMenu(goal);
  };

  const renderGoalRow = (
    goal: DevelopmentGoal,
    section: "active" | "inactive" | "closed",
  ) => {
    const status = normalizeDevelopmentGoalStatus(goal.status);
    const isClosed = status === "closed";
    const isInactive = status === "inactive";
    const accent = isClosed ? "#94A3B8" : isInactive ? "#F59E0B" : "#6D28D9";
    const iconBackground = isClosed ? "#F1F5F9" : isInactive ? "#FFF3E0" : "#F0ECFF";
    const duePriority = goalDuePriority(goal);
    const progress = goalProgress(goal);
    const expanded = expandedGoalIds.has(goal.id);
    const steps = goal.steps ?? [];
    const statusPill =
      section !== "active"
        ? goalStatusLabel(status)
        : progress.progressPercent <= 0
          ? "Not started"
          : progress.progressPercent >= 100
            ? "Complete"
            : "In progress";
    const statusPillBg =
      section !== "active"
        ? isClosed
          ? "#F1F5F9"
          : "#FFEDD5"
        : progress.progressPercent <= 0
          ? "#F1F5F9"
          : progress.progressPercent >= 100
            ? "#E7F8F1"
            : "#F0ECFF";
    const statusPillColor =
      section !== "active"
        ? isClosed
          ? "#64748B"
          : "#C2410C"
        : progress.progressPercent <= 0
          ? "#64748B"
          : progress.progressPercent >= 100
            ? "#0F9D6E"
            : "#6D28D9";

    const toggleExpanded = () => {
      setExpandedGoalIds((current) => {
        const next = new Set(current);
        if (next.has(goal.id)) next.delete(goal.id);
        else next.add(goal.id);
        return next;
      });
    };

    return (
      <View
        key={goal.id}
        style={{
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "#E8ECF4",
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 4,
          shadowColor: "#1E1B4B",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}
        testID={`goal-card-${goal.id}`}
      >
        <Pressable
          onPress={toggleExpanded}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${goal.skill} actions`}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                backgroundColor: iconBackground,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Target size={17} color={accent} strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 19,
                  fontWeight: "800",
                  letterSpacing: -0.2,
                  color: "#0F172A",
                }}
                numberOfLines={2}
              >
                {goal.skill}
              </Text>
              <Text
                style={{ fontSize: 12, lineHeight: 15, fontWeight: "500", color: "#8A96A8" }}
                numberOfLines={1}
              >
                {duePriority ? `Due ${duePriority.dueLabel}` : "No due date"}
              </Text>
            </View>
            {expanded ? (
              <ChevronUp size={18} color="#A0A9B8" />
            ) : (
              <ChevronDown size={18} color="#A0A9B8" />
            )}
          </View>

          <View style={{ marginTop: 14, gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#5B667A" }}>
                Goal progress
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "800",
                  color: isClosed ? "#64748B" : isInactive ? "#A16207" : "#6D28D9",
                }}
              >
                {progress.progressPercent}%
              </Text>
            </View>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                overflow: "hidden",
                backgroundColor: "#E9ECF3",
              }}
            >
              <View
                style={{
                  width: `${progress.progressPercent}%`,
                  height: "100%",
                  borderRadius: 4,
                  backgroundColor: isClosed
                    ? "#94A3B8"
                    : isInactive
                      ? "#B48A4C"
                      : "#6D28D9",
                }}
              />
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                <ListChecks size={14} color="#8A96A8" strokeWidth={2.2} />
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#5B667A" }}
                  numberOfLines={1}
                >
                  {progress.completedStepCount} of {progress.totalStepCount}{" "}
                  {progress.totalStepCount === 1 ? "action" : "actions"} completed
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  backgroundColor: statusPillBg,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: statusPillColor,
                  }}
                >
                  {statusPill}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>

        {expanded && steps.length > 0 ? (
          <View
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: "#EEF0F5",
              gap: 6,
            }}
          >
            {steps.map((step, index) => {
              const completed = isGoalStepComplete(goal, index);
              const saving = stepSavingKey === `${goal.id}:${index}`;
              const canToggle =
                canCompleteSteps && section === "active" && !goal.readOnly;
              return (
                <Pressable
                  key={`${goal.id}-step-${index}`}
                  disabled={!canToggle || saving}
                  onPress={() => {
                    if (!canToggle) return;
                    requestToggleGoalStep(goal, index);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 6,
                    opacity: saving ? 0.6 : 1,
                  }}
                  accessibilityRole={canToggle ? "checkbox" : "text"}
                  accessibilityState={{ checked: completed }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      borderWidth: completed ? 0 : 1.5,
                      borderColor: "#CBD5E1",
                      backgroundColor: completed ? "#6D28D9" : "#FFFFFF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {completed ? (
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    ) : null}
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 13,
                      lineHeight: 17,
                      fontWeight: "500",
                      color: completed ? "#94A3B8" : "#1F2937",
                      textDecorationLine: completed ? "line-through" : "none",
                    }}
                  >
                    {step}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            setDetailScrollOffset(0);
            setPreviewGoal(goal);
          }}
          style={{
            marginTop: 10,
            paddingTop: 12,
            paddingBottom: 12,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: "#EEF0F5",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${goal.skill}`}
          testID={`goal-card-details-${goal.id}`}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#6D28D9" }}>
            View goal details
          </Text>
          <ArrowRight size={16} color="#6D28D9" strokeWidth={2.4} />
        </Pressable>
      </View>
    );
  };

  const renderGoalList = (
    list: DevelopmentGoal[],
    section: "active" | "inactive" | "closed",
  ) => (
    <View style={{ gap: 12 }}>
      {list.map((goal) => renderGoalRow(goal, section))}
    </View>
  );

  const saveNoteEdit = async (goalId: string, noteId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setModalErr("Note cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateDevelopmentGoalNote(teamId, memberUserId, goalId, noteId, trimmed);
      const updated = await fetchDevelopmentGoals(teamId, memberUserId);
      setGoals(updated);
      const refreshed = updated.find((g) => g.id === goalId);
      if (refreshed) setUpdateGoal(refreshed);
      setEditingNoteId(null);
      setEditDraft("");
      void invalidateDevelopmentCaches(queryClient, teamId, memberUserId);
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  };

  const removeNote = (goalId: string, note: DevelopmentGoalNote) => {
    Alert.alert("Remove note?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteDevelopmentGoalNote(teamId, memberUserId, goalId, note.id);
            const updated = await fetchDevelopmentGoals(teamId, memberUserId);
            setGoals(updated);
            const refreshed = updated.find((g) => g.id === goalId);
            if (refreshed) {
              setUpdateGoal((current) =>
                current?.id === refreshed.id ? refreshed : current,
              );
              setPreviewGoal((current) =>
                current?.id === refreshed.id ? refreshed : current,
              );
            }
            void invalidateDevelopmentCaches(
              queryClient,
              teamId,
              memberUserId,
            );
          } catch (e) {
            toast({ title: e instanceof Error ? e.message : "Could not remove", preset: "error" });
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const updateModalVisible = !!updateGoal;
  const previewStatus = previewGoal
    ? normalizeDevelopmentGoalStatus(previewGoal.status)
    : null;
  const showDetailScrollHint =
    detailScrollContentHeight > detailScrollViewportHeight + 8 &&
    detailScrollOffset <
      detailScrollContentHeight - detailScrollViewportHeight - 8;
  const showCenteredEmpty = !loading && activeGoals.length === 0 && inactiveGoals.length === 0 && closedGoals.length === 0;

  return (
    <View
      style={{
        gap: 14,
        flex: embeddedListScroll ? 1 : undefined,
        flexGrow: embeddedListScroll ? 1 : undefined,
      }}
    >
      {isArchivedPlan ? (
        <View style={{ padding: 11, borderRadius: 11, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#F8FAFC" }} testID="development-plan-read-only">
          <Text style={{ fontSize: 12, fontWeight: "800", color: "#334155" }}>Archived development plan</Text>
          <Text style={{ marginTop: 3, fontSize: 11, lineHeight: 16, color: "#64748B" }}>
            This former member&apos;s goals are available for reference only.
          </Text>
        </View>
      ) : null}
      {goals.length > 0 || (canCreateGoal && !showCenteredEmpty) ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Text
                style={{
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: "800",
                  color: "#475569",
                  letterSpacing: 0.75,
                  textTransform: "uppercase",
                }}
              >
                Goals
              </Text>
            </View>
          </View>
          {canCreateGoal && !showCenteredEmpty ? (
            <Pressable
              onPress={openCreateChooser}
              hitSlop={8}
              style={{
                minHeight: 28,
                paddingHorizontal: 10,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 5,
                borderWidth: 1,
                borderColor: "#E2E5EA",
                backgroundColor: "#FFFFFF",
              }}
              accessibilityRole="button"
              accessibilityLabel="Add goal"
              testID="new-development-goal-button"
            >
              <Plus size={13} color="#111827" strokeWidth={2.4} />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#111827",
                  letterSpacing: -0.1,
                }}
              >
                Add goal
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showProgressCard && !loading && goals.length > 0 ? (
        <DevelopmentProgressCard summary={planSummary} />
      ) : null}

      {loading ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : (
        <GoalListContainer scroll={embeddedListScroll}>
          {activeGoals.length === 0 ? (
            <View style={showCenteredEmpty ? { flexGrow: 1, justifyContent: "center" } : undefined}>
              <GoalEmptyState
                memberName={memberName}
                isSelf={isSelf}
                canCreate={canCreateGoal}
                hasAnyGoals={goals.length > 0}
                error={err}
                onCreate={openCreateChooser}
              />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <GoalSectionHeader
                title="Active goals"
                testID="active-goals-section"
              />
              {renderGoalList(activeGoals, "active")}
            </View>
          )}

          {inactiveGoals.length > 0 ? (
            <View style={{ gap: 10 }}>
              <GoalSectionHeader
                title="Inactive goals"
                open={inactiveOpen}
                onToggle={() => setInactiveOpen(!inactiveOpen)}
                testID="inactive-goals-section"
              />
              {inactiveOpen ? renderGoalList(inactiveGoals, "inactive") : null}
            </View>
          ) : null}

          {closedGoals.length > 0 ? (
            <View style={{ gap: 10 }}>
              <GoalSectionHeader
                title="Completed goals"
                open={closedOpen}
                onToggle={() => setClosedOpen(!closedOpen)}
                testID="completed-goals-section"
              />
              {closedOpen ? renderGoalList(closedGoals, "closed") : null}
            </View>
          ) : null}
        </GoalListContainer>
      )}

      <Modal
        visible={planActionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPlanActionsOpen(false)}
      >
        <Pressable
          onPress={() => setPlanActionsOpen(false)}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(15, 23, 42, 0.4)",
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: Math.max(18, insets.bottom),
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                width: 38,
                height: 5,
                borderRadius: 3,
                alignSelf: "center",
                backgroundColor: "#D8DCE5",
                marginBottom: 16,
              }}
            />
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#172033" }}>
              Development plan
            </Text>
            <Text
              style={{
                marginTop: 4,
                marginBottom: 14,
                fontSize: 13,
                color: "#7C8798",
              }}
            >
              Export or print the current plan.
            </Text>
            {[
              {
                key: "print",
                label: printingPdf ? "Printing…" : "Print plan",
                icon: Printer,
                disabled: loading || printingPdf,
                onPress: async () => {
                  setPlanActionsOpen(false);
                  await onPrint();
                },
              },
              {
                key: "download",
                label: downloadingPdf ? "Downloading…" : "Download PDF",
                icon: Download,
                disabled: loading || downloadingPdf,
                onPress: async () => {
                  setPlanActionsOpen(false);
                  await onDownloadPdf();
                },
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Pressable
                  key={action.key}
                  onPress={() => void action.onPress()}
                  disabled={action.disabled}
                  style={{
                    minHeight: 54,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    backgroundColor: "#F8FAFC",
                    marginBottom: 8,
                    opacity: action.disabled ? 0.55 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#F0ECFF",
                    }}
                  >
                    <Icon size={16} color="#684BFF" />
                  </View>
                  <Text
                    style={{ fontSize: 14, fontWeight: "700", color: "#243047" }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!deleteGoalConfirmation}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!deletingGoal) setDeleteGoalConfirmation(null);
        }}
      >
        <Pressable
          onPress={() => {
            if (!deletingGoal) setDeleteGoalConfirmation(null);
          }}
          style={{
            flex: 1,
            paddingHorizontal: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15, 23, 42, 0.5)",
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 360,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 16,
              borderRadius: 22,
              backgroundColor: "#FFFFFF",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "#E8E4F8",
              shadowColor: "#1E1B4B",
              shadowOpacity: 0.18,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 14 },
              elevation: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={{ width: 28, height: 28, borderRadius: 8 }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.8,
                  color: "#8B7CC8",
                }}
              >
                ALENIO
              </Text>
            </View>

            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FEF2F2",
                marginBottom: 14,
                alignSelf: "center",
              }}
            >
              <Trash2 size={24} color="#DC2626" strokeWidth={2.2} />
            </View>

            <Text
              style={{
                fontSize: 20,
                lineHeight: 25,
                fontWeight: "800",
                letterSpacing: -0.3,
                color: "#111827",
                textAlign: "center",
              }}
            >
              Delete this goal?
            </Text>

            {deleteGoalConfirmation ? (
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: "700",
                  color: "#3F4860",
                  textAlign: "center",
                }}
                numberOfLines={2}
              >
                {deleteGoalConfirmation.skill}
              </Text>
            ) : null}

            <Text
              style={{
                marginTop: 10,
                fontSize: 13.5,
                lineHeight: 19,
                fontWeight: "500",
                color: "#667085",
                textAlign: "center",
              }}
            >
              This permanently removes the goal and its progress notes. You
              can&apos;t undo this.
            </Text>

            <View style={{ marginTop: 18, gap: 8 }}>
              <Pressable
                onPress={() => void confirmDeleteGoal()}
                disabled={deletingGoal}
                style={{
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: "#DC2626",
                  opacity: deletingGoal ? 0.65 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Delete goal"
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}
                >
                  {deletingGoal ? "Deleting…" : "Delete goal"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDeleteGoalConfirmation(null)}
                disabled={deletingGoal}
                style={{
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  opacity: deletingGoal ? 0.55 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: "#53627A" }}
                >
                  Not yet
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!completeGoal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!statusSavingId) setCompleteGoal(null);
        }}
      >
        <Pressable
          onPress={() => {
            if (!statusSavingId) setCompleteGoal(null);
          }}
          style={{
            flex: 1,
            paddingHorizontal: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15, 23, 42, 0.46)",
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: 20,
              borderRadius: 24,
              backgroundColor: "#FFFFFF",
              shadowColor: "#312E81",
              shadowOpacity: 0.2,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
            accessibilityRole="alert"
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F0ECFF",
                marginBottom: 15,
              }}
            >
              <Target size={22} color="#684BFF" strokeWidth={2.3} />
            </View>
            <Text
              style={{
                fontSize: 20,
                lineHeight: 25,
                fontWeight: "800",
                color: "#111827",
              }}
            >
              Complete this goal?
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 14,
                lineHeight: 20,
                color: "#667085",
              }}
            >
              {completeGoal
                ? `Mark “${completeGoal.skill}” complete? It will move to completed goals and can be reopened later.`
                : ""}
            </Text>
            <View
              style={{
                marginTop: 20,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: "#EEF0F5",
                flexDirection: "row",
                gap: 10,
              }}
            >
              <Pressable
                onPress={() => setCompleteGoal(null)}
                disabled={!!statusSavingId}
                style={{
                  flex: 1,
                  minHeight: 46,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#E0E5EF",
                  backgroundColor: "#FFFFFF",
                  opacity: statusSavingId ? 0.55 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#53627A" }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmMarkComplete()}
                disabled={!!statusSavingId}
                style={{
                  flex: 1.25,
                  minHeight: 46,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: "#5B42F3",
                  opacity: statusSavingId ? 0.6 : 1,
                  shadowColor: "#5B42F3",
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 3,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFFFFF" }}>
                  {statusSavingId ? "Completing…" : "Mark complete"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!goalActionMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setGoalActionMenu(null)}
      >
        <Pressable
          onPress={() => setGoalActionMenu(null)}
          style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.42)",
            justifyContent: "flex-end",
            paddingHorizontal: 12,
            paddingBottom: Math.max(12, insets.bottom),
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              overflow: "hidden",
              shadowColor: "#0F172A",
              shadowOpacity: 0.16,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: -4 },
              elevation: 8,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#DCE5F2",
                alignSelf: "center",
                marginTop: 8,
                marginBottom: 4,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "#EEF2F6",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={require("@/assets/alenio-icon.png")}
                  style={{ width: 32, height: 32 }}
                  resizeMode="cover"
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#0F172A" }} numberOfLines={1}>
                  {goalActionMenu?.skill}
                </Text>
                <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                  {goalActionMenu ? `Updated ${formatWhen(lastUpdatedAt(goalActionMenu))}` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => setGoalActionMenu(null)}
                hitSlop={10}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={15} color="#64748B" />
              </Pressable>
            </View>

            {goalActionMenu ? (
              <>
                <Pressable
                  onPress={() => {
                    const goal = goalActionMenu;
                    setGoalActionMenu(null);
                    openUpdate(goal);
                  }}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    borderBottomWidth: 1,
                    borderBottomColor: "#EEF2F6",
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#4361EE" }}>
                    Edit
                  </Text>
                  <Pencil size={17} color="#4361EE" />
                </Pressable>

                {normalizeDevelopmentGoalStatus(goalActionMenu.status) !== "active" ? (
                  <Pressable
                    onPress={() => {
                      const goal = goalActionMenu;
                      setGoalActionMenu(null);
                      onReopen(goal);
                    }}
                    style={{
                      minHeight: 48,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: "#EEF2F6",
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#4361EE" }}>
                      {normalizeDevelopmentGoalStatus(goalActionMenu.status) === "inactive"
                        ? "Reactivate"
                        : "Reopen"}
                    </Text>
                    <Target size={17} color="#4361EE" />
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    const goal = goalActionMenu;
                    setGoalActionMenu(null);
                    onDelete(goal);
                  }}
                  style={{
                    minHeight: 48,
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#EF4444" }}>
                    Delete goal
                  </Text>
                  <Trash2 size={17} color="#EF4444" />
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <CreateGoalEntrySheet
        visible={createChooserOpen}
        memberName={memberName}
        isSelf={isSelf}
        onClose={() => setCreateChooserOpen(false)}
        onSelect={(mode) => openCreate(mode)}
      />

      <SenecaGenerateGoalSheet
        visible={createOpen && createMode === "seneca"}
        teamId={teamId}
        memberUserId={memberUserId}
        memberName={memberName}
        managerName={managerName}
        isSelf={isSelf}
        saving={saving}
        error={modalErr}
        onClose={closeModal}
        onCreate={(payload) => {
          void onCreateGoalFromSheet(payload);
        }}
      />

      <CreateDevelopmentGoalModal
        visible={createOpen && createMode === "scratch"}
        teamId={teamId}
        memberUserId={memberUserId}
        memberName={memberName}
        memberImage={memberImage}
        managerName={managerName}
        isSelf={isSelf}
        saving={saving}
        error={modalErr}
        prefill={starterPrefill}
        onClose={closeModal}
        onCreate={(payload) => {
          void onCreateGoalFromSheet(payload);
        }}
      />

      {previewGoal ? (
      <Modal
        key={previewGoal.id}
        visible
        animationType="slide"
        presentationStyle="fullScreen"
        supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
        onRequestClose={() => setPreviewGoal(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            paddingBottom: insets.bottom,
          }}
        >
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 18,
              paddingBottom: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: "#ECEEF3",
              backgroundColor: "#FFFFFF",
            }}
          >
            <Pressable
              onPress={() => setPreviewGoal(null)}
              hitSlop={10}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F2EEFF",
              }}
            >
              <ChevronLeft size={20} color="#684BFF" strokeWidth={2.1} />
            </Pressable>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 2.2,
                color: "#606B80",
              }}
            >
              GROWTH
            </Text>
            {!previewGoal.readOnly ? <Pressable
              onPress={() => openGoalMenu(previewGoal, true)}
              hitSlop={10}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#F5F6F9",
              }}
            >
              <MoreHorizontal size={19} color="#596277" strokeWidth={2.2} />
            </Pressable> : <View style={{ width: 34, height: 34 }} />}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 10,
              gap: 12,
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: "#F2EEFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Target size={21} color="#684BFF" strokeWidth={2.3} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontSize: 18, lineHeight: 22, fontWeight: "500", color: "#192033" }}
                numberOfLines={2}
              >
                {previewGoal?.skill}
              </Text>
              <View
                style={{
                  marginTop: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    backgroundColor:
                      previewStatus === "closed"
                        ? "#F1F5F9"
                        : previewStatus === "inactive"
                          ? "#FFF4E5"
                          : "#ECFDF3",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      color:
                        previewStatus === "closed"
                          ? "#64748B"
                          : previewStatus === "inactive"
                            ? "#B45309"
                            : "#15803D",
                    }}
                  >
                    {goalStatusLabel(previewStatus ?? "active")}
                  </Text>
                </View>
                {previewGoal &&
                goalDuePriority(previewGoal) ? (
                  <Text style={{ fontSize: 11, color: "#667085" }}>
                    Due{" "}
                    {
                      goalDuePriority(previewGoal)?.dueLabel
                    }
                  </Text>
                ) : null}
              </View>
              <Text
                style={{
                  marginTop: 7,
                  fontSize: 11,
                  lineHeight: 15,
                  color: "#6F788C",
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {previewGoal?.description?.trim() ||
                  "Build progress through clear actions and regular coaching."}
              </Text>
            </View>
          </View>

          {previewGoal ? (
            <>
              <ScrollView
                ref={detailScrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={(_width, height) =>
                  setDetailScrollContentHeight(height)
                }
                onLayout={(event) =>
                  setDetailScrollViewportHeight(
                    event.nativeEvent.layout.height,
                  )
                }
                onScroll={(event) =>
                  setDetailScrollOffset(event.nativeEvent.contentOffset.y)
                }
                scrollEventThrottle={16}
              >
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 18,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#E8E3FF",
                    padding: 11,
                    shadowColor: "#33218A",
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.04,
                    shadowRadius: 12,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "800",
                          letterSpacing: 0.65,
                          color: "#718096",
                        }}
                      >
                        OVERALL PROGRESS
                      </Text>
                      <Text
                        style={{
                          marginTop: 5,
                          fontSize: 11,
                          color: "#667085",
                        }}
                      >
                        {goalProgress(previewGoal).label} complete
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 23,
                        fontWeight: "800",
                        color: "#684BFF",
                      }}
                    >
                      {goalProgress(previewGoal).progressPercent}%
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 6,
                      marginTop: 8,
                      flexDirection: "row",
                      gap: 3,
                    }}
                  >
                    {previewGoal.steps.map((_step, index) => (
                      <View
                        key={index}
                        style={{
                          flex: 1,
                          height: "100%",
                          borderRadius: 999,
                          backgroundColor: isGoalStepComplete(previewGoal, index)
                            ? "#684BFF"
                            : "#E9ECF3",
                        }}
                      />
                    ))}
                  </View>
                </View>

                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 18,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#ECEEF5",
                    padding: 10,
                    shadowColor: "#26335E",
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.04,
                    shadowRadius: 12,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      marginBottom: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        letterSpacing: 0.65,
                        color: "#718096",
                      }}
                    >
                      GOAL ACTIONS
                    </Text>
                  </View>
                  {previewGoal.steps.length > 0 ? (
                    <View
                      style={{
                        position: "relative",
                        height:
                          GOAL_STEP_ROW_HEIGHT *
                            Math.min(previewGoal.steps.length, VISIBLE_DETAIL_ROWS) +
                          DETAIL_ROW_GAP *
                            (Math.min(previewGoal.steps.length, VISIBLE_DETAIL_ROWS) - 1),
                      }}
                    >
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={
                          previewGoal.steps.length > VISIBLE_DETAIL_ROWS
                        }
                        persistentScrollbar
                        scrollEnabled={previewGoal.steps.length > VISIBLE_DETAIL_ROWS}
                        contentContainerStyle={{ gap: DETAIL_ROW_GAP }}
                      >
                        {previewGoal.steps.map((step, index) => {
                          const completed = isGoalStepComplete(previewGoal, index);
                          const saving = stepSavingKey === `${previewGoal.id}:${index}`;
                          return (
                            <Pressable
                              key={`${index}-${step}`}
                              onPress={() =>
                                requestToggleGoalStep(previewGoal, index)
                              }
                              disabled={
                                (!canUpdate && !canCompleteSteps) ||
                                saving ||
                                previewStatus === "closed"
                              }
                              style={{
                                height: GOAL_STEP_ROW_HEIGHT,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 9,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 12,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: completed ? "#D8F2E2" : "#EEF0F5",
                                backgroundColor: completed ? "#F2FBF6" : "#FFFFFF",
                                opacity: saving ? 0.6 : 1,
                              }}
                            >
                              <View
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: completed ? 10 : 6,
                                  borderWidth: completed ? 0 : 1.5,
                                  borderColor: "#C9D0DC",
                                  backgroundColor: completed ? "#16A34A" : "#FFFFFF",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {saving ? (
                                  <ActivityIndicator size="small" color="#684BFF" />
                                ) : completed ? (
                                  <Check size={13} color="#FFFFFF" strokeWidth={2.8} />
                                ) : null}
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={{
                                    fontSize: 11.5,
                                    fontWeight: "500",
                                    lineHeight: 15,
                                    color: "#111827",
                                  }}
                                  numberOfLines={1}
                                >
                                  {step}
                                </Text>
                                {completed ? (
                                  <Text
                                    style={{
                                      marginTop: 1,
                                      fontSize: 9.5,
                                      color: "#667085",
                                    }}
                                    numberOfLines={1}
                                  >
                                    {previewGoal.completedStepDates?.[index]
                                      ? `Completed on ${formatWhen(previewGoal.completedStepDates[index])}`
                                      : "Completed"}
                                  </Text>
                                ) : null}
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#94A3B8" }}>No actions.</Text>
                  )}
                </View>

                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 18,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#ECEEF5",
                    padding: 10,
                    shadowColor: "#26335E",
                    shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.04,
                    shadowRadius: 12,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        letterSpacing: 0.65,
                        color: "#718096",
                      }}
                    >
                      NOTES
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {canUpdate && previewStatus !== "closed" ? (
                        <Pressable
                          onPress={() => {
                            const goal = previewGoal;
                            setPreviewGoal(null);
                            openAddNote(goal);
                          }}
                          hitSlop={8}
                        >
                          <Text
                            style={{
                              fontSize: 10.5,
                              fontWeight: "800",
                              color: "#684BFF",
                              paddingHorizontal: 9,
                              paddingVertical: 5,
                              borderRadius: 999,
                              backgroundColor: "#F2EEFF",
                            }}
                          >
                            + Add note
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  {previewGoalNotes.length > 0 ? (
                    <View
                      style={{
                        position: "relative",
                        height:
                          GOAL_NOTE_ROW_HEIGHT *
                            Math.min(previewGoalNotes.length, VISIBLE_DETAIL_ROWS) +
                          DETAIL_ROW_GAP *
                            (Math.min(previewGoalNotes.length, VISIBLE_DETAIL_ROWS) - 1),
                      }}
                    >
                      <ScrollView
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={
                          previewGoalNotes.length > VISIBLE_DETAIL_ROWS
                        }
                        persistentScrollbar
                        scrollEnabled={previewGoalNotes.length > VISIBLE_DETAIL_ROWS}
                        contentContainerStyle={{ gap: DETAIL_ROW_GAP }}
                      >
                        {[...previewGoalNotes]
                          .sort(
                            (a, b) =>
                              new Date(b.createdAt).getTime() -
                              new Date(a.createdAt).getTime(),
                          )
                          .map((note) => (
                            <View
                              key={note.id}
                              style={{
                                height: GOAL_NOTE_ROW_HEIGHT,
                                borderRadius: 12,
                                borderWidth: StyleSheet.hairlineWidth,
                                borderColor: "#EEF0F5",
                                backgroundColor: "#FFFFFF",
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={{ fontSize: 11.5, color: "#334155", lineHeight: 15 }}
                                  numberOfLines={1}
                                >
                                  {note.body}
                                </Text>
                                <Text
                                  style={{ fontSize: 9.5, color: "#94A3B8", marginTop: 2 }}
                                  numberOfLines={1}
                                >
                                  {formatNoteWhen(note.createdAt)} ·{" "}
                                  {displayUserName(note.createdBy)}
                                </Text>
                              </View>
                              {canUpdate ? (
                                <Pressable
                                  onPress={() => removeNote(previewGoal.id, note)}
                                  disabled={saving}
                                  hitSlop={8}
                                  accessibilityRole="button"
                                  accessibilityLabel="Delete progress note"
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 7,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "#F5F6F8",
                                    opacity: saving ? 0.5 : 1,
                                  }}
                                >
                                  <Trash2 size={11} color="#111827" strokeWidth={2} />
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                      </ScrollView>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#94A3B8" }}>No progress notes yet.</Text>
                  )}
                </View>

              </ScrollView>

              {showDetailScrollHint ? (
                <Pressable
                  onPress={() =>
                    detailScrollRef.current?.scrollToEnd({ animated: true })
                  }
                  style={{
                    position: "absolute",
                    left: "50%",
                    marginLeft: -20,
                    bottom:
                      (canUpdate && previewStatus !== "closed" ? 154 : 90) +
                      Math.max(0, insets.bottom - 8),
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#E2E6EF",
                    shadowColor: "#1E1B4B",
                    shadowOpacity: 0.16,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 5 },
                    elevation: 6,
                    zIndex: 20,
                  }}
                  accessibilityLabel="Scroll to more goal details"
                >
                  <ArrowDown size={18} color="#684BFF" strokeWidth={2.3} />
                </Pressable>
              ) : null}

              <View
                style={{
                  paddingHorizontal: 14,
                  paddingTop: 6,
                  backgroundColor: "#FFFFFF",
                  transform: [{ translateY: -6 }],
                }}
              >
                <Text
                  style={{
                    marginBottom: 4,
                    marginLeft: 2,
                    fontSize: 10,
                    fontWeight: "800",
                    letterSpacing: 0.65,
                    color: "#718096",
                  }}
                >
                  GOAL DETAILS
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    borderRadius: 16,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: "#E7EAF2",
                    backgroundColor: "#FFFFFF",
                    paddingVertical: 8,
                    shadowColor: "#26335E",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.04,
                    shadowRadius: 10,
                    elevation: 1,
                  }}
                >
                  {[
                    {
                      label: "Created",
                      value: formatWhen(previewGoal.createdAt),
                    },
                    {
                      label: "Due date",
                      value:
                        goalDuePriority(previewGoal)?.dueLabel ?? "Not set",
                    },
                    { label: "Owner", value: memberName },
                  ].map((detail, index) => (
                    <View
                      key={detail.label}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 8,
                        borderLeftWidth: index === 0 ? 0 : 1,
                        borderLeftColor: "#EEF0F5",
                      }}
                    >
                      <View
                        style={{
                          width: 25,
                          height: 25,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "#F0ECFF",
                        }}
                      >
                        {index < 2 ? (
                          <Calendar size={13} color="#684BFF" strokeWidth={2.2} />
                        ) : (
                          <UserRound size={13} color="#684BFF" strokeWidth={2.2} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontSize: 9, fontWeight: "700", color: "#8A96AA" }}
                        >
                          {detail.label}
                        </Text>
                        <Text
                          style={{
                            marginTop: 3,
                            fontSize: 10,
                            fontWeight: "700",
                            color: "#334155",
                          }}
                          numberOfLines={1}
                        >
                          {detail.value}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {canUpdate && previewStatus !== "closed" ? (
                <View
                  style={{
                    flexDirection: "column",
                    gap: 8,
                    paddingHorizontal: 14,
                    paddingTop: 7,
                    paddingBottom:
                      Platform.OS === "android"
                        ? Math.max(40, insets.bottom + 24)
                        : Math.max(8, insets.bottom),
                    backgroundColor: "#FFFFFF",
                  }}
                >
                  {!previewGoalCanComplete ? (
                    <Text
                      style={{
                        textAlign: "center",
                        fontSize: 10.5,
                        lineHeight: 14,
                        fontWeight: "600",
                        color: "#7C8799",
                      }}
                    >
                      Complete {previewGoalRemainingSteps} remaining goal{" "}
                      {previewGoalRemainingSteps === 1 ? "action" : "actions"} to
                      finish this goal.
                    </Text>
                  ) : null}
                  <Pressable
                    onPress={() => {
                      if (!previewGoalCanComplete) return;
                      const goal = previewGoal;
                      setPreviewGoal(null);
                      onMarkComplete(goal);
                    }}
                    disabled={!previewGoalCanComplete}
                    style={{
                      flex: 1,
                      minHeight: 42,
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 7,
                      borderRadius: 13,
                      backgroundColor: previewGoalCanComplete
                        ? "#684BFF"
                        : "#F3F4F7",
                      alignItems: "center",
                      shadowColor: previewGoalCanComplete ? "#4A2DCC" : "#FFFFFF",
                      shadowOffset: { width: 0, height: 5 },
                      shadowOpacity: previewGoalCanComplete ? 0.18 : 0,
                      shadowRadius: 10,
                      elevation: previewGoalCanComplete ? 2 : 0,
                    }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: previewGoalCanComplete
                          ? "#FFFFFF"
                          : "#B7C0CE",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check
                        size={12}
                        color={previewGoalCanComplete ? "#FFFFFF" : "#98A2B3"}
                        strokeWidth={2.5}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color: previewGoalCanComplete ? "#FFFFFF" : "#98A2B3",
                      }}
                    >
                      Mark goal complete
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>
      ) : null}

      <Modal
        visible={!!stepCompletionConfirmation}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (goalCompleteCelebrating) return;
          setGoalCompleteCelebrating(false);
          setStepCompletionConfirmation(null);
        }}
        onShow={() => setGoalCompleteCelebrating(false)}
      >
        <Pressable
          onPress={() => {
            if (goalCompleteCelebrating) return;
            setStepCompletionConfirmation(null);
          }}
          style={{
            flex: 1,
            paddingHorizontal: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(15, 23, 42, 0.5)",
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 360,
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 16,
              borderRadius: 22,
              backgroundColor: "#FFFFFF",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: "#E8E4F8",
              shadowColor: "#1E1B4B",
              shadowOpacity: 0.18,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 14 },
              elevation: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Image
                source={require("@/assets/alenio-icon.png")}
                style={{ width: 28, height: 28, borderRadius: 8 }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "800",
                  letterSpacing: 0.8,
                  color: "#8B7CC8",
                }}
              >
                ALENIO
              </Text>
            </View>

            <GoalCompletionEffect
              celebrating={goalCompleteCelebrating}
              percent={
                stepCompletionConfirmation
                  ? goalProgress(stepCompletionConfirmation.goal).progressPercent
                  : 0
              }
            />

            <Animated.Text
              entering={FadeInDown.duration(280)}
              style={{
                marginTop: 8,
                fontSize: 20,
                lineHeight: 25,
                fontWeight: "800",
                letterSpacing: -0.3,
                color: "#111827",
                textAlign: "center",
              }}
            >
              {goalCompleteCelebrating
                ? "Goal completed"
                : stepCompletionFinishesGoal
                  ? "Complete this goal?"
                  : "Mark action complete?"}
            </Animated.Text>

            {stepCompletionConfirmation ? (
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: "700",
                  color: "#3F4860",
                  textAlign: "center",
                }}
                numberOfLines={2}
              >
                {stepCompletionConfirmation.goal.skill}
              </Text>
            ) : null}

            <Text
              style={{
                marginTop: 10,
                fontSize: 13.5,
                lineHeight: 19,
                fontWeight: "500",
                color: "#667085",
                textAlign: "center",
              }}
            >
              {goalCompleteCelebrating
                ? "Nice work — this goal is moving to Completed."
                : stepCompletionFinishesGoal
                  ? "Every action is done. Complete the goal now, or keep it open."
                  : "This marks the action done on the goal."}
            </Text>

            {!goalCompleteCelebrating ? (
              <View style={{ marginTop: 18, gap: 8 }}>
                <Pressable
                  onPress={() => {
                    const confirmation = stepCompletionConfirmation;
                    if (!confirmation) return;
                    if (stepCompletionFinishesGoal) {
                      setGoalCompleteCelebrating(true);
                      setTimeout(() => {
                        setStepCompletionConfirmation(null);
                        setGoalCompleteCelebrating(false);
                        void toggleGoalStep(
                          confirmation.goal,
                          confirmation.stepIndex,
                        );
                      }, 980);
                      return;
                    }
                    setStepCompletionConfirmation(null);
                    void toggleGoalStep(
                      confirmation.goal,
                      confirmation.stepIndex,
                    );
                  }}
                  style={{
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    backgroundColor: "#6D28D9",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    stepCompletionFinishesGoal
                      ? "Complete goal"
                      : "Mark action complete"
                  }
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "800",
                      color: "#FFFFFF",
                    }}
                  >
                    {stepCompletionFinishesGoal
                      ? "Complete goal"
                      : "Mark complete"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setStepCompletionConfirmation(null)}
                  style={{
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: "#53627A",
                    }}
                  >
                    Not yet
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={updateModalVisible}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: "white",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>Update goal</Text>
            <Pressable onPress={closeModal} hitSlop={12}>
              <X size={22} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
            {modalErr ? <Text style={{ fontSize: 13, color: "#DC2626" }}>{modalErr}</Text> : null}

            <View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 }}>
                Developmental skill
              </Text>
              <TextInput
                value={skill}
                onChangeText={setSkill}
                placeholder="e.g. Conflict resolution"
                editable={canCreate || !!updateGoal}
                style={{
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 15,
                  color: "#0F172A",
                }}
              />
              <Text
                style={{
                  marginTop: 12,
                  marginBottom: 6,
                  fontSize: 13,
                  fontWeight: "600",
                  color: "#334155",
                }}
              >
                Skill description (optional)
              </Text>
              <TextInput
                value={skillDescription}
                onChangeText={setSkillDescription}
                placeholder="Describe what success in this skill looks like"
                multiline
                textAlignVertical="top"
                maxLength={1000}
                style={{
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  lineHeight: 19,
                  color: "#0F172A",
                }}
              />
            </View>

            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>
                  Development Plan Actions
                </Text>
                {canCreate || updateGoal ? (
                  <Pressable onPress={() => setSteps([...steps, ""])}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Add action</Text>
                  </Pressable>
                ) : null}
              </View>
              {steps.map((step, index) => (
                <View key={`step-${index}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={step}
                    onChangeText={(v) => setSteps(steps.map((s, i) => (i === index ? v : s)))}
                    placeholder={`Action ${index + 1}`}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 15,
                      color: "#0F172A",
                    }}
                  />
                  {steps.length > 1 ? (
                    <Pressable
                      onPress={() => setSteps(steps.filter((_, i) => i !== index))}
                      style={{ justifyContent: "center", paddingHorizontal: 8 }}
                    >
                      <Text style={{ color: "#EF4444", fontWeight: "600" }}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            {updateGoal && canAddNotes ? (
              <View>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 8 }}>
                  Progress notes
                </Text>
                {updateGoal.notes.map((note) => (
                  <View key={note.id} style={{ marginBottom: 12 }}>
                    {editingNoteId === note.id ? (
                      <>
                        <TextInput
                          value={editDraft}
                          onChangeText={setEditDraft}
                          multiline
                          style={{
                            borderWidth: 1,
                            borderColor: "#E2E8F0",
                            borderRadius: 10,
                            padding: 12,
                            fontSize: 14,
                            minHeight: 80,
                            color: "#0F172A",
                          }}
                        />
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                          <Pressable onPress={() => saveNoteEdit(updateGoal.id, note.id)}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Save note</Text>
                          </Pressable>
                          <Pressable onPress={() => { setEditingNoteId(null); setEditDraft(""); }}>
                            <Text style={{ fontSize: 13, color: "#64748B" }}>Cancel</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <View style={{ backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                        <Text style={{ fontSize: 13, color: "#334155" }}>{note.body}</Text>
                        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                          <Pressable onPress={() => { setEditingNoteId(note.id); setEditDraft(note.body); }}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: "#4361EE" }}>Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => removeNote(updateGoal.id, note)}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
                {newNotes.map((note, index) => (
                  <View key={`new-${index}`} style={{ marginBottom: 12 }}>
                    <TextInput
                      value={note}
                      onChangeText={(v) => setNewNotes(newNotes.map((n, i) => (i === index ? v : n)))}
                      placeholder="Add a note about progress…"
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor: "#E2E8F0",
                        borderRadius: 10,
                        padding: 12,
                        fontSize: 14,
                        minHeight: 80,
                        color: "#0F172A",
                      }}
                    />
                    <Pressable onPress={() => setNewNotes(newNotes.filter((_, i) => i !== index))} style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: "#EF4444" }}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => setNewNotes([...newNotes, ""])}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Add note</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: "#F1F5F9",
            }}
          >
            <Pressable
              onPress={closeModal}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#64748B" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSaveGoal()}
              disabled={saving}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#4361EE",
                alignItems: "center",
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Text style={{ fontWeight: "700", color: "white" }}>{saving ? "Saving…" : "Save changes"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!noteGoal}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={closeNoteModal}
      >
        <KeyboardAvoidingView
          style={{
            flex: 1,
            backgroundColor: "white",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#F1F5F9",
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>Add progress note</Text>
              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 2 }} numberOfLines={1}>
                {noteGoal?.skill}
              </Text>
            </View>
            <Pressable onPress={closeNoteModal} hitSlop={12}>
              <X size={22} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {noteErr ? <Text style={{ fontSize: 13, color: "#DC2626" }}>{noteErr}</Text> : null}
            <Text style={{ fontSize: 13, color: "#64748B", lineHeight: 18 }}>
              Capture progress, coaching notes, or next steps. This keeps the goal active.
            </Text>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="What progress was made?"
              multiline
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: "#E2E8F0",
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                minHeight: 140,
                color: "#0F172A",
                textAlignVertical: "top",
              }}
              testID="progress-note-input"
            />
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: "#F1F5F9",
            }}
          >
            <Pressable
              onPress={closeNoteModal}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#F1F5F9",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#64748B" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSaveProgressNote()}
              disabled={noteSaving}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: "#4361EE",
                alignItems: "center",
                opacity: noteSaving ? 0.6 : 1,
              }}
              testID="save-progress-note"
            >
              <Text style={{ fontWeight: "700", color: "white" }}>{noteSaving ? "Saving…" : "Save note"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
