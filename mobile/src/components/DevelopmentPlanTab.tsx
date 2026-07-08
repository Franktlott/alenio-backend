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
} from "react-native";
import { toast } from "burnt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, X, Target, ChevronDown, ChevronUp, MoreVertical } from "lucide-react-native";
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
  return (
    <View
      style={{
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        padding: 28,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderStyle: "dashed",
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#EEF2FF",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Target size={28} color="#4361EE" />
      </View>
      <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A", textAlign: "center" }}>
        {error ? "Could not load goals" : hasAnyGoals ? "No active goals yet" : "No goals yet"}
      </Text>
      <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 21, marginTop: 8, maxWidth: 300 }}>
        {error
          ? error
          : canCreate
            ? hasAnyGoals
              ? `Create a new goal for ${memberName}, or reactivate an inactive goal below.`
              : `Set development goals for ${memberName}. Track skills, action steps, and progress over time.`
            : `Development goals for ${memberName} will appear here once they're added.`}
      </Text>
      {!error ? (
        <Text style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", lineHeight: 17, marginTop: 10, maxWidth: 300 }}>
          {DEVELOPMENT_GOAL_ACTIVITY_KEY.summary}
        </Text>
      ) : null}
      {canCreate && onStart && !error ? (
        <Pressable
          onPress={onStart}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#4361EE",
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 12,
            marginTop: 20,
          }}
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
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

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

  const onReopen = async (goal: DevelopmentGoal) => {
    setMenuGoalId(null);
    setStatusSavingId(goal.id);
    try {
      await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "active");
      await loadGoals();
      toast({ title: "Goal reopened", preset: "done" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not reopen", preset: "error" });
    } finally {
      setStatusSavingId(null);
    }
  };

  const onDelete = (goal: DevelopmentGoal) => {
    setMenuGoalId(null);
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

  const renderGoalCard = (goal: DevelopmentGoal) => {
    const status = normalizeDevelopmentGoalStatus(goal.status);
    const isClosed = status === "closed";
    const isInactive = status === "inactive";

    return (
    <View
      key={goal.id}
      style={{
        backgroundColor: "white",
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: isClosed ? "#E2E8F0" : isInactive ? "#FDE68A" : "#C7D2FE",
        opacity: isClosed || isInactive ? 0.9 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Target size={18} color="#4361EE" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: "#0F172A" }}>{goal.skill}</Text>
          <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
            Added {formatWhen(goal.createdAt)}
            {goal.createdBy ? ` · ${displayUserName(goal.createdBy)}` : ""}
          </Text>
        </View>
        {canUpdate ? (
          <Pressable onPress={() => setMenuGoalId(menuGoalId === goal.id ? null : goal.id)} hitSlop={8}>
            <MoreVertical size={18} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      {menuGoalId === goal.id ? (
        <View style={{ marginTop: 10, backgroundColor: "#F8FAFC", borderRadius: 10, overflow: "hidden" }}>
          {!isClosed ? (
            <Pressable
              onPress={() => {
                setMenuGoalId(null);
                openUpdate(goal);
              }}
              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#4361EE" }}>Update</Text>
            </Pressable>
          ) : null}
          {isClosed || isInactive ? (
            <Pressable onPress={() => onReopen(goal)} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#4361EE" }}>
                {isInactive ? "Reactivate goal" : "Reopen goal"}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => onDelete(goal)} style={{ padding: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#EF4444" }}>Delete goal</Text>
          </Pressable>
        </View>
      ) : null}

      {isInactive ? (
        <Text style={{ marginTop: 10, fontSize: 12, color: "#B45309", lineHeight: 18 }}>
          Inactive after {goal.daysSinceActivity ?? 0} days with no updates. Add a progress note to reactivate.
        </Text>
      ) : null}

      {goal.steps.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", marginBottom: 6 }}>
            Steps
          </Text>
          {goal.steps.map((step, i) => (
            <Text key={`${goal.id}-step-${i}`} style={{ fontSize: 13, color: "#334155", marginBottom: 4 }}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      ) : null}

      {goal.notes.length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", marginBottom: 6 }}>
            Notes
          </Text>
          {goal.notes.map((note) => (
            <View key={note.id} style={{ marginBottom: 8, padding: 10, backgroundColor: "#F8FAFC", borderRadius: 8 }}>
              <Text style={{ fontSize: 13, color: "#334155" }}>{note.body}</Text>
              <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                {displayUserName(note.createdBy)} · {formatWhen(note.createdAt)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
        <Text style={{ fontSize: 11, color: "#94A3B8" }}>
          {isClosed
            ? `Closed ${formatWhen(goal.closedAt ?? lastUpdatedAt(goal))}`
            : `Updated ${formatWhen(lastUpdatedAt(goal))}`}
        </Text>
        {canUpdate && !isClosed ? (
          <Pressable
            onPress={() => onMarkComplete(goal)}
            disabled={statusSavingId === goal.id}
            style={{
              backgroundColor: "#F0FDF4",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: "#BBF7D0",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#166534" }}>
              {statusSavingId === goal.id ? "Saving…" : "Mark complete"}
            </Text>
          </Pressable>
        ) : (
          <View
            style={{
              backgroundColor: isClosed ? "#F1F5F9" : isInactive ? "#FFEDD5" : "#DCFCE7",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: isClosed ? "#64748B" : isInactive ? "#C2410C" : "#166534",
              }}
            >
              {goalStatusLabel(status)}
            </Text>
          </View>
        )}
      </View>
    </View>
    );
  };

  const modalVisible = createOpen || !!updateGoal;

  return (
    <View style={{ gap: 16 }}>
      {goals.length > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => void onPrint()}
            disabled={loading || printingPdf}
            style={{
              borderWidth: 1,
              borderColor: "#D8DEE8",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: loading || printingPdf ? 0.55 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>
              {printingPdf ? "Printing…" : "Print"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void onDownloadPdf()}
            disabled={loading || downloadingPdf}
            style={{
              borderWidth: 1,
              borderColor: "#D8DEE8",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: loading || downloadingPdf ? 0.55 : 1,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#334155" }}>
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
                backgroundColor: "#4361EE",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Plus size={16} color="white" />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>New goal</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!loading && activeGoals.length > 0 ? (
        <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 17 }}>
          {DEVELOPMENT_GOAL_ACTIVITY_KEY.summary}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#4361EE" style={{ marginVertical: 24 }} />
      ) : (
        <>
          {activeGoals.length === 0 ? (
            <GrowthEmptyState
              memberName={memberName}
              canCreate={canCreate}
              hasAnyGoals={goals.length > 0}
              error={err}
              onStart={canCreate ? openCreate : undefined}
            />
          ) : (
            <View style={{ gap: 12 }}>{activeGoals.map((g) => renderGoalCard(g))}</View>
          )}

          {inactiveGoals.length > 0 ? (
            <View>
              <Pressable
                onPress={() => setInactiveOpen(!inactiveOpen)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#B45309" }}>
                  Inactive goals ({inactiveGoals.length})
                </Text>
                {inactiveOpen ? <ChevronUp size={18} color="#B45309" /> : <ChevronDown size={18} color="#B45309" />}
              </Pressable>
              {inactiveOpen ? (
                <View style={{ gap: 10, marginTop: 4 }}>
                  {inactiveGoals.map((g) => renderGoalCard(g))}
                </View>
              ) : null}
            </View>
          ) : null}

          {closedGoals.length > 0 ? (
            <View>
              <Pressable
                onPress={() => setClosedOpen(!closedOpen)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B" }}>
                  Closed goals ({closedGoals.length})
                </Text>
                {closedOpen ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
              </Pressable>
              {closedOpen ? (
                <View style={{ gap: 10, marginTop: 4 }}>
                  {closedGoals.map((g) => renderGoalCard(g))}
                </View>
              ) : null}
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
    </View>
  );
}
