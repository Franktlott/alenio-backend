import { useEffect, useState } from "react";
import { fetchWebTeam, patchWebTeamGoFrontendSettings } from "../../lib/api";
import {
  DEFAULT_GO_FRONTEND_SETTINGS,
  MAX_GO_FLOOR_QUICK_ACTIONS,
  QUICK_ACTION_CATALOG,
  normalizeGoFrontendSettings,
  resolveGoQuickActions,
  type GoFrontendQuickAction,
  type GoFrontendQuickActionIcon,
  type GoFrontendSettings,
} from "../../lib/go-frontend-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  teamId: string;
};

function ActionIcon({ icon }: { icon: GoFrontendQuickActionIcon }) {
  if (icon === "camera") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  if (icon === "note") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  if (icon === "temp") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  if (icon === "history") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (icon === "check") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (icon === "alert") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function newActionId(existing: GoFrontendQuickAction[]): string {
  return `qa-${Date.now().toString(36)}-${existing.length + 1}`;
}

export function GoDeviceQuickActionsManagePanel({ open, onClose, teamId }: Props) {
  const [settings, setSettings] = useState<GoFrontendSettings>(DEFAULT_GO_FRONTEND_SETTINGS);
  const [draft, setDraft] = useState<GoFrontendQuickAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaved(false);
    setAdding(false);
    void fetchWebTeam(teamId)
      .then((team) => {
        if (cancelled) return;
        const next = normalizeGoFrontendSettings(team.goFrontendSettings ?? DEFAULT_GO_FRONTEND_SETTINGS);
        setSettings(next);
        setDraft(resolveGoQuickActions(next));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load device quick actions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  async function save(nextActions: GoFrontendQuickAction[]) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const persisted = await patchWebTeamGoFrontendSettings(teamId, {
        ...settings,
        quickActions: nextActions,
      });
      setSettings(persisted);
      setDraft(resolveGoQuickActions(persisted));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save quick actions.");
    } finally {
      setSaving(false);
    }
  }

  function updateLabel(id: string, label: string) {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, label } : row)));
  }

  function toggleActive(id: string) {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, active: !row.active } : row)));
  }

  function removeAction(id: string) {
    setDraft((rows) => rows.filter((row) => row.id !== id));
  }

  function addFromCatalog(item: (typeof QUICK_ACTION_CATALOG)[number]) {
    if (draft.length >= MAX_GO_FLOOR_QUICK_ACTIONS) return;
    setDraft((rows) => [
      ...rows,
      {
        id: newActionId(rows),
        label: item.label,
        active: true,
        tone: item.tone,
        icon: item.icon,
      },
    ]);
    setAdding(false);
  }

  if (!open) return null;

  const canAdd = draft.length < MAX_GO_FLOOR_QUICK_ACTIONS;

  return (
    <div className="go-qa-manage" role="dialog" aria-modal="true" aria-labelledby="go-qa-manage-title">
      <button type="button" className="go-qa-manage-backdrop" aria-label="Close" onClick={onClose} />
      <div className="go-qa-manage-sheet">
        <header className="go-qa-manage-head">
          <div>
            <h2 id="go-qa-manage-title">Device quick actions</h2>
            <p>
              Choose up to {MAX_GO_FLOOR_QUICK_ACTIONS} actions for Alenio Go floor devices (one row). Leave empty to hide
              quick actions on the floor.
            </p>
          </div>
          <button type="button" className="go-qa-manage-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? <p className="go-qa-manage-error">{error}</p> : null}
        {saved ? <p className="go-qa-manage-saved">Saved — floor devices will update shortly.</p> : null}

        {loading ? (
          <p className="enterprise-muted go-qa-manage-loading">Loading…</p>
        ) : (
          <>
            <div className="go-qa-manage-grid" data-testid="go-qa-manage-grid">
              {draft.map((action) => (
                <div
                  key={action.id}
                  className={`go-qa-manage-card go-dash-quick-card--${action.tone}${action.active ? "" : " go-qa-manage-card--off"}`}
                >
                  <button
                    type="button"
                    className="go-qa-manage-remove"
                    onClick={() => removeAction(action.id)}
                    aria-label={`Remove ${action.label}`}
                  >
                    ×
                  </button>
                  <span className="go-dash-quick-icon" aria-hidden>
                    <ActionIcon icon={action.icon} />
                  </span>
                  <input
                    className="go-qa-manage-label"
                    value={action.label}
                    maxLength={40}
                    onChange={(e) => updateLabel(action.id, e.target.value)}
                    aria-label="Action label"
                  />
                  <label className="go-qa-manage-toggle">
                    <input
                      type="checkbox"
                      checked={action.active}
                      onChange={() => toggleActive(action.id)}
                    />
                    <span>{action.active ? "On" : "Off"}</span>
                  </label>
                </div>
              ))}
            </div>

            <div className="go-qa-manage-footer">
              {adding ? (
                <div className="go-qa-manage-catalog">
                  <p className="go-qa-manage-catalog-title">Add a quick action</p>
                  <div className="go-qa-manage-catalog-grid">
                    {QUICK_ACTION_CATALOG.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`go-qa-manage-catalog-item go-dash-quick-card--${item.tone}`}
                        onClick={() => addFromCatalog(item)}
                      >
                        <span className="go-dash-quick-icon" aria-hidden>
                          <ActionIcon icon={item.icon} />
                        </span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="go-qa-manage-cancel-add" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="go-qa-manage-add"
                  disabled={!canAdd}
                  onClick={() => setAdding(true)}
                  title={canAdd ? undefined : `Maximum ${MAX_GO_FLOOR_QUICK_ACTIONS} actions`}
                >
                  + Add quick action
                  <span>
                    {draft.length}/{MAX_GO_FLOOR_QUICK_ACTIONS}
                  </span>
                </button>
              )}

              <div className="go-qa-manage-actions">
                <button type="button" className="go-qa-manage-secondary" onClick={onClose} disabled={saving}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="go-qa-manage-primary"
                  disabled={saving || loading}
                  onClick={() => void save(draft)}
                >
                  {saving ? "Saving…" : "Save to devices"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
