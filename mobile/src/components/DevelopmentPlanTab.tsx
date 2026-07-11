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
} from "react-native";
import { toast } from "burnt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, X, Target, ChevronDown, ChevronUp } from "lucide-react-native";
import {
  addDevelopmentGoalNote,
  createDevelopmentGoal,
  deleteDevelopmentGoal,
  deleteDevelopmentGoalNote,
  fetchDevelopmentGoals,
  setDevelopmentGoalStatus,
  updateDevelopmentGoal,
  updateDevelopmentGoalNote,
  type DevelopmentGoal,
  type DevelopmentGoalNote,
} from "@/lib/member-profile-api";
import { printDevelopmentPlan, downloadDevelopmentPlanPdf } from "@/lib/development-plan-print";
import {
  DEVELOPMENT_GOAL_ACTIVITY_KEY,
  goalStatusLabel,
  normalizeDevelopmentGoalStatus,
} from "@/lib/development-goal-activity";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName?: string | null;
  canCreate: boolean;
  canAddNotes: boolean;
};

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

function GrowthEmptyState({
  memberName,
  canCreate,
  hasAnyGoals,
  error,
  onStart,
}: {
  memberName: string;
  canCreate: boolean;
  hasAnyGoals: boolean;
  error?: string | null;
  onStart?: () => void;
}) {
  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  if (error) {
    return (
      <View
        style={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 16,
          alignItems: "center",
        }}
        testID="growth-empty-state-error"
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Target size={26} color="#4361EE" />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>
          Could not load goals
        </Text>
        <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 20, maxWidth: 300 }}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        alignItems: "center",
      }}
      testID="growth-empty-state"
    >
      <Image
        source={require("@/assets/growth-empty-goals.png")}
        style={{ width: 168, height: 168, marginBottom: 8 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: 25,
          marginBottom: 8,
          maxWidth: 300,
        }}
      >
        {hasAnyGoals ? (
          <>
            Ready for the{"\n"}
            <Text style={{ color: "#7C3AED" }}>next growth step.</Text>
          </>
        ) : (
          <>
            Growth starts with{"\n"}
            <Text style={{ color: "#7C3AED" }}>a clear goal.</Text>
          </>
        )}
      </Text>
      <Text
        style={{
          fontSize: 13.5,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 20,
          maxWidth: 300,
          marginBottom: 10,
        }}
      >
        {canCreate
          ? hasAnyGoals
            ? `Create a new goal for ${firstName}, or reactivate an inactive goal below to keep momentum going.`
            : `Set development goals for ${firstName}. Build skills, track action steps, and celebrate progress over time.`
          : `Development goals for ${firstName} will appear here once a leader adds them.`}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: "#94A3B8",
          textAlign: "center",
          lineHeight: 17,
          maxWidth: 300,
          marginBottom: canCreate && onStart ? 16 : 0,
        }}
      >
        {DEVELOPMENT_GOAL_ACTIVITY_KEY.summary}
      </Text>
      {canCreate && onStart ? (
        <Pressable
          onPress={onStart}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: "#4361EE",
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 12,
            width: "100%",
            maxWidth: 280,
          }}
          testID="growth-empty-start-button"
          accessibilityRole="button"
          accessibilityLabel={hasAnyGoals ? "Add goal" : "Start first goal"}
        >
          <Plus size={16} color="white" />
          <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>
            {hasAnyGoals ? "Add goal" : "Start first goal"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function DevelopmentPlanTab({
  teamId,
  memberUserId,
  memberName,
  managerName = null,
  canCreate,
  canAddNotes,
}: Props) {
  const insets = useSafeAreaInsets();
  const canUpdate = canCreate || canAddNotes;
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [inactiveOpen, setInactiveOpen] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [noteGoal, setNoteGoal] = useState<DevelopmentGoal | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [updateGoal, setUpdateGoal] = useState<DevelopmentGoal | null>(null);
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [newNotes, setNewNotes] = useState<string[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const loadGoals = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchDevelopmentGoals(teamId, memberUserId);
      setGoals(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load development plan.");
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const activeGoals = goals.filter((g) => g.status === "active");
  const inactiveGoals = goals.filter((g) => g.status === "inactive");
  const closedGoals = goals.filter((g) => g.status === "closed");

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

  const openCreate = () => {
    setSkill("");
    setSteps([""]);
    setModalErr(null);
    setCreateOpen(true);
  };

  const openUpdate = (goal: DevelopmentGoal) => {
    setUpdateGoal(goal);
    setSkill(goal.skill);
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
    setNoteGoal(null);
    setNoteDraft("");
    setNoteErr(null);
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
      await addDevelopmentGoalNote(teamId, memberUserId, noteGoal.id, body);
      toast({ title: "Progress note added", preset: "done" });
      closeNoteModal();
      await loadGoals();
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setNoteSaving(false);
    }
  };

  const closeModal = () => {
    setCreateOpen(false);
    setUpdateGoal(null);
    setModalErr(null);
    setNewNotes([]);
    setEditingNoteId(null);
  };

  const onSaveGoal = async () => {
    const trimmedSkill = skill.trim();
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!trimmedSkill) {
      setModalErr("Enter a developmental skill.");
      return;
    }
    setSaving(true);
    setModalErr(null);
    try {
      if (createOpen) {
        await createDevelopmentGoal(teamId, memberUserId, {
          skill: trimmedSkill,
          steps: trimmedSteps,
        });
        toast({ title: "Goal created", preset: "done" });
        closeModal();
      } else if (updateGoal) {
        const skillOrStepsChanged =
          trimmedSkill !== updateGoal.skill ||
          JSON.stringify(trimmedSteps) !== JSON.stringify(updateGoal.steps);
        if (skillOrStepsChanged) {
          await updateDevelopmentGoal(teamId, memberUserId, updateGoal.id, {
            skill: trimmedSkill,
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
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  };

  const onMarkComplete = (goal: DevelopmentGoal) => {
    Alert.alert("Mark complete?", `Close "${goal.skill}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark complete",
        onPress: async () => {
          setStatusSavingId(goal.id);
          try {
            await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "closed");
            await loadGoals();
            toast({ title: "Goal closed", preset: "done" });
          } catch (e) {
            toast({ title: e instanceof Error ? e.message : "Could not update", preset: "error" });
          } finally {
            setStatusSavingId(null);
          }
        },
      },
    ]);
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
    Alert.alert("Delete goal?", `Remove "${goal.skill}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDevelopmentGoal(teamId, memberUserId, goal.id);
            await loadGoals();
            toast({ title: "Goal deleted", preset: "done" });
          } catch (e) {
            toast({ title: e instanceof Error ? e.message : "Could not delete", preset: "error" });
          }
        },
      },
    ]);
  };

  const renderGoalRow = (goal: DevelopmentGoal, index: number) => {
    const status = normalizeDevelopmentGoalStatus(goal.status);
    const isClosed = status === "closed";
    const isInactive = status === "inactive";
    const accent = isClosed ? "#94A3B8" : isInactive ? "#F59E0B" : "#4361EE";
    const latestNote = [...goal.notes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const stepPreview =
      goal.steps.length === 0
        ? null
        : goal.steps.length === 1
          ? goal.steps[0]
          : `${goal.steps[0]} · +${goal.steps.length - 1} more`;

    return (
      <View
        key={goal.id}
        style={{
          flexDirection: "row",
          borderTopWidth: index === 0 ? 0 : 1,
          borderTopColor: "#F1F5F9",
          backgroundColor: "white",
        }}
      >
        <View style={{ width: 3, backgroundColor: accent }} />
        <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 12, paddingRight: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", letterSpacing: -0.2, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {goal.skill}
                </Text>
                <View
                  style={{
                    backgroundColor: isClosed ? "#F1F5F9" : isInactive ? "#FFEDD5" : "#F1F5F9",
                    borderRadius: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "800",
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: isClosed ? "#64748B" : isInactive ? "#C2410C" : "#475569",
                    }}
                  >
                    {goalStatusLabel(status)}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 12, color: "#64748B", marginTop: 3, lineHeight: 16 }} numberOfLines={1}>
                {[
                  isClosed
                    ? `Closed ${formatWhen(goal.closedAt ?? lastUpdatedAt(goal))}`
                    : `Updated ${formatWhen(lastUpdatedAt(goal))}`,
                  goal.createdBy ? displayUserName(goal.createdBy) : null,
                  goal.notes.length > 0 ? `${goal.notes.length} note${goal.notes.length === 1 ? "" : "s"}` : "No notes",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>

              {isInactive ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: "#B45309", lineHeight: 16 }} numberOfLines={2}>
                  Inactive after {goal.daysSinceActivity ?? 0} days. Add a progress note to reactivate.
                </Text>
              ) : null}

              {stepPreview ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 16 }} numberOfLines={1}>
                  Steps: {stepPreview}
                </Text>
              ) : null}

              {latestNote ? (
                <Text style={{ marginTop: 4, fontSize: 12, color: "#64748B", lineHeight: 16 }} numberOfLines={2}>
                  Latest: {latestNote.body}
                </Text>
              ) : null}
            </View>
          </View>

          {canUpdate ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 10,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: "#F8FAFC",
              }}
            >
              {!isClosed ? (
                <Pressable onPress={() => openAddNote(goal)} hitSlop={6} testID={`add-progress-note-${goal.id}`}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>Add note</Text>
                </Pressable>
              ) : null}

              {isClosed || isInactive ? (
                <Pressable
                  onPress={() => onReopen(goal)}
                  disabled={statusSavingId === goal.id}
                  hitSlop={6}
                  testID={`reopen-goal-${goal.id}`}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#4361EE" }}>
                    {statusSavingId === goal.id ? "…" : isInactive ? "Reactivate" : "Reopen"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => onMarkComplete(goal)} disabled={statusSavingId === goal.id} hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#166534" }}>
                    {statusSavingId === goal.id ? "…" : "Complete"}
                  </Text>
                </Pressable>
              )}

              {canCreate && !isClosed ? (
                <Pressable onPress={() => openUpdate(goal)} hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B" }}>Edit</Text>
                </Pressable>
              ) : null}

              {canCreate ? (
                <Pressable onPress={() => onDelete(goal)} hitSlop={6}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#DC2626" }}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderGoalList = (list: DevelopmentGoal[]) => (
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        overflow: "hidden",
      }}
    >
      {list.map((goal, index) => renderGoalRow(goal, index))}
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
            if (refreshed) setUpdateGoal(refreshed);
          } catch (e) {
            toast({ title: e instanceof Error ? e.message : "Could not remove", preset: "error" });
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const modalVisible = createOpen || !!updateGoal;
  const showCenteredEmpty = !loading && activeGoals.length === 0 && inactiveGoals.length === 0 && closedGoals.length === 0;

  return (
    <View style={{ gap: 14, flexGrow: showCenteredEmpty ? 1 : undefined }}>
      {goals.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => void onPrint()}
            disabled={loading || printingPdf}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
              opacity: loading || printingPdf ? 0.55 : 1,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>
              {printingPdf ? "Printing…" : "Print"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onDownloadPdf()}
            disabled={loading || downloadingPdf}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 7,
              opacity: loading || downloadingPdf ? 0.55 : 1,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>
              {downloadingPdf ? "Downloading…" : "Download PDF"}
            </Text>
          </Pressable>
          {canCreate ? (
            <Pressable
              onPress={openCreate}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: "#0F172A",
                borderRadius: 8,
                paddingHorizontal: 11,
                paddingVertical: 7,
              }}
            >
              <Plus size={14} color="white" />
              <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>New goal</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : (
        <>
          {activeGoals.length === 0 ? (
            <View style={showCenteredEmpty ? { flexGrow: 1, justifyContent: "center" } : undefined}>
              <GrowthEmptyState
                memberName={memberName}
                canCreate={canCreate}
                hasAnyGoals={goals.length > 0}
                error={err}
                onStart={canCreate ? openCreate : undefined}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: 1.1,
                  }}
                >
                  Active goals
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8" }}>{activeGoals.length}</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 17, marginTop: -2 }}>
                {DEVELOPMENT_GOAL_ACTIVITY_KEY.summary}
              </Text>
              {renderGoalList(activeGoals)}
            </View>
          )}

          {inactiveGoals.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setInactiveOpen(!inactiveOpen)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#64748B",
                      textTransform: "uppercase",
                      letterSpacing: 1.1,
                    }}
                  >
                    Inactive goals
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8" }}>{inactiveGoals.length}</Text>
                </View>
                {inactiveOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
              </Pressable>
              {inactiveOpen ? renderGoalList(inactiveGoals) : null}
            </View>
          ) : null}

          {closedGoals.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => setClosedOpen(!closedOpen)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#64748B",
                      textTransform: "uppercase",
                      letterSpacing: 1.1,
                    }}
                  >
                    Closed goals
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#94A3B8" }}>{closedGoals.length}</Text>
                </View>
                {closedOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
              </Pressable>
              {closedOpen ? renderGoalList(closedGoals) : null}
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={modalVisible}
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
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>
              {createOpen ? "New developmental goal" : "Update goal"}
            </Text>
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
            </View>

            <View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}>Steps to develop</Text>
                {canCreate || updateGoal ? (
                  <Pressable onPress={() => setSteps([...steps, ""])}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#4361EE" }}>Add step</Text>
                  </Pressable>
                ) : null}
              </View>
              {steps.map((step, index) => (
                <View key={`step-${index}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={step}
                    onChangeText={(v) => setSteps(steps.map((s, i) => (i === index ? v : s)))}
                    placeholder={`Step ${index + 1}`}
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
