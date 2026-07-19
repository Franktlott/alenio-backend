import { useEffect, useMemo, useState } from "react";
import {
  completeWalkCorrectiveAction,
  fetchWalkRun,
} from "../../lib/walks/library-api";
import type { WalkRun, WalkRunSnapshotItem } from "../../lib/walks/types";

type OccurrenceSummary = {
  id: string;
  dueAt: string;
  status: string;
  runId?: string | null;
  template?: { id: string; name: string } | null;
};

type Props = {
  teamId: string;
  occurrence: OccurrenceSummary;
  statusLabel: string;
  onClose: () => void;
  onUpdated?: () => void;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function readingLabel(item: WalkRunSnapshotItem): string {
  const payload =
    item.response?.response && typeof item.response.response === "object"
      ? (item.response.response as Record<string, unknown>)
      : null;
  if (item.type === "TEMPERATURE" && payload && typeof payload.value === "number") {
    const unit = typeof payload.unit === "string" ? payload.unit : "F";
    return `${payload.value}°${unit}`;
  }
  if (payload && typeof payload.value === "string") return payload.value;
  if (payload && typeof payload.answer === "string") return payload.answer;
  if (payload && typeof payload.selected === "string") return payload.selected;
  return "—";
}

function hasAdminOverride(item: WalkRunSnapshotItem): boolean {
  const payload =
    item.response?.response && typeof item.response.response === "object"
      ? (item.response.response as Record<string, unknown>)
      : null;
  return payload?.adminOverride === true;
}

function statusTone(status: string | undefined): string {
  switch (status) {
    case "PASS":
    case "RESOLVED":
      return "pass";
    case "FAIL":
    case "NEEDS_ACTION":
      return "fail";
    case "NOT_STARTED":
    case undefined:
      return "pending";
    default:
      return "neutral";
  }
}

function statusLabelFor(status: string | undefined): string {
  if (!status || status === "NOT_STARTED") return "Not started";
  if (status === "NEEDS_ACTION") return "Needs action";
  if (status === "RESOLVED") return "Resolved";
  return status;
}

export function ExecCenterResultsModal({
  teamId,
  occurrence,
  statusLabel: rowStatusLabel,
  onClose,
  onUpdated,
}: Props) {
  const [run, setRun] = useState<WalkRun | null>(null);
  const [loading, setLoading] = useState(Boolean(occurrence.runId));
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!occurrence.runId) {
      setRun(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchWalkRun(teamId, occurrence.runId)
      .then((data) => {
        if (!cancelled) setRun(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load results");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, occurrence.runId]);

  const items = useMemo(() => {
    return [...(run?.items ?? [])]
      .filter((item) => item.type !== "INSTRUCTION")
      .sort((a, b) => a.position - b.position);
  }, [run]);

  const title = occurrence.template?.name ?? run?.template?.name ?? "Checklist results";
  const canResolveCas = Boolean(run && (run.status === "IN_PROGRESS" || run.status === "COMPLETED"));

  async function resolveCa(itemId: string, actionId: string) {
    if (!run || resolvingId) return;
    setResolvingId(actionId);
    setError(null);
    try {
      const next = await completeWalkCorrectiveAction(teamId, run.id, itemId, actionId, {
        managerResolve: true,
      });
      setRun(next);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve corrective action");
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="exec-results-backdrop" role="presentation" onClick={onClose}>
      <div
        className="exec-results-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exec-results-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="exec-results-head">
          <div>
            <h2 id="exec-results-title">{title}</h2>
            <p>
              Due {formatTime(occurrence.dueAt)}
              {run?.startedByName ? ` · ${run.startedByName}` : ""}
              {run?.completedAt ? ` · Completed ${formatTime(run.completedAt)}` : ""}
            </p>
          </div>
          <div className="exec-results-head-actions">
            <span className={`exec-center-badge ${badgeClass(rowStatusLabel)}`}>{rowStatusLabel}</span>
            <button type="button" className="exec-results-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>

        <div className="exec-results-body">
          {loading ? <p className="exec-results-muted">Loading results…</p> : null}
          {error ? <p className="exec-results-error">{error}</p> : null}
          {!loading && !error && !occurrence.runId ? (
            <p className="exec-results-empty">This checklist has not been started yet.</p>
          ) : null}
          {!loading && !error && occurrence.runId && items.length === 0 ? (
            <p className="exec-results-empty">No item results recorded for this walk.</p>
          ) : null}
          {!loading && items.length > 0 ? (
            <ul className="exec-results-list">
              {items.map((item) => {
                const tone = statusTone(item.response?.status);
                const cas = item.response?.correctiveActions ?? [];
                const completedCas = cas.filter((c) => c.status === "COMPLETED");
                const pendingCas = cas.filter((c) => c.status === "PENDING");
                const override = hasAdminOverride(item);
                return (
                  <li key={item.id} className="exec-results-item">
                    <div className="exec-results-item-main">
                      <div className="exec-results-item-copy">
                        <strong>{item.title}</strong>
                        <span className="exec-results-reading">{readingLabel(item)}</span>
                      </div>
                      <span className={`exec-results-pill exec-results-pill--${tone}`}>
                        {statusLabelFor(item.response?.status)}
                      </span>
                    </div>
                    {override ? (
                      <p className="exec-results-override">Admin override — procedure skipped</p>
                    ) : null}
                    {item.response?.notes?.trim() ? (
                      <p className="exec-results-note">{item.response.notes.trim()}</p>
                    ) : null}
                    {completedCas.length > 0 || pendingCas.length > 0 ? (
                      <div className="exec-results-ca">
                        {completedCas.map((ca) => (
                          <span key={ca.id} className="exec-results-ca-chip exec-results-ca-chip--done">
                            {ca.title || "Corrective action"}
                          </span>
                        ))}
                        {pendingCas.map((ca) => (
                          <span key={ca.id} className="exec-results-ca-row">
                            <span className="exec-results-ca-chip">
                              {ca.title || "Open corrective action"}
                            </span>
                            {canResolveCas ? (
                              <button
                                type="button"
                                className="exec-results-ca-resolve"
                                disabled={resolvingId === ca.id}
                                onClick={() => void resolveCa(item.id, ca.id)}
                              >
                                {resolvingId === ca.id ? "Resolving…" : "Mark resolved"}
                              </button>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <footer className="exec-results-foot">
          <button type="button" className="exec-results-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function badgeClass(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "complete") return "exec-center-badge--complete";
  if (normalized === "overdue") return "exec-center-badge--overdue";
  if (normalized === "open") return "exec-center-badge--open";
  return "exec-center-badge--not-started";
}
