import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
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
  type DevelopmentGoalStatus,
} from "../lib/api";
import { printDevelopmentPlan, downloadDevelopmentPlanPdf } from "../lib/development-plan-print";
import {
  DEVELOPMENT_GOAL_ACTIVITY_KEY,
  goalDaysUntilInactive,
  goalStatusLabel,
  isGoalNearingInactive,
  normalizeDevelopmentGoalStatus,
} from "../lib/development-goal-activity";
import { SenecaGoalModal } from "./seneca/SenecaGoalModal";
import { EnterprisePageLoading } from "./EnterprisePageLoading";

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

function closedDateForGoal(goal: DevelopmentGoal): string {
  return goal.closedAt ?? lastUpdatedAt(goal);
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

function GoalStatusBadge({ status }: { status: DevelopmentGoalStatus | undefined }) {
  const normalized = normalizeDevelopmentGoalStatus(status);
  return (
    <span
      className={`enterprise-dev-plan-status-badge enterprise-dev-plan-status-badge--${normalized}`}
    >
      {goalStatusLabel(normalized)}
    </span>
  );
}

function DevPlanActivityKey() {
  return (
    <details className="enterprise-dev-plan-activity-key">
      <summary>{DEVELOPMENT_GOAL_ACTIVITY_KEY.title}</summary>
      <p>{DEVELOPMENT_GOAL_ACTIVITY_KEY.summary}</p>
      <p>{DEVELOPMENT_GOAL_ACTIVITY_KEY.reminderSummary}</p>
      <p className="enterprise-dev-plan-activity-key-label">Counts as activity</p>
      <ul>
        {DEVELOPMENT_GOAL_ACTIVITY_KEY.activityCountsAs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function GrowIllustration() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#eef2f6" />
      <path d="M24 14v16M24 30l-5-5M24 30l5-5" stroke="#1e3a5f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 34h16" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="18" r="1.5" fill="#94a3b8" />
      <circle cx="31" cy="16" r="1" fill="#94a3b8" />
      <circle cx="28" cy="22" r="1.25" fill="#cbd5e1" />
    </svg>
  );
}

function DevPlanGrowCard({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="enterprise-dev-plan-grow">
      <GrowIllustration />
      <p className="enterprise-dev-plan-grow-title">Keep growing</p>
      <p className="enterprise-dev-plan-grow-copy">
        {canCreate
          ? "Add goals to build skills, track action steps, and capture progress notes."
          : "Goals added by a manager will appear here."}
      </p>
      {canCreate ? (
        <button type="button" className="enterprise-dev-plan-grow-btn" onClick={onCreate}>
          + New developmental goal
        </button>
      ) : null}
    </div>
  );
}

function IconDevHeader() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19h16" />
      <path d="M7 19V9l5-4 5 4v10" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

function IconMetricTarget() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconMetricCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconMetricList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </svg>
  );
}

function IconMetricNotes() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M15 4v3h3M8 12h8M8 16h6" />
    </svg>
  );
}

function IconMetricClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.5" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconWhyStar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3.5 14.4 9l6 .5-4.6 4 1.4 5.8L12 16.8 6.8 19.3 8.2 13.5 3.6 9.5l6-.5L12 3.5Z" />
    </svg>
  );
}

function IconSummaryChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19h16" />
      <path d="M7 16V9M12 16V5M17 16v-4" />
    </svg>
  );
}

function IconSummaryPeople() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19c1-3 2.8-4.5 5.5-4.5S13 16 14 19" />
      <path d="M14.5 14.5c1.6 0 3 .7 4 2.2" />
    </svg>
  );
}

function formatRelativeDaysAgo(iso: string): string {
  try {
    const then = new Date(iso);
    const now = new Date();
    const startToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const startThen = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
    const days = Math.max(0, Math.floor((startToday - startThen) / 86_400_000));
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  } catch {
    return "—";
  }
}

function countNotesThisMonth(goals: DevelopmentGoal[]): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  let count = 0;
  for (const goal of goals) {
    for (const note of goal.notes) {
      try {
        const d = new Date(note.createdAt);
        if (d.getMonth() === month && d.getFullYear() === year) count += 1;
      } catch {
        /* skip */
      }
    }
  }
  return count;
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

export type ProgressNotesEditorHandle = {
  hasUnsavedChanges: () => boolean;
  savePendingChanges: () => Promise<boolean>;
};

type ProgressNotesEditorProps = {
  notes: DevelopmentGoalNote[];
  teamId: string;
  memberUserId: string;
  goalId: string;
  onGoalUpdated: (goal: DevelopmentGoal) => void;
};

const ProgressNotesEditor = forwardRef<ProgressNotesEditorHandle, ProgressNotesEditorProps>(
  function ProgressNotesEditor(
    { notes, teamId, memberUserId, goalId, onGoalUpdated },
    ref,
  ) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newNotes, setNewNotes] = useState<string[]>([]);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const startEdit = (note: DevelopmentGoalNote) => {
    setNoteErr(null);
    setEditingNoteId(note.id);
    setEditDraft(note.body);
  };

  const cancelEdit = () => {
    setEditingNoteId(null);
    setEditDraft("");
  };

  const onSaveExisting = async (noteId: string) => {
    const trimmed = editDraft.trim();
    if (!trimmed) {
      setNoteErr("Progress notes cannot be empty.");
      return;
    }
    setSavingKey(`edit-${noteId}`);
    setNoteErr(null);
    try {
      const updated = await updateDevelopmentGoalNote(
        teamId,
        memberUserId,
        goalId,
        noteId,
        trimmed,
      );
      onGoalUpdated(updated);
      setEditingNoteId(null);
      setEditDraft("");
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSavingKey(null);
    }
  };

  const onRemoveExisting = async (note: DevelopmentGoalNote) => {
    if (!window.confirm("Remove this note? This cannot be undone.")) return;
    setSavingKey(`delete-${note.id}`);
    setNoteErr(null);
    try {
      const updated = await deleteDevelopmentGoalNote(teamId, memberUserId, goalId, note.id);
      onGoalUpdated(updated);
      if (editingNoteId === note.id) cancelEdit();
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : "Could not remove note.");
    } finally {
      setSavingKey(null);
    }
  };

  const onSaveNew = async (index: number) => {
    const trimmed = newNotes[index]?.trim();
    if (!trimmed) {
      setNoteErr("Progress notes cannot be empty.");
      return;
    }
    setSavingKey(`new-${index}`);
    setNoteErr(null);
    try {
      const updated = await addDevelopmentGoalNote(teamId, memberUserId, goalId, trimmed);
      onGoalUpdated(updated);
      setNewNotes((prev) => prev.filter((_, i) => i !== index));
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setSavingKey(null);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      hasUnsavedChanges: () => {
        if (newNotes.some((note) => note.trim())) return true;
        if (!editingNoteId) return false;
        const original = notes.find((note) => note.id === editingNoteId);
        return editDraft.trim() !== (original?.body.trim() ?? "");
      },
      savePendingChanges: async () => {
        if (editingNoteId) {
          const trimmed = editDraft.trim();
          if (!trimmed) {
            setNoteErr("Progress notes cannot be empty.");
            return false;
          }
          const original = notes.find((note) => note.id === editingNoteId);
          if (trimmed !== (original?.body.trim() ?? "")) {
            setSavingKey(`edit-${editingNoteId}`);
            setNoteErr(null);
            try {
              const updated = await updateDevelopmentGoalNote(
                teamId,
                memberUserId,
                goalId,
                editingNoteId,
                trimmed,
              );
              onGoalUpdated(updated);
              setEditingNoteId(null);
              setEditDraft("");
            } catch (e) {
              setNoteErr(e instanceof Error ? e.message : "Could not save note.");
              return false;
            } finally {
              setSavingKey(null);
            }
          } else {
            setEditingNoteId(null);
            setEditDraft("");
          }
        }

        const pendingNewNotes = newNotes.map((note) => note.trim()).filter(Boolean);
        for (let index = 0; index < pendingNewNotes.length; index += 1) {
          const body = pendingNewNotes[index];
          setSavingKey(`new-${index}`);
          setNoteErr(null);
          try {
            const updated = await addDevelopmentGoalNote(teamId, memberUserId, goalId, body);
            onGoalUpdated(updated);
          } catch (e) {
            setNoteErr(e instanceof Error ? e.message : "Could not save note.");
            return false;
          } finally {
            setSavingKey(null);
          }
        }
        setNewNotes([]);
        return true;
      },
    }),
    [editDraft, editingNoteId, goalId, memberUserId, newNotes, notes, onGoalUpdated, teamId],
  );

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
            onClick={() => {
              setNoteErr(null);
              setNewNotes((prev) => [...prev, ""]);
            }}
          >
            Add note
          </button>
        </div>

        {noteErr ? <p className="enterprise-form-error" role="alert">{noteErr}</p> : null}

        {notes.length === 0 && newNotes.length === 0 ? (
          <p className="enterprise-muted enterprise-oneone-followup-empty">No notes yet.</p>
        ) : null}

        {notes.length > 0 ? (
          <ul className="enterprise-dev-plan-note-drafts">
            {notes.map((note) => {
              const isEditing = editingNoteId === note.id;
              const isSaving = savingKey === `edit-${note.id}` || savingKey === `delete-${note.id}`;
              return (
                <li key={note.id} className="enterprise-dev-plan-note-draft">
                  <p className="enterprise-oneone-followup-item-meta">
                    {displayUserName(note.createdBy)} · {formatWhen(note.createdAt)}
                  </p>
                  {isEditing ? (
                    <>
                      <textarea
                        className="auth-input enterprise-oneone-fill-textarea"
                        rows={3}
                        value={editDraft}
                        aria-label={`Edit note from ${formatWhen(note.createdAt)}`}
                        onChange={(e) => setEditDraft(e.target.value)}
                        disabled={isSaving}
                      />
                      <div className="enterprise-dev-plan-note-actions">
                        <button
                          type="button"
                          className="enterprise-oneone-templates-pane-btn"
                          disabled={isSaving}
                          onClick={() => void onSaveExisting(note.id)}
                        >
                          {savingKey === `edit-${note.id}` ? "Saving…" : "Save note"}
                        </button>
                        <button
                          type="button"
                          className="enterprise-oneone-templates-table-action"
                          disabled={isSaving}
                          onClick={cancelEdit}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="enterprise-dev-plan-note-readonly">{note.body}</p>
                      <div className="enterprise-dev-plan-note-actions">
                        <button
                          type="button"
                          className="enterprise-oneone-templates-pane-btn"
                          disabled={Boolean(savingKey)}
                          onClick={() => startEdit(note)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                          disabled={Boolean(savingKey)}
                          onClick={() => void onRemoveExisting(note)}
                        >
                          {savingKey === `delete-${note.id}` ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
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
                    disabled={savingKey === `new-${index}`}
                    onChange={(e) =>
                      setNewNotes(newNotes.map((n, i) => (i === index ? e.target.value : n)))
                    }
                  />
                </div>
                <div className="enterprise-dev-plan-note-actions">
                  <button
                    type="button"
                    className="enterprise-oneone-templates-pane-btn"
                    disabled={savingKey === `new-${index}`}
                    onClick={() => void onSaveNew(index)}
                  >
                    {savingKey === `new-${index}` ? "Saving…" : "Save note"}
                  </button>
                  <button
                    type="button"
                    className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                    disabled={savingKey === `new-${index}`}
                    onClick={() => setNewNotes(newNotes.filter((_, i) => i !== index))}
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
  },
);

type DevPlanGoalModalProps = {
  title: string;
  subtitle?: string;
  err: string | null;
  saving: boolean;
  saveLabel: string;
  showSave?: boolean;
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
  showSave = true,
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
              {showSave ? "Cancel" : "Close"}
            </button>
            {showSave ? (
              <button
                type="button"
                className="enterprise-oneone-templates-primary-btn enterprise-oneone-fill-save"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? "Saving…" : saveLabel}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}

type DevelopmentGoalCardProps = {
  goal: DevelopmentGoal;
  menuGoalId: string | null;
  statusSavingId: string | null;
  canUpdate: boolean;
  onOpenUpdate: (goal: DevelopmentGoal) => void;
  onToggleMenu: (goalId: string, e: MouseEvent) => void;
  onReopen: (goal: DevelopmentGoal) => void;
  onDelete: (goal: DevelopmentGoal) => void;
  onMarkComplete: (goal: DevelopmentGoal) => void;
};

function DevelopmentGoalCard({
  goal,
  menuGoalId,
  statusSavingId,
  canUpdate,
  onOpenUpdate,
  onToggleMenu,
  onReopen,
  onDelete,
  onMarkComplete,
}: DevelopmentGoalCardProps) {
  const status = normalizeDevelopmentGoalStatus(goal.status);
  const isClosed = status === "closed";
  const isInactive = status === "inactive";
  const nearingInactive = isGoalNearingInactive(goal);
  const daysUntilInactive = goalDaysUntilInactive(goal);

  return (
    <li
      className={`enterprise-dev-plan-goal${isClosed ? " enterprise-dev-plan-goal--closed" : ""}${isInactive ? " enterprise-dev-plan-goal--inactive" : ""}${menuGoalId === goal.id ? " enterprise-dev-plan-goal--menu-open" : ""}`}
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
              onClick={() => onOpenUpdate(goal)}
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
                onClick={(e) => onToggleMenu(goal.id, e)}
              >
                ⋮
              </button>
              {menuGoalId === goal.id ? (
                <div className="enterprise-dev-plan-goal-menu" role="menu">
                  {isClosed || isInactive ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReopen(goal);
                      }}
                    >
                      {isInactive ? "Reactivate goal" : "Reopen goal"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="enterprise-dev-plan-goal-menu-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(goal);
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

      {nearingInactive && daysUntilInactive != null ? (
        <p className="enterprise-dev-plan-inactivity-nudge" role="status">
          Seneca reminder: this goal goes inactive in {daysUntilInactive} day
          {daysUntilInactive !== 1 ? "s" : ""} without an update.
        </p>
      ) : null}

      {isInactive ? (
        <p className="enterprise-dev-plan-inactivity-note" role="status">
          Inactive after {goal.daysSinceActivity ?? 0} days with no updates. Add a progress note or
          edit the goal to reactivate.
        </p>
      ) : null}

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
            {isClosed ? (
              <>
                Closed {formatDateOnly(closedDateForGoal(goal))} · Created{" "}
                {formatDateOnly(goal.createdAt)}
              </>
            ) : (
              <>
                Created {formatDateOnly(goal.createdAt)} · Last updated{" "}
                {formatDateOnly(lastUpdatedAt(goal))}
              </>
            )}
          </span>
        </p>
        <div className="enterprise-dev-plan-goal-footer-actions">
          {canUpdate && !isClosed ? (
            <button
              type="button"
              className="enterprise-dev-plan-complete-btn"
              disabled={statusSavingId === goal.id}
              onClick={() => onMarkComplete(goal)}
            >
              {statusSavingId === goal.id ? "Saving…" : "Mark complete"}
            </button>
          ) : null}
          <GoalStatusBadge status={goal.status} />
        </div>
      </footer>
    </li>
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
  const [updateGoalInitial, setUpdateGoalInitial] = useState<DevelopmentGoal | null>(null);
  const notesEditorRef = useRef<ProgressNotesEditorHandle>(null);
  const [skill, setSkill] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [closedSectionOpen, setClosedSectionOpen] = useState(false);
  const [inactiveSectionOpen, setInactiveSectionOpen] = useState(false);
  const [senecaGoalOpen, setSenecaGoalOpen] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [goalFilter, setGoalFilter] = useState<"all" | "active" | "completed">("all");
  const canUpdate = canCreate || canAddNotes;

  const activeGoals = goals.filter((g) => g.status === "active");
  const inactiveGoals = goals.filter((g) => g.status === "inactive");
  const closedGoals = goals.filter((g) => g.status === "closed");
  const openStepCount = activeGoals.reduce((sum, g) => sum + g.steps.length, 0);
  const notesThisMonth = countNotesThisMonth(goals);
  const latestGoalUpdate = goals.reduce<string | null>((latest, goal) => {
    const at = lastUpdatedAt(goal);
    if (!latest) return at;
    return new Date(at) > new Date(latest) ? at : latest;
  }, null);
  const lastUpdatePrimary = latestGoalUpdate ? formatRelativeDaysAgo(latestGoalUpdate) : "No updates yet";
  const lastUpdateHint = latestGoalUpdate ? formatDateOnly(latestGoalUpdate) : "—";
  const topFocus = activeGoals[0]?.skill?.trim() || closedGoals[0]?.skill?.trim() || "Skill growth";
  const completionPct =
    goals.length === 0 ? 0 : Math.round((closedGoals.length / goals.length) * 100);
  const showActiveList = goalFilter !== "completed" && activeGoals.length > 0;
  const showInactiveList = goalFilter === "all" && inactiveGoals.length > 0;
  const showClosedList = goalFilter !== "active" && closedGoals.length > 0;
  const visibleGoalCount =
    (goalFilter === "completed" ? 0 : activeGoals.length) +
    (goalFilter === "all" ? inactiveGoals.length : 0) +
    (goalFilter === "active" ? 0 : closedGoals.length);

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
    setGoals([]);
    void loadGoals();
  }, [loadGoals]);

  const resetCreateForm = () => {
    setSkill("");
    setSteps([""]);
    setErr(null);
  };

  const syncGoalUpdate = (updated: DevelopmentGoal) => {
    setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setUpdateGoal((prev) => (prev?.id === updated.id ? updated : prev));
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
    setUpdateGoalInitial(goal);
    setSkill(goal.skill);
    setSteps(goal.steps.length > 0 ? goal.steps : [""]);
  };

  const closeModals = () => {
    setCreateOpen(false);
    setUpdateGoal(null);
    setUpdateGoalInitial(null);
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

    if (!trimmedSkill) {
      setErr("Enter a developmental skill.");
      return;
    }
    if (trimmedSteps.length === 0) {
      setErr("Add at least one step.");
      return;
    }

    const goalFieldsChanged =
      trimmedSkill !== updateGoal.skill.trim() ||
      JSON.stringify(trimmedSteps) !== JSON.stringify(updateGoal.steps);
    const notesChangedDuringSession =
      JSON.stringify(updateGoal.notes) !== JSON.stringify(updateGoalInitial?.notes ?? []);
    const hasPendingNoteChanges = notesEditorRef.current?.hasUnsavedChanges() ?? false;

    if (!goalFieldsChanged && !notesChangedDuringSession && !hasPendingNoteChanges) {
      closeModals();
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      if (hasPendingNoteChanges) {
        const saved = await notesEditorRef.current?.savePendingChanges();
        if (!saved) return;
      }

      if (goalFieldsChanged) {
        const updated = await updateDevelopmentGoal(teamId, memberUserId, updateGoal.id, {
          skill: trimmedSkill,
          steps: trimmedSteps,
        });
        setGoals((prev) => prev.map((g) => (g.id === updateGoal.id ? updated : g)));
      }

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
      setErr(e instanceof Error ? e.message : "Could not download PDF.");
    } finally {
      setDownloadingPdf(false);
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
    const isInactive = goal.status === "inactive";
    if (
      !window.confirm(
        isInactive
          ? `Reactivate "${goal.skill}"? Add progress updates to keep it active.`
          : `Reopen "${goal.skill}"? It will return to active status.`,
      )
    ) {
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
    <div
      className="enterprise-dev-plan enterprise-checkins-page enterprise-oneone-history--scrollable"
      data-testid="development-plan-tab"
    >
      <div className="enterprise-checkins-section-head">
        <div className="enterprise-checkins-section-head-copy">
          <div className="enterprise-checkins-section-title-row">
            <span className="enterprise-checkins-section-icon" aria-hidden>
              <IconDevHeader />
            </span>
            <h3 className="enterprise-checkins-section-title">Development</h3>
          </div>
          <p className="enterprise-checkins-section-sub">
            Skills to build, action steps, and progress notes over time.
          </p>
        </div>
        <div className="enterprise-dev-page-head-actions">
          <button
            type="button"
            className="enterprise-checkins-export-btn"
            onClick={onPrint}
            disabled={loading || goals.length === 0}
          >
            Print
          </button>
          <button
            type="button"
            className="enterprise-checkins-export-btn"
            onClick={() => void onDownloadPdf()}
            disabled={loading || downloadingPdf || goals.length === 0}
          >
            <IconExport />
            {downloadingPdf ? "Downloading…" : "Export"}
          </button>
          {canCreate ? (
            <>
              <button
                type="button"
                className="enterprise-checkins-export-btn enterprise-dev-page-seneca-btn"
                onClick={() => setSenecaGoalOpen(true)}
              >
                Generate with Seneca
              </button>
              <button type="button" className="enterprise-checkins-new-btn" onClick={openCreate}>
                + New goal
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="enterprise-checkins-metrics" aria-label="Development metrics">
        <div className="enterprise-checkins-metric">
          <span className="enterprise-checkins-metric-icon" aria-hidden>
            <IconMetricTarget />
          </span>
          <span className="enterprise-checkins-metric-label">Active Goals</span>
          <strong className="enterprise-checkins-metric-value">
            {activeGoals.length}
            <span className="enterprise-checkins-metric-suffix"> active</span>
          </strong>
          <span className="enterprise-checkins-metric-hint">
            {inactiveGoals.length > 0 ? `${inactiveGoals.length} inactive` : "In progress"}
          </span>
        </div>
        <div className="enterprise-checkins-metric">
          <span className="enterprise-checkins-metric-icon" aria-hidden>
            <IconMetricCheck />
          </span>
          <span className="enterprise-checkins-metric-label">Completed</span>
          <strong className="enterprise-checkins-metric-value">
            {closedGoals.length}
            <span className="enterprise-checkins-metric-suffix"> closed</span>
          </strong>
          <span className="enterprise-checkins-metric-hint">{completionPct}% complete</span>
        </div>
        <div className="enterprise-checkins-metric">
          <span className="enterprise-checkins-metric-icon" aria-hidden>
            <IconMetricList />
          </span>
          <span className="enterprise-checkins-metric-label">Action Steps</span>
          <strong className="enterprise-checkins-metric-value">{openStepCount}</strong>
          <span className="enterprise-checkins-metric-hint">On active goals</span>
        </div>
        <div className="enterprise-checkins-metric">
          <span className="enterprise-checkins-metric-icon" aria-hidden>
            <IconMetricNotes />
          </span>
          <span className="enterprise-checkins-metric-label">Progress Notes</span>
          <strong className="enterprise-checkins-metric-value">
            {notesThisMonth}
            <span className="enterprise-checkins-metric-suffix"> this month</span>
          </strong>
          <span className="enterprise-checkins-metric-hint">Keep notes current</span>
        </div>
        <div className="enterprise-checkins-metric">
          <span className="enterprise-checkins-metric-icon" aria-hidden>
            <IconMetricClock />
          </span>
          <span className="enterprise-checkins-metric-label">Last Update</span>
          <strong className="enterprise-checkins-metric-value">{lastUpdatePrimary}</strong>
          <span className="enterprise-checkins-metric-hint">{lastUpdateHint}</span>
        </div>
      </div>

      {err && !createOpen && !updateGoal ? <p className="enterprise-form-error" role="alert">{err}</p> : null}

      <div className="enterprise-checkins-main-grid">
        <div className="enterprise-checkins-history-card enterprise-dev-page-goals-card">
          <div className="enterprise-checkins-history-card-head">
            <div>
              <h4 className="enterprise-checkins-history-title">Development goals</h4>
              <p className="enterprise-checkins-history-sub">
                Skills, action steps, and progress notes for {memberName}.
              </p>
            </div>
            <div className="enterprise-checkins-history-controls">
              <select
                className="enterprise-checkins-filter"
                aria-label="Filter goals"
                value={goalFilter}
                onChange={(e) => setGoalFilter(e.target.value as "all" | "active" | "completed")}
              >
                <option value="all">All goals</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
              <DevPlanActivityKey />
            </div>
          </div>

          {loading && goals.length === 0 ? (
            <EnterprisePageLoading
              label="Loading development"
              className="enterprise-profile-section-loading"
              testId="development-loading"
            />
          ) : goals.length === 0 ? (
            <DevPlanGrowCard canCreate={canCreate} onCreate={openCreate} />
          ) : (
            <div className="enterprise-dev-page-goals-scroll">
              {showActiveList ? (
                <ul className="enterprise-dev-plan-goals">
                  {activeGoals.map((goal) => (
                    <DevelopmentGoalCard
                      key={goal.id}
                      goal={goal}
                      menuGoalId={menuGoalId}
                      statusSavingId={statusSavingId}
                      canUpdate={canUpdate}
                      onOpenUpdate={openUpdate}
                      onToggleMenu={(goalId, e) => {
                        e.stopPropagation();
                        setMenuGoalId((current) => (current === goalId ? null : goalId));
                      }}
                      onReopen={(g) => void onReopenGoal(g)}
                      onDelete={(g) => void onDeleteGoal(g)}
                      onMarkComplete={(g) => void onMarkComplete(g)}
                    />
                  ))}
                </ul>
              ) : goalFilter !== "completed" && (closedGoals.length > 0 || inactiveGoals.length > 0) ? (
                <p className="enterprise-muted enterprise-dev-plan-no-active">No active developmental goals.</p>
              ) : null}

              {showInactiveList ? (
                <section className="enterprise-dev-plan-closed enterprise-dev-plan-inactive-section">
                  <button
                    type="button"
                    className="enterprise-dev-plan-closed-toggle"
                    aria-expanded={inactiveSectionOpen}
                    onClick={() => setInactiveSectionOpen((open) => !open)}
                  >
                    <span className="enterprise-dev-plan-closed-toggle-label">
                      Inactive goals
                      <span className="enterprise-dev-plan-closed-count">{inactiveGoals.length}</span>
                    </span>
                    <span className="enterprise-dev-plan-closed-chevron" aria-hidden>
                      {inactiveSectionOpen ? "▾" : "▸"}
                    </span>
                  </button>
                  {inactiveSectionOpen ? (
                    <ul className="enterprise-dev-plan-goals enterprise-dev-plan-goals--inactive">
                      {inactiveGoals.map((goal) => (
                        <DevelopmentGoalCard
                          key={goal.id}
                          goal={goal}
                          menuGoalId={menuGoalId}
                          statusSavingId={statusSavingId}
                          canUpdate={canUpdate}
                          onOpenUpdate={openUpdate}
                          onToggleMenu={(goalId, e) => {
                            e.stopPropagation();
                            setMenuGoalId((current) => (current === goalId ? null : goalId));
                          }}
                          onReopen={(g) => void onReopenGoal(g)}
                          onDelete={(g) => void onDeleteGoal(g)}
                          onMarkComplete={(g) => void onMarkComplete(g)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              {showClosedList ? (
                <section className="enterprise-dev-plan-closed">
                  <button
                    type="button"
                    className="enterprise-dev-plan-closed-toggle"
                    aria-expanded={closedSectionOpen || goalFilter === "completed"}
                    onClick={() => setClosedSectionOpen((open) => !open)}
                  >
                    <span className="enterprise-dev-plan-closed-toggle-label">
                      Closed goals
                      <span className="enterprise-dev-plan-closed-count">{closedGoals.length}</span>
                    </span>
                    <span className="enterprise-dev-plan-closed-chevron" aria-hidden>
                      {closedSectionOpen || goalFilter === "completed" ? "▾" : "▸"}
                    </span>
                  </button>
                  {closedSectionOpen || goalFilter === "completed" ? (
                    <ul className="enterprise-dev-plan-goals enterprise-dev-plan-goals--closed">
                      {closedGoals.map((goal) => (
                        <DevelopmentGoalCard
                          key={goal.id}
                          goal={goal}
                          menuGoalId={menuGoalId}
                          statusSavingId={statusSavingId}
                          canUpdate={canUpdate}
                          onOpenUpdate={openUpdate}
                          onToggleMenu={(goalId, e) => {
                            e.stopPropagation();
                            setMenuGoalId((current) => (current === goalId ? null : goalId));
                          }}
                          onReopen={(g) => void onReopenGoal(g)}
                          onDelete={(g) => void onDeleteGoal(g)}
                          onMarkComplete={(g) => void onMarkComplete(g)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              {canCreate && goalFilter !== "completed" ? (
                <DevPlanGrowCard canCreate onCreate={openCreate} />
              ) : null}
            </div>
          )}

          {goals.length > 0 ? (
            <div className="enterprise-checkins-history-footer">
              Showing {visibleGoalCount} of {goals.length} goals
            </div>
          ) : null}
        </div>

        <aside className="enterprise-checkins-aside">
          <div className="enterprise-checkins-why">
            <div className="enterprise-checkins-aside-title-row">
              <span className="enterprise-checkins-aside-icon" aria-hidden>
                <IconWhyStar />
              </span>
              <h4 className="enterprise-checkins-aside-title">Why develop?</h4>
            </div>
            <ul className="enterprise-checkins-why-list">
              <li>Focus on one skill at a time</li>
              <li>Turn growth into clear action steps</li>
              <li>Capture progress with regular notes</li>
              <li>Build consistency with your manager</li>
            </ul>
          </div>
          <div className="enterprise-checkins-summary">
            <div className="enterprise-checkins-aside-title-row">
              <span className="enterprise-checkins-aside-icon" aria-hidden>
                <IconDevHeader />
              </span>
              <div>
                <h4 className="enterprise-checkins-aside-title">Development summary</h4>
                <p className="enterprise-checkins-summary-sub">Your growth at a glance</p>
              </div>
            </div>
            <ul className="enterprise-checkins-summary-list">
              <li>
                <span className="enterprise-checkins-summary-icon" aria-hidden>
                  <IconSummaryChart />
                </span>
                <span>
                  <strong>{activeGoals.length}</strong> Active goals
                </span>
              </li>
              <li>
                <span className="enterprise-checkins-summary-icon" aria-hidden>
                  <IconMetricClock />
                </span>
                <span>
                  <strong>{completionPct}%</strong> Goals completed
                </span>
              </li>
              <li>
                <span className="enterprise-checkins-summary-icon" aria-hidden>
                  <IconSummaryPeople />
                </span>
                <span>
                  Top focus <strong>{topFocus}</strong>
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </div>

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
          showSave={canCreate}
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
              ref={notesEditorRef}
              notes={updateGoal.notes}
              teamId={teamId}
              memberUserId={memberUserId}
              goalId={updateGoal.id}
              onGoalUpdated={syncGoalUpdate}
            />
          ) : null}
        </DevPlanGoalModal>
      ) : null}

      {senecaGoalOpen ? (
        <SenecaGoalModal
          open={senecaGoalOpen}
          onClose={() => setSenecaGoalOpen(false)}
          memberContext={{ teamId, memberUserId, memberName, managerName }}
          onSaved={() => {
            setSenecaGoalOpen(false);
            void loadGoals();
          }}
        />
      ) : null}
    </div>
  );
}
