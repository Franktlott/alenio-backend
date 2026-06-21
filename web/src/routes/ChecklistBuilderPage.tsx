import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChecklistKioskLivePreview } from "../components/checklists/kiosk/ChecklistKioskLivePreview";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  createChecklistLocation,
  fetchChecklistLocations,
  replaceChecklistLocationItems,
  updateChecklistLocation,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";

type TaskDraft = { clientId: string; title: string; note: string };
type EditorView = "edit" | "preview";

function newTaskDraft(): TaskDraft {
  return { clientId: crypto.randomUUID(), title: "", note: "" };
}

function canManage(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

export function ChecklistBuilderPage() {
  const navigate = useNavigate();
  const { checklistId } = useParams();
  const [params] = useSearchParams();
  const teamIdFromUrl = params.get("teamId")?.trim() ?? "";
  const isEdit = !!checklistId;
  const queryClient = useQueryClient();
  const { teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tasks, setTasks] = useState<TaskDraft[]>(() => [newTaskDraft()]);
  const [editorView, setEditorView] = useState<EditorView>("edit");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!teams?.length) return;
    if (teamIdFromUrl && teams.some((t) => t.id === teamIdFromUrl) && teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teams, teamIdFromUrl, selectedTeamId, setSelectedTeamId]);

  useEffect(() => {
    if (!taskMenuId) return;
    const close = () => setTaskMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [taskMenuId]);

  const teamId = teamIdFromUrl || selectedTeamId;
  const selectedTeam = useMemo(() => teams?.find((t) => t.id === teamId) ?? null, [teams, teamId]);
  const manager = canManage(selectedTeam?.role ?? "");

  const listQuery = useQuery({
    queryKey: queryKeys.checklistLocations(teamId),
    queryFn: () => fetchChecklistLocations(teamId),
    enabled: !!teamId && isEdit,
  });

  const existing = useMemo(() => {
    if (!checklistId || !listQuery.data) return null;
    return listQuery.data.locations.find((l) => l.id === checklistId) ?? null;
  }, [checklistId, listQuery.data]);

  useEffect(() => {
    if (!isEdit) {
      setName("");
      setDescription("");
      setTasks([newTaskDraft()]);
      setLoadedId(null);
      setSelectedTaskId(null);
      setEditorView("edit");
      setErr(null);
      return;
    }
    if (!existing || loadedId === existing.id) return;
    const loadedTasks =
      existing.items.length > 0
        ? existing.items.map((i) => ({
            clientId: i.id,
            title: i.title,
            note: i.note ?? "",
          }))
        : [newTaskDraft()];
    setName(existing.name);
    setDescription(existing.description ?? "");
    setTasks(loadedTasks);
    setSelectedTaskId(loadedTasks[0]?.clientId ?? null);
    setLoadedId(existing.id);
    setEditorView("edit");
    setErr(null);
  }, [isEdit, existing, loadedId]);

  useEffect(() => {
    if (selectedTaskId && tasks.some((t) => t.clientId === selectedTaskId)) return;
    setSelectedTaskId(tasks[0]?.clientId ?? null);
  }, [tasks, selectedTaskId]);

  const selectedTask = tasks.find((t) => t.clientId === selectedTaskId) ?? null;

  const previewItems = useMemo(
    () =>
      tasks
        .map((t, idx) => ({
          id: t.clientId,
          title: t.title.trim(),
          note: (t.note ?? "").trim() || null,
          category: null,
          sortOrder: idx,
        }))
        .filter((t) => t.title),
    [tasks],
  );

  const trimmedTasks = tasks
    .map((t) => ({
      title: t.title.trim(),
      note: (t.note ?? "").trim() || null,
    }))
    .filter((t) => t.title);

  const updateTask = (clientId: string, patch: Partial<TaskDraft>) => {
    setTasks((prev) => prev.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row)));
  };

  const addTask = () => {
    const task = newTaskDraft();
    setTasks((prev) => [...prev, task]);
    setSelectedTaskId(task.clientId);
    setEditorView("edit");
  };

  const removeTask = (clientId: string) => {
    setTasks((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.clientId !== clientId);
    });
    if (selectedTaskId === clientId) setSelectedTaskId(null);
    setTaskMenuId(null);
  };

  const duplicateTask = (clientId: string) => {
    setTasks((prev) => {
      const index = prev.findIndex((row) => row.clientId === clientId);
      if (index < 0) return prev;
      const source = prev[index];
      const copy = { ...source, clientId: crypto.randomUUID(), title: source.title ? `${source.title} (copy)` : "" };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
    setTaskMenuId(null);
  };

  const moveTask = (clientId: string, direction: -1 | 1) => {
    setTasks((prev) => {
      const index = prev.findIndex((row) => row.clientId === clientId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
    setTaskMenuId(null);
  };

  const onSave = async () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim() || null;
    if (!trimmedName || !teamId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (isEdit && existing) {
        const metaChanged =
          trimmedName !== existing.name ||
          trimmedDescription !== (existing.description ?? null);
        if (metaChanged) {
          await updateChecklistLocation(teamId, existing.id, {
            name: trimmedName,
            description: trimmedDescription,
          });
        }
        await replaceChecklistLocationItems(teamId, existing.id, trimmedTasks);
      } else {
        await createChecklistLocation(teamId, {
          name: trimmedName,
          description: trimmedDescription,
          items: trimmedTasks,
        });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.checklistLocations(teamId) });
      navigate(`/go${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save checklist.");
    } finally {
      setBusy(false);
    }
  };

  if (!teamId) {
    return (
      <div className="checklist-builder-page">
        <p className="enterprise-muted">Select a workspace to build checklists.</p>
        <Link to="/go" className="enterprise-oneone-templates-back">
          ← Back to Alenio Go
        </Link>
      </div>
    );
  }

  if (!manager) {
    return <Navigate to="/go" replace />;
  }

  if (isEdit && listQuery.isLoading) {
    return (
      <div className="checklist-builder-page">
        <p className="enterprise-muted">Loading checklist…</p>
      </div>
    );
  }

  if (isEdit && listQuery.isError) {
    return (
      <div className="checklist-builder-page">
        <p className="enterprise-form-error" role="alert">
          {listQuery.error instanceof Error ? listQuery.error.message : "Could not load checklist."}
        </p>
        <Link to="/go" className="enterprise-oneone-templates-back">
          ← Back to Alenio Go
        </Link>
      </div>
    );
  }

  if (isEdit && listQuery.isSuccess && !existing) {
    return (
      <div className="checklist-builder-page">
        <p className="enterprise-form-error" role="alert">
          Checklist not found.
        </p>
        <Link to="/go" className="enterprise-oneone-templates-back">
          ← Back to Alenio Go
        </Link>
      </div>
    );
  }

  const backHref = `/go${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;

  return (
    <div className="checklist-builder-page" data-testid="checklist-builder-page">
      <div className="checklist-builder-card">
        <header className="enterprise-oneone-templates-editor-top">
          <div className="enterprise-oneone-templates-editor-top-left">
            <Link to={backHref} className="enterprise-oneone-templates-back">
              ← Back to Alenio Go
            </Link>
            <div className="enterprise-oneone-templates-editor-title-row">
              <h2 className="enterprise-oneone-templates-editor-title">
                {isEdit ? "Edit checklist:" : "New checklist:"}
              </h2>
              <input
                className="enterprise-oneone-templates-editor-title-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checklist name"
                aria-label="Checklist name"
              />
              {!isEdit ? <span className="enterprise-oneone-templates-draft-badge">Draft</span> : null}
            </div>
            {editorView === "edit" ? (
              <input
                className="enterprise-oneone-templates-editor-desc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description (optional)"
                aria-label="Checklist description"
              />
            ) : null}
          </div>
          <div className="enterprise-oneone-templates-editor-top-actions">
            <button
              type="button"
              className={`enterprise-oneone-templates-toolbar-btn${editorView === "preview" ? " enterprise-oneone-templates-toolbar-btn--active" : ""}`}
              onClick={() => setEditorView((v) => (v === "preview" ? "edit" : "preview"))}
            >
              Preview
            </button>
            <button
              type="button"
              className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-save-btn"
              disabled={busy || !name.trim()}
              onClick={() => void onSave()}
            >
              {busy ? "Saving…" : "Save checklist"}
            </button>
          </div>
        </header>

        {err ? (
          <p className="enterprise-form-error enterprise-oneone-templates-editor-error" role="alert">
            {err}
          </p>
        ) : null}

        {editorView === "preview" ? (
          <div className="checklist-builder-preview-pane">
            <p className="enterprise-muted checklist-builder-preview-pane__intro">
              This is how associates will see the checklist on iPad.
            </p>
            {description.trim() ? (
              <p className="enterprise-muted checklist-builder-preview-pane__desc">{description.trim()}</p>
            ) : null}
            <ChecklistKioskLivePreview
              checklistName={name}
              teamName={selectedTeam?.name ?? "Workspace"}
              teamImage={selectedTeam?.image ?? null}
              items={previewItems}
              className="checklist-builder-preview-pane__device"
            />
          </div>
        ) : (
          <div className="enterprise-oneone-templates-editor-split">
            <div className="enterprise-oneone-templates-fields-pane">
              <div className="enterprise-oneone-templates-fields-pane-head">
                <div>
                  <h3 className="enterprise-oneone-templates-fields-pane-title">Checklist tasks</h3>
                  <p className="enterprise-muted enterprise-oneone-templates-fields-pane-sub">
                    Add tasks associates complete and sign off on iPad.
                  </p>
                </div>
                <div className="enterprise-oneone-templates-fields-pane-actions">
                  <button
                    type="button"
                    className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-pane-btn enterprise-oneone-templates-pane-btn--primary"
                    onClick={addTask}
                  >
                    Add task
                  </button>
                </div>
              </div>

              <section className="enterprise-oneone-templates-section-block">
                <div className="enterprise-oneone-templates-section-head">
                  <span className="enterprise-oneone-templates-section-count">
                    {tasks.length} task{tasks.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="enterprise-oneone-templates-question-list">
                  {tasks.map((task, idx) => (
                    <li
                      key={task.clientId}
                      className={`enterprise-oneone-templates-question-row${
                        selectedTaskId === task.clientId ? " enterprise-oneone-templates-question-row--selected" : ""
                      }${taskMenuId === task.clientId ? " enterprise-oneone-templates-question-row--menu-open" : ""}`}
                    >
                      <button type="button" className="enterprise-oneone-templates-question-drag" aria-label="Reorder" tabIndex={-1}>
                        ⠿
                      </button>
                      <button
                        type="button"
                        className="enterprise-oneone-templates-question-main"
                        onClick={() => {
                          setSelectedTaskId(task.clientId);
                          setTaskMenuId(null);
                        }}
                      >
                        <span className="enterprise-oneone-templates-question-num">{idx + 1}</span>
                        <span className="enterprise-oneone-templates-question-label">
                          {task.title.trim() || "Untitled task"}
                        </span>
                        <span className="enterprise-oneone-templates-field-type-badge">Task</span>
                      </button>
                      <div className="enterprise-oneone-templates-question-menu-wrap">
                        <button
                          type="button"
                          className="enterprise-oneone-templates-question-menu-btn"
                          aria-label="Task options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskMenuId((id) => (id === task.clientId ? null : task.clientId));
                          }}
                        >
                          ⋮
                        </button>
                        {taskMenuId === task.clientId ? (
                          <div className="enterprise-oneone-templates-question-menu" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => duplicateTask(task.clientId)}>
                              Duplicate
                            </button>
                            <button type="button" onClick={() => moveTask(task.clientId, -1)}>
                              Move up
                            </button>
                            <button type="button" onClick={() => moveTask(task.clientId, 1)}>
                              Move down
                            </button>
                            <button
                              type="button"
                              className="enterprise-oneone-templates-menu-danger"
                              onClick={() => removeTask(task.clientId)}
                              disabled={tasks.length <= 1}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <button type="button" className="enterprise-oneone-templates-add-section-link" onClick={addTask}>
                + Add task
              </button>
            </div>

            <aside className="enterprise-oneone-templates-field-pane">
              {selectedTask ? (
                <>
                  <div className="enterprise-oneone-templates-field-pane-head">
                    <h3 className="enterprise-oneone-templates-field-pane-title">Edit task</h3>
                    <button
                      type="button"
                      className="enterprise-oneone-templates-field-delete"
                      onClick={() => removeTask(selectedTask.clientId)}
                      disabled={tasks.length <= 1}
                    >
                      Delete task
                    </button>
                  </div>

                  <label className="enterprise-oneone-templates-field-form-label" htmlFor="checklist-task-title">
                    Task name
                  </label>
                  <input
                    id="checklist-task-title"
                    className="auth-input enterprise-oneone-templates-field-form-input"
                    value={selectedTask.title}
                    onChange={(e) => updateTask(selectedTask.clientId, { title: e.target.value })}
                    placeholder="e.g. Wipe down beverage station"
                  />
                  <p className="enterprise-muted enterprise-oneone-templates-field-hint">
                    This is what associates see on the checklist.
                  </p>

                  <label className="enterprise-oneone-templates-field-form-label" htmlFor="checklist-task-note">
                    iPad note <span className="enterprise-muted">(optional)</span>
                  </label>
                  <textarea
                    id="checklist-task-note"
                    className="auth-input enterprise-oneone-templates-field-form-textarea"
                    rows={3}
                    value={selectedTask.note}
                    onChange={(e) => updateTask(selectedTask.clientId, { note: e.target.value })}
                    placeholder="Add guidance or context for this task"
                  />

                  <div className="enterprise-oneone-templates-field-pane-foot">
                    <button type="button" className="enterprise-profile-cancel-btn" onClick={() => setSelectedTaskId(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-done-btn"
                      onClick={() => setSelectedTaskId(null)}
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <div className="enterprise-oneone-templates-field-pane-empty">
                  <p className="enterprise-muted">Select a task from the list to edit its settings.</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
