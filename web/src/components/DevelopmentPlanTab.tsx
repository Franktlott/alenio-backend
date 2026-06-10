import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  addDevelopmentGoalNote,
  createDevelopmentGoal,
  deleteDevelopmentGoal,
  fetchDevelopmentGoals,
  setDevelopmentGoalStatus,
  updateDevelopmentGoal,
  updateDevelopmentGoalNote,
  type DevelopmentGoal,
  type DevelopmentGoalNote,
  type DevelopmentGoalStatus,
} from "../lib/api";
import { printDevelopmentPlan } from "../lib/development-plan-print";

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  canCreate: boolean;
  canAddNotes: boolean;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
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

function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function displayUserName(user: { name: string; email: string } | undefined): string {
  return user?.name?.trim() || user?.email || "Someone";
}

function lastUpdatedAt(goal: DevelopmentGoal): string {
  if (goal.notes.length === 0) return goal.createdAt;
  return goal.notes.reduce((latest, note) =>
    new Date(note.createdAt) > new Date(latest) ? note.createdAt : latest,
  goal.notes[0].createdAt);
}

function GoalTargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function StepCheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.12" />
      <path
        d="M8 12.5l2.5 2.5L16 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function goalStatusLabel(status: DevelopmentGoalStatus | undefined): string {
  return status === "closed" ? "Closed" : "Active";
}

function GoalStatusBadge({ status }: { status: DevelopmentGoalStatus | undefined }) {
  const normalized = status === "closed" ? "closed" : "active";
  return (
    <span
      className={`enterprise-dev-plan-status-badge enterprise-dev-plan-status-badge--${normalized}`}
    >
      {goalStatusLabel(normalized)}
    </span>
  );
}

function GrowIllustration() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#ede9fe" />
      <path d="M24 14v16M24 30l-5-5M24 30l5-5" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 34h16" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="18" r="1.5" fill="#c4b5fd" />
      <circle cx="31" cy="16" r="1" fill="#c4b5fd" />
      <circle cx="28" cy="22" r="1.25" fill="#ddd6fe" />
    </svg>
  );
}

type GoalFormFieldsProps = {
  skill: string;
  steps: string[];
  skillId: string;
  onSkillChange: (value: string) => void;
  onStepsChange: (value: string[]) => void;
};

function GoalFormFields({ skill, steps, skillId, onSkillChange, onStepsChange }: GoalFormFieldsProps) {
  return (
    <>
      <li className="enterprise-oneone-fill-field">
        <label className="enterprise-oneone-fill-label" htmlFor={skillId}>
          Developmental skill
        </label>
        <input
          id={skillId}
          className="auth-input enterprise-oneone-fill-input"
          value={skill}
          onChange={(e) => onSkillChange(e.target.value)}
          placeholder="e.g. Conflict resolution, Time management"
        />
      </li>

      <li className="enterprise-oneone-fill-field">
        <section className="enterprise-oneone-followup">
          <div className="enterprise-oneone-followup-head">
            <div>
              <h4 className="enterprise-oneone-followup-title">Steps to develop this skill</h4>
              <p className="enterprise-muted enterprise-oneone-followup-sub">
                Action items to build this skill over time.
              </p>
            </div>
            <button
              type="button"
              className="enterprise-oneone-templates-pane-btn"
              onClick={() => onStepsChange([...steps, ""])}
            >
              Add step
            </button>
          </div>
          <ul className="enterprise-oneone-followup-drafts">
            {steps.map((step, index) => (
              <li key={`step-input-${index}`} className="enterprise-dev-plan-step-draft">
                <input
                  className="auth-input enterprise-oneone-followup-input"
                  value={step}
                  placeholder={`Step ${index + 1}`}
                  aria-label={`Step ${index + 1}`}
                  onChange={(e) =>
                    onStepsChange(steps.map((s, i) => (i === index ? e.target.value : s)))
                  }
                />
                {steps.length > 1 ? (
                  <button
                    type="button"
                    className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                    onClick={() => onStepsChange(steps.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </li>
    </>
  );
}

type ProgressNotesEditorProps = {
  existingNotes: DevelopmentGoalNote[];
  existingEdits: Record<string, string>;
  newNotes: string[];
  onExistingChange: (noteId: string, body: string) => void;
  onNewNotesChange: (notes: string[]) => void;
};

function ProgressNotesEditor({
  existingNotes,
  existingEdits,
  newNotes,
  onExistingChange,
  onNewNotesChange,
}: ProgressNotesEditorProps) {
  return (
    <li className="enterprise-oneone-fill-field">
      <section className="enterprise-oneone-followup">
        <div className="enterprise-oneone-followup-head">
          <div>
            <h4 className="enterprise-oneone-followup-title">Progress notes</h4>
            <p className="enterprise-muted enterprise-oneone-followup-sub">
              Track updates and reflections over time.
            </p>
          </div>
          <button
            type="button"
            className="enterprise-oneone-templates-pane-btn"
            onClick={() => onNewNotesChange([...newNotes, ""])}
          >
            Add note
          </button>
        </div>

        {existingNotes.length === 0 && newNotes.length === 0 ? (
          <p className="enterprise-muted enterprise-oneone-followup-empty">No notes yet.</p>
        ) : null}

        {existingNotes.length > 0 ? (
          <ul className="enterprise-dev-plan-note-drafts">
            {existingNotes.map((note) => (
              <li key={note.id} className="enterprise-dev-plan-note-draft">
                <p className="enterprise-oneone-followup-item-meta">
                  {displayUserName(note.createdBy)} · {formatWhen(note.createdAt)}
                </p>
                <textarea
                  className="auth-input enterprise-oneone-fill-textarea"
                  rows={3}
                  value={existingEdits[note.id] ?? note.body}
                  aria-label={`Edit note from ${formatWhen(note.createdAt)}`}
                  onChange={(e) => onExistingChange(note.id, e.target.value)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {newNotes.length > 0 ? (
          <ul className="enterprise-dev-plan-note-drafts enterprise-dev-plan-note-drafts--new">
            {newNotes.map((note, index) => (
              <li key={`new-note-${index}`} className="enterprise-dev-plan-note-draft">
                <p className="enterprise-oneone-followup-item-meta">New note</p>
                <div className="enterprise-dev-plan-step-draft">
                  <textarea
                    className="auth-input enterprise-oneone-fill-textarea"
                    rows={3}
                    placeholder="Add a note about progress…"
                    value={note}
                    aria-label={`New note ${index + 1}`}
                    onChange={(e) =>
                      onNewNotesChange(newNotes.map((n, i) => (i === index ? e.target.value : n)))
                    }
                  />
                  <button
                    type="button"
                    className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                    onClick={() => onNewNotesChange(newNotes.filter((_, i) => i !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </li>
  );
}

type DevPlanGoalModalProps = {
  title: string;
  subtitle?: string;
  err: string | null;
  saving: boolean;
  saveLabel: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
};

function DevPlanGoalModal({
  title,
  subtitle,
  err,
  saving,
  saveLabel,
  onClose,
  onSave,
  children,
}: DevPlanGoalModalProps) {
  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-sheet enterprise-oneone-preview-modal enterprise-dev-plan-goal-modal"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="enterprise-oneone-preview-header">
          <div className="enterprise-oneone-preview-header-text">
            <p className="enterprise-oneone-templates-kicker">Development plan</p>
            <h2 className="enterprise-oneone-preview-title">{title}</h2>
            {subtitle ? <p className="enterprise-oneone-preview-meta">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="enterprise-oneone-templates-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="enterprise-oneone-preview-body">
          {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
          <ul className="enterprise-oneone-fill-fields">{children}</ul>
        </div>

        <footer className="enterprise-dev-plan-modal-foot">
          <div className="enterprise-oneone-fill-actions">
            <button
              type="button"
              className="enterprise-profile-cancel-btn"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="enterprise-oneone-templates-primary-btn enterprise-oneone-fill-save"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? "Saving…" : saveLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function DevelopmentPlanTab({
  teamId,
  memberUserId,
  memberName,
  managerName,
  canCreate,
  canAddNotes,
}: Props) {
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateGoal, setUpdateGoal] = useState<DevelopmentGoal | null>(null);
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [existingNoteEdits, setExistingNoteEdits] = useState<Record<string, string>>({});
  const [newNotes, setNewNotes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const canUpdate = canCreate || canAddNotes;

  useEffect(() => {
    if (!menuGoalId) return;
    const close = () => setMenuGoalId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuGoalId]);

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
  }, [teamId, memberUserId]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const resetCreateForm = () => {
    setSkill("");
    setSteps([""]);
    setExistingNoteEdits({});
    setNewNotes([]);
    setErr(null);
  };

  const openCreate = () => {
    setUpdateGoal(null);
    resetCreateForm();
    setCreateOpen(true);
  };

  const openUpdate = (goal: DevelopmentGoal) => {
    setCreateOpen(false);
    setErr(null);
    setUpdateGoal(goal);
    setSkill(goal.skill);
    setSteps(goal.steps.length > 0 ? goal.steps : [""]);
    setExistingNoteEdits(Object.fromEntries(goal.notes.map((note) => [note.id, note.body])));
    setNewNotes([]);
  };

  const closeModals = () => {
    setCreateOpen(false);
    setUpdateGoal(null);
    resetCreateForm();
  };

  const onSaveGoal = async () => {
    const trimmedSkill = skill.trim();
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (!trimmedSkill) {
      setErr("Enter a developmental skill.");
      return;
    }
    if (trimmedSteps.length === 0) {
      setErr("Add at least one step.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await createDevelopmentGoal(teamId, memberUserId, {
        skill: trimmedSkill,
        steps: trimmedSteps,
      });
      setGoals((prev) => [created, ...prev]);
      closeModals();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveUpdate = async () => {
    if (!updateGoal) return;

    const trimmedSkill = skill.trim();
    const trimmedSteps = steps.map((s) => s.trim()).filter(Boolean);
    const trimmedNewNotes = newNotes.map((n) => n.trim()).filter(Boolean);

    if (canCreate) {
      if (!trimmedSkill) {
        setErr("Enter a developmental skill.");
        return;
      }
      if (trimmedSteps.length === 0) {
        setErr("Add at least one step.");
        return;
      }
    }

    const emptyExistingNote = updateGoal.notes.find(
      (note) => !(existingNoteEdits[note.id]?.trim()),
    );
    if (emptyExistingNote) {
      setErr("Progress notes cannot be empty.");
      return;
    }

    const changedExistingNotes = updateGoal.notes.filter(
      (note) => (existingNoteEdits[note.id]?.trim() ?? "") !== note.body.trim(),
    );

    const goalFieldsChanged =
      trimmedSkill !== updateGoal.skill.trim() ||
      JSON.stringify(trimmedSteps) !== JSON.stringify(updateGoal.steps);

    const hasNoteChanges = changedExistingNotes.length > 0 || trimmedNewNotes.length > 0;

    if (!goalFieldsChanged && !hasNoteChanges) {
      setErr("Change the goal, update a note, or add a new note before saving.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      let updated = updateGoal;

      if (canCreate && goalFieldsChanged) {
        updated = await updateDevelopmentGoal(teamId, memberUserId, updateGoal.id, {
          skill: trimmedSkill,
          steps: trimmedSteps,
        });
      }

      if (canAddNotes) {
        for (const note of changedExistingNotes) {
          updated = await updateDevelopmentGoalNote(
            teamId,
            memberUserId,
            updateGoal.id,
            note.id,
            existingNoteEdits[note.id].trim(),
          );
        }
        for (const body of trimmedNewNotes) {
          updated = await addDevelopmentGoalNote(teamId, memberUserId, updateGoal.id, body);
        }
      }

      setGoals((prev) => prev.map((g) => (g.id === updateGoal.id ? updated : g)));
      closeModals();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update goal.");
    } finally {
      setSaving(false);
    }
  };

  const onPrint = () => {
    try {
      printDevelopmentPlan({
        goals,
        memberName,
        managerName,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open print view.");
    }
  };

  const onMarkComplete = async (goal: DevelopmentGoal) => {
    if (
      !window.confirm(
        `Mark "${goal.skill}" as complete? The goal will move to closed status.`,
      )
    ) {
      return;
    }
    setStatusSavingId(goal.id);
    setMenuGoalId(null);
    setErr(null);
    try {
      const updated = await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "closed");
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not mark goal complete.");
    } finally {
      setStatusSavingId(null);
    }
  };

  const onReopenGoal = async (goal: DevelopmentGoal) => {
    if (!window.confirm(`Reopen "${goal.skill}"? It will return to active status.`)) {
      return;
    }
    setStatusSavingId(goal.id);
    setMenuGoalId(null);
    setErr(null);
    try {
      const updated = await setDevelopmentGoalStatus(teamId, memberUserId, goal.id, "active");
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reopen goal.");
    } finally {
      setStatusSavingId(null);
    }
  };

  const onDeleteGoal = async (goal: DevelopmentGoal) => {
    if (
      !window.confirm(
        `Delete "${goal.skill}"? This removes the goal and all progress notes. This cannot be undone.`,
      )
    ) {
      return;
    }
    setStatusSavingId(goal.id);
    setMenuGoalId(null);
    setErr(null);
    if (updateGoal?.id === goal.id) {
      closeModals();
    }
    try {
      await deleteDevelopmentGoal(teamId, memberUserId, goal.id);
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete goal.");
    } finally {
      setStatusSavingId(null);
    }
  };

  return (
    <div className="enterprise-dev-plan" data-testid="development-plan-tab">
      <div className="enterprise-dev-plan-head">
        <div>
          <h3 className="enterprise-team-profile-section-title">Development plan</h3>
          <p className="enterprise-muted enterprise-dev-plan-sub">
            Skills to build, action steps, and progress notes over time.
          </p>
        </div>
        <div className="enterprise-dev-plan-head-actions">
          <button
            type="button"
            className="enterprise-dev-plan-print-btn"
            onClick={onPrint}
            disabled={loading}
          >
            Print / PDF
          </button>
          {canCreate ? (
            <button type="button" className="enterprise-dev-plan-new-btn" onClick={openCreate}>
              New developmental goal
            </button>
          ) : null}
        </div>
      </div>

      {err && !createOpen && !updateGoal ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

      {loading ? (
        <p className="enterprise-muted">Loading development plan…</p>
      ) : goals.length === 0 ? (
        <div className="enterprise-dev-plan-empty">
          <p className="enterprise-dev-plan-empty-title">No developmental goals yet</p>
          <p className="enterprise-muted">
            {canCreate
              ? "Add a skill and steps to start tracking growth."
              : "Goals added by a manager will appear here."}
          </p>
        </div>
      ) : (
        <>
          <ul className="enterprise-dev-plan-goals">
            {goals.map((goal) => (
              <li
                key={goal.id}
                className={`enterprise-dev-plan-goal${goal.status === "closed" ? " enterprise-dev-plan-goal--closed" : ""}${menuGoalId === goal.id ? " enterprise-dev-plan-goal--menu-open" : ""}`}
              >
                <header className="enterprise-dev-plan-goal-top">
                  <span className="enterprise-dev-plan-goal-icon">
                    <GoalTargetIcon />
                  </span>
                  <div className="enterprise-dev-plan-goal-title-block">
                    <h4 className="enterprise-dev-plan-skill">{goal.skill}</h4>
                    <p className="enterprise-dev-plan-added">
                      Added {formatWhen(goal.createdAt)}
                      {goal.createdBy ? ` · ${displayUserName(goal.createdBy)}` : ""}
                    </p>
                  </div>
                  <div className="enterprise-dev-plan-goal-actions">
                    {canUpdate ? (
                      <button
                        type="button"
                        className="enterprise-dev-plan-update-btn"
                        onClick={() => openUpdate(goal)}
                        disabled={statusSavingId === goal.id}
                      >
                        Update
                      </button>
                    ) : null}
                    {canUpdate ? (
                      <div className="enterprise-dev-plan-goal-menu-wrap">
                        <button
                          type="button"
                          className="enterprise-dev-plan-kebab"
                          aria-label="Goal options"
                          aria-expanded={menuGoalId === goal.id}
                          disabled={statusSavingId === goal.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuGoalId((current) => (current === goal.id ? null : goal.id));
                          }}
                        >
                          ⋮
                        </button>
                        {menuGoalId === goal.id ? (
                          <div className="enterprise-dev-plan-goal-menu" role="menu">
                            {goal.status === "closed" ? (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void onReopenGoal(goal);
                                }}
                              >
                                Reopen goal
                              </button>
                            ) : null}
                            <button
                              type="button"
                              role="menuitem"
                              className="enterprise-dev-plan-goal-menu-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                void onDeleteGoal(goal);
                              }}
                            >
                              Delete goal
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </header>

                {goal.steps.length > 0 ? (
                  <section className="enterprise-dev-plan-goal-section">
                    <p className="enterprise-dev-plan-section-label">Steps to develop this skill</p>
                    <ul className="enterprise-dev-plan-step-list">
                      {goal.steps.map((step, index) => (
                        <li key={`${goal.id}-step-${index}`}>
                          <span className="enterprise-dev-plan-step-check">
                            <StepCheckIcon />
                          </span>
                          <span>
                            {index + 1}. {step}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="enterprise-dev-plan-goal-section">
                  <p className="enterprise-dev-plan-section-label">Notes</p>
                  {goal.notes.length === 0 ? (
                    <p className="enterprise-dev-plan-notes-empty">No notes yet.</p>
                  ) : (
                    <ul className="enterprise-dev-plan-note-list">
                      {goal.notes.map((note) => (
                        <li key={note.id} className="enterprise-dev-plan-note">
                          <p className="enterprise-dev-plan-note-body">{note.body}</p>
                          <p className="enterprise-dev-plan-note-meta">
                            {displayUserName(note.createdBy)} · {formatWhen(note.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <footer className="enterprise-dev-plan-goal-footer">
                  <p className="enterprise-dev-plan-goal-dates">
                    <CalendarIcon />
                    <span>
                      Created {formatDateOnly(goal.createdAt)} · Last updated{" "}
                      {formatDateOnly(lastUpdatedAt(goal))}
                    </span>
                  </p>
                  <div className="enterprise-dev-plan-goal-footer-actions">
                    {canUpdate && goal.status !== "closed" ? (
                      <button
                        type="button"
                        className="enterprise-dev-plan-complete-btn"
                        disabled={statusSavingId === goal.id}
                        onClick={() => void onMarkComplete(goal)}
                      >
                        {statusSavingId === goal.id ? "Saving…" : "Mark complete"}
                      </button>
                    ) : null}
                    <GoalStatusBadge status={goal.status} />
                  </div>
                </footer>
              </li>
            ))}
          </ul>

          {canCreate ? (
            <div className="enterprise-dev-plan-grow">
              <GrowIllustration />
              <p className="enterprise-dev-plan-grow-title">Keep growing</p>
              <p className="enterprise-dev-plan-grow-copy">
                Add more goals to continue building your skills and reach your potential.
              </p>
              <button type="button" className="enterprise-dev-plan-grow-btn" onClick={openCreate}>
                New developmental goal
              </button>
            </div>
          ) : null}
        </>
      )}

      {createOpen ? (
        <DevPlanGoalModal
          title="New developmental goal"
          err={err}
          saving={saving}
          saveLabel="Save goal"
          onClose={closeModals}
          onSave={() => void onSaveGoal()}
        >
          <GoalFormFields
            skill={skill}
            steps={steps}
            skillId="dev-plan-skill"
            onSkillChange={setSkill}
            onStepsChange={setSteps}
          />
        </DevPlanGoalModal>
      ) : null}

      {updateGoal ? (
        <DevPlanGoalModal
          title="Update developmental goal"
          subtitle={updateGoal.skill}
          err={err}
          saving={saving}
          saveLabel="Save changes"
          onClose={closeModals}
          onSave={() => void onSaveUpdate()}
        >
          {canCreate ? (
            <GoalFormFields
              skill={skill}
              steps={steps}
              skillId="dev-plan-update-skill"
              onSkillChange={setSkill}
              onStepsChange={setSteps}
            />
          ) : null}
          {canAddNotes ? (
            <ProgressNotesEditor
              existingNotes={updateGoal.notes}
              existingEdits={existingNoteEdits}
              newNotes={newNotes}
              onExistingChange={(noteId, body) =>
                setExistingNoteEdits((prev) => ({ ...prev, [noteId]: body }))
              }
              onNewNotesChange={setNewNotes}
            />
          ) : null}
        </DevPlanGoalModal>
      ) : null}
    </div>
  );
}
