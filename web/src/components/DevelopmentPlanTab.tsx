import { useCallback, useEffect, useState } from "react";
import {
  addDevelopmentGoalNote,
  createDevelopmentGoal,
  fetchDevelopmentGoals,
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

function displayUserName(user: { name: string; email: string } | undefined): string {
  return user?.name?.trim() || user?.email || "Someone";
}

export function DevelopmentPlanTab({ teamId, memberUserId, canCreate, canAddNotes }: Props) {
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteSavingId, setNoteSavingId] = useState<string | null>(null);

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
    setErr(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
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
      setCreateOpen(false);
      resetCreateForm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  };

  const onAddNote = async (goalId: string) => {
    const body = noteDrafts[goalId]?.trim() ?? "";
    if (!body) return;
    setNoteSavingId(goalId);
    setErr(null);
    try {
      const updated = await addDevelopmentGoalNote(teamId, memberUserId, goalId, body);
      setGoals((prev) => prev.map((g) => (g.id === goalId ? updated : g)));
      setNoteDrafts((prev) => ({ ...prev, [goalId]: "" }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add note.");
    } finally {
      setNoteSavingId(null);
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

      {err && !createOpen ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

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
        <ul className="enterprise-dev-plan-goals">
          {goals.map((goal) => (
            <li key={goal.id} className="enterprise-dev-plan-goal">
              <div className="enterprise-dev-plan-goal-head">
                <h4 className="enterprise-dev-plan-skill">{goal.skill}</h4>
                <p className="enterprise-muted enterprise-dev-plan-added">
                  Added {formatWhen(goal.createdAt)}
                  {goal.createdBy ? ` · ${displayUserName(goal.createdBy)}` : ""}
                </p>
              </div>

              {goal.steps.length > 0 ? (
                <div className="enterprise-dev-plan-steps">
                  <p className="enterprise-dev-plan-steps-label">Steps to develop this skill</p>
                  <ol>
                    {goal.steps.map((step, index) => (
                      <li key={`${goal.id}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="enterprise-dev-plan-notes">
                <p className="enterprise-dev-plan-notes-label">Notes</p>
                {goal.notes.length === 0 ? (
                  <p className="enterprise-muted enterprise-dev-plan-notes-empty">No notes yet.</p>
                ) : (
                  <ul className="enterprise-dev-plan-note-list">
                    {goal.notes.map((note) => (
                      <li key={note.id} className="enterprise-dev-plan-note">
                        <p className="enterprise-dev-plan-note-body">{note.body}</p>
                        <p className="enterprise-muted enterprise-dev-plan-note-meta">
                          {displayUserName(note.createdBy)} · {formatWhen(note.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {canAddNotes ? (
                  <div className="enterprise-dev-plan-note-form">
                    <textarea
                      className="auth-input enterprise-dev-plan-note-input"
                      rows={2}
                      placeholder="Add a note about progress…"
                      value={noteDrafts[goal.id] ?? ""}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [goal.id]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="enterprise-dev-plan-note-save"
                      disabled={noteSavingId === goal.id || !(noteDrafts[goal.id]?.trim())}
                      onClick={() => void onAddNote(goal.id)}
                    >
                      {noteSavingId === goal.id ? "Saving…" : "Add note"}
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
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
                onClick={() => setCreateOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="enterprise-dev-plan-modal-body">
              {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

              <label className="enterprise-dev-plan-field-label" htmlFor="dev-plan-skill">
                Developmental skill
              </label>
              <input
                id="dev-plan-skill"
                className="auth-input"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="e.g. Conflict resolution, Time management"
              />

              <div className="enterprise-dev-plan-steps-editor">
                <div className="enterprise-dev-plan-steps-editor-head">
                  <span className="enterprise-dev-plan-field-label">Steps to develop this skill</span>
                  <button
                    type="button"
                    className="enterprise-dev-plan-add-step"
                    onClick={() => setSteps((prev) => [...prev, ""])}
                  >
                    + Add step
                  </button>
                </div>
                <ul className="enterprise-dev-plan-step-inputs">
                  {steps.map((step, index) => (
                    <li key={`step-input-${index}`}>
                      <input
                        className="auth-input"
                        value={step}
                        placeholder={`Step ${index + 1}`}
                        onChange={(e) =>
                          setSteps((prev) => prev.map((s, i) => (i === index ? e.target.value : s)))
                        }
                      />
                      {steps.length > 1 ? (
                        <button
                          type="button"
                          className="enterprise-dev-plan-remove-step"
                          aria-label={`Remove step ${index + 1}`}
                          onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <footer className="enterprise-dev-plan-modal-footer">
              <button
                type="button"
                className="enterprise-dev-plan-modal-cancel"
                disabled={saving}
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-dev-plan-new-btn"
                disabled={saving}
                onClick={() => void onSaveGoal()}
              >
                {saving ? "Saving…" : "Save goal"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
