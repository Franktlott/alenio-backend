import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChecklistKioskApp } from "../../components/checklists/kiosk/ChecklistKioskApp";
import {
  clearKioskProgress,
  loadKioskProgress,
  mergeKioskProgress,
  saveKioskProgress,
} from "../../lib/kiosk-checklist-progress";
import { fetchGoSessionChecklist, submitGoSessionChecklist } from "../../lib/api";
import { getGoSessionToken } from "../../lib/alenio-go-session";
import type { KioskTaskItem, KioskTaskState } from "../../components/checklists/kiosk/checklist-kiosk-types";

export function AlenioGoChecklistPage() {
  const { checklistId = "" } = useParams();
  const navigate = useNavigate();
  const sessionToken = getGoSessionToken();
  const progressHubKey = sessionToken ? `go:${sessionToken}` : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskErrorItemId, setTaskErrorItemId] = useState<string | null>(null);
  const [checklistName, setChecklistName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [items, setItems] = useState<KioskTaskItem[]>([]);
  const [tasks, setTasks] = useState<Record<string, KioskTaskState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const autoSubmitStarted = useRef(false);

  const load = useCallback(async () => {
    if (!sessionToken) {
      navigate("/aleniogo", { replace: true });
      return;
    }
    if (!checklistId) {
      setError("Checklist not found.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTaskError(null);
    setTaskErrorItemId(null);
    setSubmitted(false);
    setTasks({});
    autoSubmitStarted.current = false;
    try {
      const data = await fetchGoSessionChecklist(sessionToken, checklistId);
      setChecklistName(data.checklist.name);
      setTeamName(data.team?.name ?? "Workspace");
      setTeamImage(data.team?.image ?? null);
      setDisplayName(data.displayName);
      const mapped = data.items.map((i) => ({
        id: i.id,
        title: i.title,
        note: i.note ?? null,
        category: i.category ?? null,
        sortOrder: i.sortOrder,
      }));
      setItems(mapped);
      const itemIds = mapped.map((i) => i.id);
      const stored = loadKioskProgress(progressHubKey, checklistId);
      const merged = mergeKioskProgress(itemIds, stored);
      const withDefaultName = Object.fromEntries(
        Object.entries(merged).map(([id, row]) => [
          id,
          { ...row, signerName: row.signerName || data.displayName },
        ]),
      );
      setTasks(withDefaultName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checklist not found.");
    } finally {
      setLoading(false);
    }
  }, [checklistId, navigate, progressHubKey, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!progressHubKey || !checklistId || loading || submitted) return;
    saveKioskProgress(progressHubKey, checklistId, tasks);
  }, [tasks, progressHubKey, checklistId, loading, submitted]);

  const signedCount = useMemo(() => items.filter((i) => tasks[i.id]?.signed).length, [items, tasks]);
  const allSigned = items.length > 0 && signedCount === items.length;

  const signOffTask = (itemId: string) => {
    if (tasks[itemId]?.signed) return;
    const name = (tasks[itemId]?.signerName.trim() || displayName).trim();
    if (!name) {
      setTaskError("Enter your initials or name before signing off.");
      setTaskErrorItemId(itemId);
      return;
    }
    setTaskError(null);
    setTaskErrorItemId(null);
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: true, signerName: name, signedAt: new Date().toISOString() },
    }));
  };

  const unsignTask = (itemId: string) => {
    if (!tasks[itemId]?.signed) return;
    autoSubmitStarted.current = false;
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: false, signerName: prev[itemId]?.signerName ?? displayName, signedAt: null },
    }));
  };

  const submitChecklist = useCallback(async () => {
    if (!sessionToken || !allSigned || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitGoSessionChecklist(sessionToken, checklistId, {
        responses: items.map((i) => ({
          itemId: i.id,
          checked: true,
          signerName: (tasks[i.id]?.signerName.trim() || displayName).trim(),
          signedAt: tasks[i.id]?.signedAt ?? new Date().toISOString(),
        })),
      });
      setSubmitted(true);
      clearKioskProgress(progressHubKey, checklistId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete checklist.");
      autoSubmitStarted.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [allSigned, checklistId, displayName, items, progressHubKey, sessionToken, submitting, tasks]);

  useEffect(() => {
    if (!allSigned || submitted || submitting || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    void submitChecklist();
  }, [allSigned, submitted, submitting, submitChecklist]);

  const updateSignerName = (itemId: string, signerName: string) => {
    setTaskError(null);
    setTaskErrorItemId(null);
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: prev[itemId]?.signed ?? false, signerName, signedAt: prev[itemId]?.signedAt ?? null },
    }));
  };

  return (
    <div className="kiosk-app-page" data-testid="alenio-go-checklist-page">
      <ChecklistKioskApp
        locationName={checklistName}
        teamName={teamName}
        teamImage={teamImage}
        items={items}
        tasks={tasks}
        signedCount={signedCount}
        loading={loading}
        error={error}
        taskError={taskError}
        taskErrorItemId={taskErrorItemId}
        submitting={submitting}
        submitted={submitted}
        backHref="/aleniogo/app"
        onSignerChange={updateSignerName}
        onSignOff={signOffTask}
        onUnsign={unsignTask}
        onRestart={() => {
          if (submitted) navigate("/aleniogo/app", { replace: true });
          else void load();
        }}
      />
    </div>
  );
}
