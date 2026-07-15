import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  DEFAULT_OPERATIONAL_CONTEXT,
  FOCUS_AREA_OPTIONS,
  fetchSenecaOperationalContext,
  publishSenecaOperationalContext,
  saveSenecaOperationalContextDraft,
  senecaStudioAccess,
  type SenecaOperationalContextData,
  type SenecaOperationalGoal,
} from "../../lib/seneca-studio-api";

function newGoal(): SenecaOperationalGoal {
  return {
    id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    description: "",
    targetDate: null,
    priority: "medium",
    status: "active",
  };
}

function StringListEditor({
  title,
  subtitle,
  items,
  placeholder,
  canEdit,
  onChange,
}: {
  title: string;
  subtitle: string;
  items: string[];
  placeholder: string;
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section className="seneca-studio-card">
      <h3 className="seneca-studio-card-title">{title}</h3>
      <p className="seneca-studio-card-subtitle">{subtitle}</p>
      <ul className="seneca-studio-string-list">
        {items.length === 0 ? <li className="seneca-studio-empty">None added yet.</li> : null}
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>
            {canEdit ? (
              <input
                className="seneca-studio-inline-input"
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = e.target.value;
                  onChange(next);
                }}
              />
            ) : (
              <span>{item}</span>
            )}
            {canEdit ? (
              <button
                type="button"
                className="seneca-studio-icon-btn"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="seneca-studio-add-row"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed) return;
            onChange([...items, trimmed]);
            setDraft("");
          }}
        >
          <input
            className="auth-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
          />
          <button type="submit" className="enterprise-team-pill-btn" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function SenecaWorkspaceContextPage() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const teamId = selectedTeamId || teams?.[0]?.id || "";
  const team = teams?.find((t) => t.id === teamId);
  const access = senecaStudioAccess(team?.role);
  const canEdit = access.canEdit;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState("default");
  const [status, setStatus] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [data, setData] = useState<SenecaOperationalContextData>(DEFAULT_OPERATIONAL_CONTEXT);

  const patch = useCallback((partial: Partial<SenecaOperationalContextData>) => {
    setData((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setNotice(null);
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSenecaOperationalContext(teamId);
      setData(res.operationalContext ?? DEFAULT_OPERATIONAL_CONTEXT);
      setSource(res.source);
      setStatus(res.status);
      setVersion(res.version);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace context.");
      setData(DEFAULT_OPERATIONAL_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = useMemo(() => {
    if (status === "PUBLISHED" || source === "published") return "Published";
    if (status === "DRAFT" || source === "draft") return "Draft";
    return "Default";
  }, [status, source]);

  async function withBusy<T>(fn: () => Promise<T>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (okMessage) setNotice(okMessage);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!teamId || !canEdit) return;
    const res = await withBusy(
      () => saveSenecaOperationalContextDraft(teamId, data),
      "Draft saved.",
    );
    if (!res) return;
    setData(res.operationalContext);
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setDirty(false);
  }

  async function onPublish() {
    if (!teamId || !canEdit) return;
    if (dirty) {
      const saved = await withBusy(() => saveSenecaOperationalContextDraft(teamId, data));
      if (!saved) return;
    }
    const res = await withBusy(() => publishSenecaOperationalContext(teamId), "Published.");
    if (!res) return;
    setData(res.operationalContext);
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setDirty(false);
  }

  function toggleFocusArea(area: string) {
    if (!canEdit) return;
    const has = data.focusAreas.includes(area);
    patch({
      focusAreas: has ? data.focusAreas.filter((a) => a !== area) : [...data.focusAreas, area],
    });
  }

  function updateGoal(id: string, partial: Partial<SenecaOperationalGoal>) {
    patch({
      currentGoals: data.currentGoals.map((g) => (g.id === id ? { ...g, ...partial } : g)),
    });
  }

  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading workspace context" />;
  }

  if (!access.canView) {
    return <Navigate to="/settings" replace />;
  }

  if (loading) {
    return <EnterprisePageLoading label="Loading workspace context" />;
  }

  const prefs = data.recognitionPreferences;

  return (
    <div className="enterprise-tab-shell seneca-studio-page" data-testid="seneca-workspace-context-page">
      <div className="seneca-studio-page-inner seneca-studio-page-inner--narrow">
        <nav className="seneca-studio-breadcrumb" aria-label="Breadcrumb">
          <Link to="/settings">Settings</Link>
          <span aria-hidden>›</span>
          <Link to="/settings/ai">AI</Link>
          <span aria-hidden>›</span>
          <span>Workspace Context</span>
        </nav>

        <header className="seneca-studio-header">
          <div>
            <h1 className="seneca-studio-title">Seneca Workspace Context</h1>
            <p className="seneca-studio-subtitle">
              Operational context for Seneca — not coaching configuration.
            </p>
          </div>
          <div className="seneca-studio-header-actions">
            <span
              className={`seneca-studio-badge seneca-studio-badge--${statusLabel === "Published" ? "published" : statusLabel === "Draft" ? "draft" : "default"}`}
            >
              {statusLabel}
              {version != null ? ` · v${version}` : ""}
            </span>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="enterprise-team-pill-btn"
                  disabled={busy || !dirty}
                  onClick={() => void onSave()}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="auth-submit seneca-studio-publish-btn"
                  disabled={busy}
                  onClick={() => void onPublish()}
                >
                  Publish
                </button>
              </>
            ) : (
              <span className="seneca-studio-badge seneca-studio-badge--readonly">View only</span>
            )}
          </div>
        </header>

        {error ? (
          <p className="enterprise-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="seneca-studio-notice">{notice}</p> : null}

        <div className="seneca-studio-context-grid">
          <StringListEditor
            title="Current priorities"
            subtitle="What the workspace is focused on right now."
            items={data.currentPriorities}
            placeholder="e.g. Improve friendliness"
            canEdit={canEdit}
            onChange={(currentPriorities) => patch({ currentPriorities })}
          />

          <section className="seneca-studio-card">
            <div className="seneca-studio-card-head-row">
              <div>
                <h3 className="seneca-studio-card-title">Current goals</h3>
                <p className="seneca-studio-card-subtitle">Track measurable workspace goals.</p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="enterprise-team-pill-btn"
                  onClick={() => patch({ currentGoals: [...data.currentGoals, newGoal()] })}
                >
                  Add goal
                </button>
              ) : null}
            </div>
            {data.currentGoals.length === 0 ? (
              <p className="seneca-studio-empty">No goals yet.</p>
            ) : (
              <div className="seneca-studio-goals">
                {data.currentGoals.map((goal) => (
                  <div key={goal.id} className="seneca-studio-goal">
                    <input
                      className="auth-input"
                      placeholder="Goal title"
                      disabled={!canEdit}
                      value={goal.title}
                      onChange={(e) => updateGoal(goal.id, { title: e.target.value })}
                    />
                    <textarea
                      className="auth-input seneca-studio-textarea"
                      rows={2}
                      placeholder="Description"
                      disabled={!canEdit}
                      value={goal.description}
                      onChange={(e) => updateGoal(goal.id, { description: e.target.value })}
                    />
                    <div className="seneca-studio-goal-row">
                      <input
                        type="date"
                        className="auth-input"
                        disabled={!canEdit}
                        value={goal.targetDate ?? ""}
                        onChange={(e) =>
                          updateGoal(goal.id, { targetDate: e.target.value || null })
                        }
                      />
                      <select
                        className="auth-input"
                        disabled={!canEdit}
                        value={goal.priority}
                        onChange={(e) =>
                          updateGoal(goal.id, {
                            priority: e.target.value as SenecaOperationalGoal["priority"],
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <select
                        className="auth-input"
                        disabled={!canEdit}
                        value={goal.status}
                        onChange={(e) =>
                          updateGoal(goal.id, {
                            status: e.target.value as SenecaOperationalGoal["status"],
                          })
                        }
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                      </select>
                      {canEdit ? (
                        <button
                          type="button"
                          className="seneca-studio-icon-btn"
                          aria-label="Remove goal"
                          onClick={() =>
                            patch({
                              currentGoals: data.currentGoals.filter((g) => g.id !== goal.id),
                            })
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <StringListEditor
            title="Current initiatives"
            subtitle="Rollouts, promotions, and major projects."
            items={data.currentInitiatives}
            placeholder="e.g. Holiday rollout"
            canEdit={canEdit}
            onChange={(currentInitiatives) => patch({ currentInitiatives })}
          />

          <section className="seneca-studio-card">
            <h3 className="seneca-studio-card-title">Focus areas</h3>
            <p className="seneca-studio-card-subtitle">Select areas Seneca should emphasize.</p>
            <div className="seneca-studio-focus-grid">
              {FOCUS_AREA_OPTIONS.map((area) => {
                const active = data.focusAreas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    className={`seneca-studio-focus-chip${active ? " is-active" : ""}`}
                    disabled={!canEdit}
                    onClick={() => toggleFocusArea(area)}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="seneca-studio-card">
            <h3 className="seneca-studio-card-title">Workspace notes</h3>
            <p className="seneca-studio-card-subtitle">
              Situational notes Seneca should keep in mind.
            </p>
            <textarea
              className="auth-input seneca-studio-textarea"
              rows={6}
              disabled={!canEdit}
              value={data.workspaceNotes}
              onChange={(e) => patch({ workspaceNotes: e.target.value })}
              placeholder="e.g. Three new managers. Preparing for grand opening."
            />
          </section>

          <section className="seneca-studio-card">
            <h3 className="seneca-studio-card-title">Recognition preferences</h3>
            <p className="seneca-studio-card-subtitle">How Seneca should recommend recognition.</p>
            <div className="seneca-studio-pref-list">
              {(
                [
                  ["publicRecognition", "Public recognition"],
                  ["privateRecognition", "Private recognition"],
                  ["celebrateMilestones", "Celebrate milestones"],
                  ["celebrateTrainingCompletion", "Celebrate training completion"],
                  ["celebrateCustomerWins", "Celebrate customer wins"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="seneca-studio-toggle-row">
                  <p className="seneca-studio-toggle-label">{label}</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs[key]}
                    className={`seneca-studio-switch${prefs[key] ? " is-on" : ""}`}
                    disabled={!canEdit}
                    onClick={() =>
                      patch({
                        recognitionPreferences: { ...prefs, [key]: !prefs[key] },
                      })
                    }
                  >
                    <span className="seneca-studio-switch-knob" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
