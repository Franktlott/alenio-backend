import { useCallback, useEffect, useState } from "react";
import {
  addDevelopmentGoalNote,
  createDevelopmentGoal,
  fetchDevelopmentGoals,
  updateDevelopmentGoal,
  type DevelopmentGoal,
} from "../lib/api";

type Props = {
  teamId: string;
  memberUserId: string;
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
  note: string;
  showGoalFields: boolean;
  showNoteField: boolean;
  skillId: string;
  onSkillChange: (value: string) => void;
  onStepsChange: (value: string[]) => void;
  onNoteChange: (value: string) => void;
};

function GoalFormFields({
  skill,
  steps,
  note,
  showGoalFields,
  showNoteField,
  skillId,
  onSkillChange,
  onStepsChange,
  onNoteChange,
}: GoalFormFieldsProps) {
  return (
    <div className="enterprise-dev-plan-form">
      {showGoalFields ? (
        <>
          <div className="enterprise-dev-plan-form-field">
            <label className="enterprise-dev-plan-field-label" htmlFor={skillId}>
              Developmental skill
            </label>
            <input
              id={skillId}
              className="enterprise-dev-plan-input"
              value={skill}
              onChange={(e) => onSkillChange(e.target.value)}
              placeholder="e.g. Conflict resolution, Time management"
            />
          </div>

          <div className="enterprise-dev-plan-form-field">
            <div className="enterprise-dev-plan-steps-editor-head">
              <span className="enterprise-dev-plan-field-label">Steps to develop this skill</span>
              <button
                type="button"
                className="enterprise-dev-plan-add-step"
                onClick={() => onStepsChange([...steps, ""])}
              >
                + Add step
              </button>
            </div>
            <ul className="enterprise-dev-plan-step-inputs">
              {steps.map((step, index) => (
                <li key={`step-input-${index}`} className="enterprise-dev-plan-step-row">
                  <span className="enterprise-dev-plan-step-num">{index + 1}</span>
                  <input
                    className="enterprise-dev-plan-input enterprise-dev-plan-step-input"
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
                      className="enterprise-dev-plan-remove-step"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => onStepsChange(steps.filter((_, i) => i !== index))}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {showNoteField ? (
        <div className="enterprise-dev-plan-form-field">
          <label className="enterprise-dev-plan-field-label" htmlFor={`${skillId}-note`}>
            Progress note
          </label>
          <textarea
            id={`${skillId}-note`}
            className="enterprise-dev-plan-input enterprise-dev-plan-textarea"
            rows={3}
            placeholder="Add a note about progress…"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DevelopmentPlanTab({ teamId, memberUserId, canCreate, canAddNotes }: Props) {
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateGoal, setUpdateGoal] = useState<DevelopmentGoal | null>(null);
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [updateNote, setUpdateNote] = useState("");
  const [saving, setSaving] = useState(false);
  const canUpdate = canCreate || canAddNotes;

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
    setUpdateNote("");
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
    setUpdateNote("");
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
    const trimmedNote = updateNote.trim();

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

    if (!canCreate && canAddNotes && !trimmedNote) {
      setErr("Add a progress note or update the goal.");
      return;
    }

    const goalFieldsChanged =
      trimmedSkill !== updateGoal.skill.trim() ||
      JSON.stringify(trimmedSteps) !== JSON.stringify(updateGoal.steps);

    if (canCreate && goalFieldsChanged === false && !trimmedNote) {
      setErr("Change the goal or add a progress note before saving.");
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

      if (canAddNotes && trimmedNote) {
        updated = await addDevelopmentGoalNote(teamId, memberUserId, updateGoal.id, trimmedNote);
      }

      setGoals((prev) => prev.map((g) => (g.id === updateGoal.id ? updated : g)));
      closeModals();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update goal.");
    } finally {
      setSaving(false);
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
        {canCreate ? (
          <button type="button" className="enterprise-dev-plan-new-btn" onClick={openCreate}>
            New developmental goal
          </button>
        ) : null}
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
              <li key={goal.id} className="enterprise-dev-plan-goal">
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
                      >
                        Update
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="enterprise-dev-plan-kebab"
                      aria-label="Goal options"
                      disabled
                    >
                      ⋮
                    </button>
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
                  <span className="enterprise-dev-plan-status-badge">In progress</span>
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
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeModals}>
          <div
            className="enterprise-modal-sheet enterprise-dev-plan-modal"
            role="dialog"
            aria-label="New developmental goal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="enterprise-dev-plan-modal-head">
              <h3>New developmental goal</h3>
              <button
                type="button"
                className="enterprise-oneone-templates-close"
                aria-label="Close"
                onClick={closeModals}
              >
                ×
              </button>
            </header>

            <div className="enterprise-dev-plan-modal-body">
              {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
              <GoalFormFields
                skill={skill}
                steps={steps}
                note=""
                showGoalFields
                showNoteField={false}
                skillId="dev-plan-skill"
                onSkillChange={setSkill}
                onStepsChange={setSteps}
                onNoteChange={() => {}}
              />
            </div>

            <footer className="enterprise-dev-plan-modal-footer">
              <button
                type="button"
                className="enterprise-dev-plan-modal-cancel"
                disabled={saving}
                onClick={closeModals}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-oneone-templates-primary-btn"
                disabled={saving}
                onClick={() => void onSaveGoal()}
              >
                {saving ? "Saving…" : "Save goal"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {updateGoal ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeModals}>
          <div
            className="enterprise-modal-sheet enterprise-dev-plan-modal"
            role="dialog"
            aria-label="Update developmental goal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="enterprise-dev-plan-modal-head">
              <h3>Update developmental goal</h3>
              <button
                type="button"
                className="enterprise-oneone-templates-close"
                aria-label="Close"
                onClick={closeModals}
              >
                ×
              </button>
            </header>

            <div className="enterprise-dev-plan-modal-body">
              {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
              <GoalFormFields
                skill={skill}
                steps={steps}
                note={updateNote}
                showGoalFields={canCreate}
                showNoteField={canAddNotes}
                skillId="dev-plan-update-skill"
                onSkillChange={setSkill}
                onStepsChange={setSteps}
                onNoteChange={setUpdateNote}
              />
            </div>

            <footer className="enterprise-dev-plan-modal-footer">
              <button
                type="button"
                className="enterprise-dev-plan-modal-cancel"
                disabled={saving}
                onClick={closeModals}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-oneone-templates-primary-btn"
                disabled={saving}
                onClick={() => void onSaveUpdate()}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
