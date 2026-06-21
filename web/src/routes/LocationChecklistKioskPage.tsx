import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchPublicChecklistByToken, submitPublicChecklist } from "../lib/api";

type TaskState = {
  signed: boolean;
  signerName: string;
};

export function LocationChecklistKioskPage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [items, setItems] = useState<{ id: string; title: string; sortOrder: number }[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const autoSubmitStarted = useRef(false);

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    setError(null);
    setSubmitted(false);
    setTasks({});
    autoSubmitStarted.current = false;
    try {
      const data = await fetchPublicChecklistByToken(tok);
      setLocationName(data.location.name);
      setTeamName(data.team?.name ?? "Workspace");
      setTeamImage(data.team?.image ?? null);
      setItems(data.items);
      setTasks(
        Object.fromEntries(data.items.map((i) => [i.id, { signed: false, signerName: "" }])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checklist not found.");
      setLocationName("");
      setTeamName("");
      setTeamImage(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setError("Invalid checklist link.");
      setLoading(false);
      return;
    }
    void load(token);
  }, [token, load]);

  const signedCount = useMemo(
    () => items.filter((i) => tasks[i.id]?.signed).length,
    [items, tasks],
  );
  const allSigned = items.length > 0 && signedCount === items.length;
  const progressPct = items.length > 0 ? Math.round((signedCount / items.length) * 100) : 0;

  const signOffTask = (itemId: string) => {
    const name = tasks[itemId]?.signerName.trim() ?? "";
    if (!name) {
      setError("Enter your name before signing off this task.");
      return;
    }
    setError(null);
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: true, signerName: name },
    }));
  };

  const submitChecklist = useCallback(async () => {
    if (!token || !allSigned || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitPublicChecklist(token, {
        responses: items.map((i) => ({
          itemId: i.id,
          checked: true,
          signerName: tasks[i.id]?.signerName.trim() ?? "",
        })),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete checklist.");
      autoSubmitStarted.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [allSigned, items, submitting, tasks, token]);

  useEffect(() => {
    if (!allSigned || submitted || submitting || autoSubmitStarted.current) return;
    autoSubmitStarted.current = true;
    void submitChecklist();
  }, [allSigned, submitted, submitting, submitChecklist]);

  const updateSignerName = (itemId: string, signerName: string) => {
    setTasks((prev) => ({
      ...prev,
      [itemId]: { signed: prev[itemId]?.signed ?? false, signerName },
    }));
  };

  return (
    <div className="checklist-kiosk-page" data-testid="checklist-kiosk-page">
      <div className="checklist-kiosk-layout">
        <header className="checklist-kiosk-hero">
          <div className="checklist-kiosk-hero-brand">
            <img src="/alenio-logo-white.png" alt="Alenio" className="checklist-kiosk-logo" width={120} height={28} />
            <span className="checklist-kiosk-hero-badge">Enterprise Checklist</span>
          </div>
          <div className="checklist-kiosk-hero-body">
            {teamImage ? (
              <img src={teamImage} alt="" className="checklist-kiosk-team-avatar" />
            ) : (
              <div className="checklist-kiosk-team-avatar checklist-kiosk-team-avatar-fallback" aria-hidden>
                {(teamName || "W").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="checklist-kiosk-team-name">{loading ? "Loading…" : teamName || "Workspace"}</p>
              <h1 className="checklist-kiosk-title">{loading ? "…" : locationName || "Location checklist"}</h1>
              {!loading && !error && !submitted ? (
                <p className="checklist-kiosk-sub">
                  Sign off each task with your name. The checklist completes when every task is done.
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <main className="checklist-kiosk-main">
          {loading ? (
            <p className="checklist-kiosk-muted">Loading checklist…</p>
          ) : error && items.length === 0 && !submitted ? (
            <p className="checklist-kiosk-error" role="alert">
              {error}
            </p>
          ) : submitted ? (
            <div className="checklist-kiosk-success">
              <div className="checklist-kiosk-success-icon" aria-hidden>
                ✓
              </div>
              <p className="checklist-kiosk-success-title">Checklist complete</p>
              <p className="checklist-kiosk-muted">
                All {items.length} tasks were signed off and recorded for {locationName}.
              </p>
              <button type="button" className="checklist-kiosk-primary" onClick={() => void load(token)}>
                Start next checklist
              </button>
            </div>
          ) : (
            <>
              <div className="checklist-kiosk-progress">
                <div className="checklist-kiosk-progress-labels">
                  <span className="checklist-kiosk-progress-count">
                    {signedCount} of {items.length} tasks complete
                  </span>
                  <span className="checklist-kiosk-progress-pct">{progressPct}%</span>
                </div>
                <div className="checklist-kiosk-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="checklist-kiosk-progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              <div className="checklist-kiosk-tiles">
                {items.map((item, idx) => {
                  const state = tasks[item.id] ?? { signed: false, signerName: "" };
                  return (
                    <article
                      key={item.id}
                      className={`checklist-kiosk-tile${state.signed ? " checklist-kiosk-tile-done" : ""}`}
                    >
                      <div className="checklist-kiosk-tile-head">
                        <span className="checklist-kiosk-tile-num">Task {idx + 1}</span>
                        {state.signed ? (
                          <span className="checklist-kiosk-tile-status">Signed off</span>
                        ) : (
                          <span className="checklist-kiosk-tile-status checklist-kiosk-tile-status-pending">Pending</span>
                        )}
                      </div>
                      <h2 className="checklist-kiosk-tile-title">{item.title}</h2>
                      {state.signed ? (
                        <p className="checklist-kiosk-tile-signed">
                          <span className="checklist-kiosk-tile-check" aria-hidden>
                            ✓
                          </span>
                          Signed by <strong>{state.signerName}</strong>
                        </p>
                      ) : (
                        <>
                          <label className="checklist-kiosk-tile-name-label" htmlFor={`signer-${item.id}`}>
                            Your name
                          </label>
                          <input
                            id={`signer-${item.id}`}
                            className="checklist-kiosk-tile-name-input"
                            value={state.signerName}
                            onChange={(e) => updateSignerName(item.id, e.target.value)}
                            placeholder="First and last name"
                            autoComplete="name"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") signOffTask(item.id);
                            }}
                          />
                          <button
                            type="button"
                            className="checklist-kiosk-tile-sign-btn"
                            onClick={() => signOffTask(item.id)}
                          >
                            Sign off task
                          </button>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              {error ? (
                <p className="checklist-kiosk-error" role="alert">
                  {error}
                </p>
              ) : null}

              {allSigned && submitting ? (
                <p className="checklist-kiosk-muted checklist-kiosk-finishing">Completing checklist…</p>
              ) : null}
            </>
          )}
        </main>

        <footer className="checklist-kiosk-footer">
          <img src="/alenio-logo.png" alt="" className="checklist-kiosk-footer-logo" width={72} height={18} aria-hidden />
          <span>Powered by Alenio Enterprise</span>
        </footer>
      </div>
    </div>
  );
}
