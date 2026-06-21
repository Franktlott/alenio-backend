import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChecklistKioskApp } from "../components/checklists/kiosk/ChecklistKioskApp";
import type { KioskTaskItem, KioskTaskState } from "../components/checklists/kiosk/checklist-kiosk-types";
import {
  fetchPublicChecklistByHub,
  fetchPublicChecklistByToken,
  submitPublicChecklist,
  submitPublicChecklistLegacy,
} from "../lib/api";

type Props = {
  /** Legacy per-checklist public token (old QR links). */
  legacyToken?: string;
};

export function LocationChecklistKioskPage({ legacyToken: legacyTokenProp }: Props) {
  const { hubToken: hubTokenParam = "", checklistId: checklistIdParam = "" } = useParams();
  const hubToken = legacyTokenProp ?? hubTokenParam;
  const checklistId = checklistIdParam;
  const isLegacy = !!legacyTokenProp;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskErrorItemId, setTaskErrorItemId] = useState<string | null>(null);
  const [checklistName, setChecklistName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [items, setItems] = useState<KioskTaskItem[]>([]);
  const [tasks, setTasks] = useState<Record<string, KioskTaskState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const autoSubmitStarted = useRef(false);

  const load = useCallback(async () => {
    if (!hubToken) {
      setError("Invalid checklist link.");
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
      if (!isLegacy && !checklistId) {
        throw new Error("Checklist not found.");
      }
      const data = isLegacy
        ? await fetchPublicChecklistByToken(hubToken)
        : await fetchPublicChecklistByHub(hubToken, checklistId);
      setChecklistName(data.checklist.name);
      setTeamName(data.team?.name ?? "Workspace");
      setTeamImage(data.team?.image ?? null);
      const mapped = data.items.map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category ?? null,
        sortOrder: i.sortOrder,
      }));
      setItems(mapped);
      setTasks(
        Object.fromEntries(mapped.map((i) => [i.id, { signed: false, signerName: "", signedAt: null }])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checklist not found.");
      setChecklistName("");
      setTeamName("");
      setTeamImage(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [checklistId, hubToken, isLegacy]);

  useEffect(() => {
    void load();
  }, [load]);

  const signedCount = useMemo(
    () => items.filter((i) => tasks[i.id]?.signed).length,
    [items, tasks],
  );
  const allSigned = items.length > 0 && signedCount === items.length;

  const signOffTask = (itemId: string) => {
    if (tasks[itemId]?.signed) return;
    const name = tasks[itemId]?.signerName.trim() ?? "";
    if (!name) {
      setTaskError("Enter your initials or name before signing off.");
      setTaskErrorItemId(itemId);
      return;
    }
    setTaskError(null);
    setTaskErrorItemId(null);
    setError(null);
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: true, signerName: name, signedAt: new Date().toISOString() },
    }));
  };

  const submitChecklist = useCallback(async () => {
    if (!hubToken || !allSigned || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        responses: items.map((i) => ({
          itemId: i.id,
          checked: true,
          signerName: tasks[i.id]?.signerName.trim() ?? "",
          signedAt: tasks[i.id]?.signedAt ?? new Date().toISOString(),
        })),
      };
      if (isLegacy || !checklistId) {
        await submitPublicChecklistLegacy(hubToken, body);
      } else {
        await submitPublicChecklist(hubToken, checklistId, body);
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete checklist.");
      autoSubmitStarted.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [allSigned, checklistId, hubToken, isLegacy, items, submitting, tasks]);

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

  const backHref = isLegacy ? undefined : `/checklist/${hubToken}`;

  return (
    <div className="kiosk-app-page" data-testid="checklist-kiosk-page">
      {backHref ? (
        <div className="kiosk-checklist-back-wrap">
          <Link to={backHref} className="kiosk-checklist-back">
            ← All checklists
          </Link>
        </div>
      ) : null}
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
        onSignerChange={updateSignerName}
        onSignOff={signOffTask}
        onRestart={() => void load()}
      />
    </div>
  );
}
