import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { TempCheckTemplateRow } from "../../lib/api";
import { deleteTeamTempCheckTemplate, fetchTeamTempCheckTemplates } from "../../lib/api";
import {
  formatTempCheckSchedule,
  formatTempCheckTime,
  formatTempCheckWindow,
  formatTempRange,
} from "../../lib/temp-checks-display";
import { GoBackendModuleShell } from "../alenio-go/GoBackendModuleShell";

type Props = {
  teamId: string;
  canManage: boolean;
  initialTemplateId?: string;
};

export function TempCheckWorkspace({ teamId, canManage, initialTemplateId }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TempCheckTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void fetchTeamTempCheckTemplates(teamId)
      .then((data) => {
        setTemplates(data.templates);
        setSelectedTemplateId((prev) => {
          if (prev && data.templates.some((t) => t.id === prev)) return prev;
          if (initialTemplateId && data.templates.some((t) => t.id === initialTemplateId)) return initialTemplateId;
          return data.templates[0]?.id ?? null;
        });
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [teamId, initialTemplateId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.items.some((item) => item.label.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  async function handleDelete(template: TempCheckTemplateRow) {
    if (
      !window.confirm(
        `Delete "${template.name}"? This removes the check from Alenio Go devices. Completed logs are kept for future history.`,
      )
    ) {
      return;
    }
    setDeletingId(template.id);
    try {
      await deleteTeamTempCheckTemplate(teamId, template.id);
      setTemplates((prev) => {
        const next = prev.filter((t) => t.id !== template.id);
        setSelectedTemplateId((selected) => (selected === template.id ? (next[0]?.id ?? null) : selected));
        return next;
      });
      if (initialTemplateId === template.id) navigate("/go/temp-checks", { replace: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete temp check.");
    } finally {
      setDeletingId(null);
    }
  }

  const toolbar = canManage ? (
    <Link to="/go/temp-checks/new" className="temp-check-toolbar-btn">
      + New temp check
    </Link>
  ) : null;

  return (
    <GoBackendModuleShell
      title="Temp checks"
      subtitle="Configure food safety temperature checks, due windows, and corrective actions for your floor teams."
      tone="emerald"
      toolbar={toolbar}
    >
      <div className="temp-check-console">
        <aside className="temp-check-console-sidebar">
          <div className="temp-check-console-search">
            <input
              type="search"
              value={search}
              placeholder="Search checks…"
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search temp checks"
            />
          </div>
          {loading ? (
            <p className="enterprise-muted temp-check-console-empty">Loading checks…</p>
          ) : filteredTemplates.length === 0 ? (
            <div className="temp-check-console-empty">
              <p className="enterprise-muted">
                {templates.length === 0
                  ? "No temp checks yet. Create your first check to publish standards to the floor."
                  : "No checks match your search."}
              </p>
              {canManage && templates.length === 0 ? (
                <Link to="/go/temp-checks/new" className="temp-check-toolbar-btn">
                  Create temp check
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="temp-check-template-list">
              {filteredTemplates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    className={`temp-check-template-row${selectedTemplateId === template.id ? " temp-check-template-row--active" : ""}`}
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      navigate(`/go/temp-checks/${template.id}`);
                    }}
                  >
                    <span className="temp-check-template-row-title">{template.name}</span>
                    <span className="temp-check-template-row-meta">
                      Due {formatTempCheckTime(template.dueTimeLocal)} · {template.itemCount} items
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="temp-check-console-main">
          {!selectedTemplate ? (
            <div className="temp-check-detail-empty go-backend-panel-card">
              <h2>Select a temp check</h2>
              <p className="enterprise-muted">Choose a check on the left to review schedule, items, and corrective actions.</p>
            </div>
          ) : (
            <div className="temp-check-detail go-backend-panel-card">
              <header className="temp-check-detail-head">
                <div>
                  <p className="temp-check-detail-kicker">Configured check</p>
                  <h2>{selectedTemplate.name}</h2>
                  <p className="temp-check-detail-schedule">{formatTempCheckSchedule(selectedTemplate)}</p>
                </div>
                {canManage ? (
                  <div className="temp-check-detail-actions">
                    <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="temp-check-btn-secondary">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="temp-check-btn-danger"
                      disabled={deletingId === selectedTemplate.id}
                      onClick={() => void handleDelete(selectedTemplate)}
                    >
                      {deletingId === selectedTemplate.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                ) : null}
              </header>

              {selectedTemplate.description ? (
                <section className="temp-check-detail-section">
                  <h3>Description</h3>
                  <p>{selectedTemplate.description}</p>
                </section>
              ) : null}

              <section className="temp-check-detail-section">
                <h3>Check window</h3>
                <p>
                  Due at <strong>{formatTempCheckTime(selectedTemplate.dueTimeLocal)}</strong> · Complete between{" "}
                  <strong>{formatTempCheckWindow(selectedTemplate)}</strong>
                </p>
                {selectedTemplate.outOfWindowActions.length > 0 ? (
                  <div className="temp-check-detail-actions-block">
                    <span className="temp-check-detail-label">Outside window actions</span>
                    <ul>
                      {selectedTemplate.outOfWindowActions.map((action) => (
                        <li key={action.id}>{action.label}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="enterprise-muted">No outside-window corrective actions configured.</p>
                )}
              </section>

              <section className="temp-check-detail-section">
                <h3>Items ({selectedTemplate.items.length})</h3>
                <div className="temp-check-detail-table-wrap">
                  <table className="temp-check-detail-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Range</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTemplate.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.label}</td>
                          <td>{formatTempRange(item.tempMinF, item.tempMaxF)}</td>
                          <td>
                            {item.correctiveActions.length > 0
                              ? item.correctiveActions.map((action) => action.label).join(" · ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </GoBackendModuleShell>
  );
}
