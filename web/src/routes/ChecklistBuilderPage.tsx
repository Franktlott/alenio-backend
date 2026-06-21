import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChecklistKioskLivePreview } from "../components/checklists/kiosk/ChecklistKioskLivePreview";
import { ChecklistCardColorPicker } from "../components/checklists/ChecklistCardColorPicker";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  createChecklistLocation,
  fetchChecklistLocations,
  replaceChecklistLocationItems,
  updateChecklistLocation,
} from "../lib/api";
import type { ChecklistCardColorId } from "../lib/checklist-card-colors";
import { queryKeys } from "../lib/query-keys";

type TaskDraft = { clientId: string; title: string; note: string };

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
  const [cardColor, setCardColor] = useState<ChecklistCardColorId>("indigo");
  const [tasks, setTasks] = useState<TaskDraft[]>(() => [newTaskDraft()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!teams?.length) return;
    if (teamIdFromUrl && teams.some((t) => t.id === teamIdFromUrl) && teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teams, teamIdFromUrl, selectedTeamId, setSelectedTeamId]);

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
      setCardColor("indigo");
      setTasks([newTaskDraft()]);
      setLoadedId(null);
      setErr(null);
      return;
    }
    if (!existing || loadedId === existing.id) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setCardColor((existing.cardColor as ChecklistCardColorId | null) ?? "indigo");
    setTasks(
      existing.items.length > 0
        ? existing.items.map((i) => ({
            clientId: i.id,
            title: i.title,
            note: i.note ?? "",
          }))
        : [newTaskDraft()],
    );
    setLoadedId(existing.id);
    setErr(null);
  }, [isEdit, existing, loadedId]);

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
          trimmedDescription !== (existing.description ?? null) ||
          cardColor !== (existing.cardColor ?? "indigo");
        if (metaChanged) {
          await updateChecklistLocation(teamId, existing.id, {
            name: trimmedName,
            description: trimmedDescription,
            cardColor,
          });
        }
        await replaceChecklistLocationItems(teamId, existing.id, trimmedTasks);
      } else {
        await createChecklistLocation(teamId, {
          name: trimmedName,
          description: trimmedDescription,
          cardColor,
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
        <Link to="/go" className="create-task-back">
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
        <Link to="/go" className="create-task-back">
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
        <Link to="/go" className="create-task-back">
          ← Back to Alenio Go
        </Link>
      </div>
    );
  }

  const backHref = `/go${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;

  return (
    <div className="checklist-builder-page" data-testid="checklist-builder-page">
      <header className="checklist-builder-page__topbar">
        <div className="checklist-builder-page__topbar-left">
          <Link to={backHref} className="create-task-back">
            ← Back to Alenio Go
          </Link>
          <div>
            <h1 className="checklist-builder-page__title">{isEdit ? "Edit checklist" : "New checklist"}</h1>
            <p className="checklist-builder-page__sub">Build tasks on the left — preview updates live on the right.</p>
          </div>
        </div>
        <div className="checklist-builder-page__topbar-actions">
          <Link to={backHref} className="checklist-builder-page__cancel">
            Cancel
          </Link>
          <button
            type="button"
            className="go-btn go-btn--primary"
            disabled={busy || !name.trim()}
            onClick={() => void onSave()}
          >
            {busy ? "Saving…" : "Save checklist"}
          </button>
        </div>
      </header>

      <div className="checklist-builder-page__split">
        <section className="checklist-builder-page__editor" aria-label="Checklist builder">
          <div className="checklist-builder-panel">
            <h2 className="checklist-builder-panel__title">Checklist details</h2>
            <label className="enterprise-checklist-editor-label" htmlFor="checklist-builder-name">
              Checklist name
            </label>
            <input
              id="checklist-builder-name"
              className="auth-input enterprise-checklist-editor-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="1st Shift Beverage"
            />

            <label className="enterprise-checklist-editor-label" htmlFor="checklist-builder-description">
              Description
            </label>
            <textarea
              id="checklist-builder-description"
              className="auth-input enterprise-checklist-editor-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this checklist covers and when associates should run it."
              rows={3}
            />

            <ChecklistCardColorPicker value={cardColor} onChange={setCardColor} />
          </div>

          <div className="checklist-builder-panel">
            <div className="enterprise-checklist-editor-items-head">
              <h2 className="checklist-builder-panel__title checklist-builder-panel__title--inline">Tasks</h2>
              <button
                type="button"
                className="enterprise-checklist-editor-add-btn"
                onClick={() => setTasks((prev) => [...prev, newTaskDraft()])}
              >
                + Add task
              </button>
            </div>

            <div className="checklist-builder-tasks">
              <div className="checklist-builder-tasks__head" aria-hidden>
                <span>#</span>
                <span>Task</span>
                <span>Note</span>
                <span />
              </div>
              <ul className="checklist-builder-tasks__list">
                {tasks.map((task, idx) => (
                  <li key={task.clientId}>
                    <span className="checklist-builder-tasks__num">{idx + 1}</span>
                    <input
                      className="auth-input checklist-builder-tasks__input"
                      value={task.title}
                      placeholder={`Task ${idx + 1}`}
                      onChange={(e) =>
                        setTasks((prev) =>
                          prev.map((row) => (row.clientId === task.clientId ? { ...row, title: e.target.value } : row)),
                        )
                      }
                    />
                    <input
                      className="auth-input checklist-builder-tasks__input checklist-builder-tasks__input--note"
                      value={task.note ?? ""}
                      placeholder="Optional note for iPad"
                      onChange={(e) =>
                        setTasks((prev) =>
                          prev.map((row) => (row.clientId === task.clientId ? { ...row, note: e.target.value } : row)),
                        )
                      }
                    />
                    {tasks.length > 1 ? (
                      <button
                        type="button"
                        className="enterprise-checklist-editor-remove"
                        aria-label="Remove task"
                        onClick={() => setTasks((prev) => prev.filter((row) => row.clientId !== task.clientId))}
                      >
                        ×
                      </button>
                    ) : (
                      <span className="checklist-builder-tasks__spacer" aria-hidden />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {err ? (
            <p className="enterprise-form-error" role="alert">
              {err}
            </p>
          ) : null}
        </section>

        <aside className="checklist-builder-page__preview" aria-label="Live Alenio Go preview">
          <ChecklistKioskLivePreview
            checklistName={name}
            teamName={selectedTeam?.name ?? "Workspace"}
            teamImage={selectedTeam?.image ?? null}
            items={previewItems}
          />
        </aside>
      </div>
    </div>
  );
}
