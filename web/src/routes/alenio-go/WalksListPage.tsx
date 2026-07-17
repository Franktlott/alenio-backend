import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { createWalkTemplate, fetchWalkTemplates } from "../../lib/walks/api";
import { flattenWalkItems, type WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function statusLabel(status: string) {
  if (status === "PUBLISHED") return "Published";
  if (status === "ARCHIVED") return "Archived";
  return "Draft";
}

function statusTone(status: string) {
  if (status === "PUBLISHED") return "published";
  if (status === "ARCHIVED") return "archived";
  return "draft";
}

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function WalksListPage() {
  const navigate = useNavigate();
  const { canManage, teamId, teamName } = useAlenioGoShell();
  const [walks, setWalks] = useState<WalkTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    const list = await fetchWalkTemplates(teamId);
    setWalks(list);
  }, [teamId]);

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load walks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, load]);

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  async function createWalk() {
    setBusy(true);
    setError(null);
    try {
      const created = await createWalkTemplate(teamId!, {
        name: "New Temp Walk",
        description: "Temperature and food-safety checks for associates.",
        workplace: teamName,
        estimatedDurationMinutes: 15,
      });
      navigate(`/go/temp-checks/walks/builder/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create walk.");
      setBusy(false);
    }
  }

  return (
    <div className="wil-shell" data-testid="walks-list-page">
      <div className="wil-page">
        <header className="wil-header">
          <div>
            <h1 className="wil-title">Walks</h1>
            <p className="wil-subtitle">
              Build complete walks from your Item Library, then publish for associates in Alenio Temps.
            </p>
          </div>
          <div className="wil-header-actions">
            <button
              type="button"
              className="wil-btn wil-btn--primary"
              disabled={busy}
              onClick={() => void createWalk()}
            >
              + Create Walk
            </button>
          </div>
        </header>

        {error ? <p className="wil-error">{error}</p> : null}

        {loading ? (
          <EnterprisePageLoading label="Loading walks…" />
        ) : walks.length === 0 ? (
          <div className="walks-empty">
            <h2>No walks yet</h2>
            <p>Create a walk, then add items from your Item Library.</p>
            <button
              type="button"
              className="wil-btn wil-btn--primary"
              disabled={busy}
              onClick={() => void createWalk()}
            >
              + Create Walk
            </button>
          </div>
        ) : (
          <section className="wil-table-card" aria-label="Walks">
            <div className="wil-table-wrap">
              <table className="wil-table">
                <thead>
                  <tr>
                    <th>Walk name</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Version</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {walks.map((walk) => {
                    const count = flattenWalkItems(walk).length;
                    return (
                      <tr
                        key={walk.id}
                        onClick={() => navigate(`/go/temp-checks/walks/builder/${walk.id}`)}
                      >
                        <td>
                          <span className="wil-item-copy">
                            <strong>{walk.name}</strong>
                            {walk.description ? <em>{walk.description}</em> : null}
                          </span>
                        </td>
                        <td>
                          <span className={`walks-status walks-status--${statusTone(walk.status)}`}>
                            {statusLabel(walk.status)}
                          </span>
                        </td>
                        <td>{count}</td>
                        <td>v{walk.version}</td>
                        <td className="wil-updated">{relativeTime(walk.updatedAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="wil-btn wil-btn--secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/go/temp-checks/walks/builder/${walk.id}`);
                            }}
                          >
                            Open builder
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
