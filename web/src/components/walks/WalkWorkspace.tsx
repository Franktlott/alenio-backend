import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalkCompletionRow, WalkTemplateRow } from "../../lib/api";
import { deleteTeamWalkTemplate, fetchTeamWalkCompletions, fetchTeamWalkTemplates } from "../../lib/api";
import { formatWalkDateTime, getWalkTemplateSections } from "../../lib/walks-display";
import { WalkHistoryDetail } from "./WalkHistoryDetail";

type Tab = "templates" | "history";

type Props = {
  teamId: string;
  canManage: boolean;
  initialWalkId?: string;
  initialCompletionId?: string;
};

export function WalkWorkspace({ teamId, canManage, initialWalkId, initialCompletionId }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(initialCompletionId ? "history" : "templates");
  const [templates, setTemplates] = useState<WalkTemplateRow[]>([]);
  const [completions, setCompletions] = useState<WalkCompletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialWalkId ?? null);
  const [selectedCompletionId, setSelectedCompletionId] = useState<string | null>(initialCompletionId ?? null);
  const [search, setSearch] = useState("");
  const [menuWalkId, setMenuWalkId] = useState<string | null>(null);
  const [deletingWalkId, setDeletingWalkId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuWalkId) return;
    const close = () => setMenuWalkId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuWalkId]);

  const handleDeleteWalk = useCallback(
    async (walk: WalkTemplateRow) => {
      setMenuWalkId(null);
      if (
        !window.confirm(
          `Delete "${walk.name}"? Completed walk history will be kept, but this walk will no longer be available.`,
        )
      ) {
        return;
      }
      setDeletingWalkId(walk.id);
      try {
        await deleteTeamWalkTemplate(teamId, walk.id);
        setTemplates((prev) => {
          const next = prev.filter((t) => t.id !== walk.id);
          setSelectedTemplateId((selected) => {
            if (selected !== walk.id) return selected;
            return next[0]?.id ?? null;
          });
          return next;
        });
        if (initialWalkId === walk.id) navigate("/go/walks", { replace: true });
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Could not delete walk. Please try again.");
      } finally {
        setDeletingWalkId(null);
      }
    },
    [teamId, initialWalkId, navigate],
  );

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void Promise.all([fetchTeamWalkTemplates(teamId), fetchTeamWalkCompletions(teamId)])
      .then(([templateData, completionData]) => {
        setTemplates(templateData.templates);
        setCompletions(completionData.completions);
        setSelectedTemplateId((prev) => {
          if (prev && templateData.templates.some((t) => t.id === prev)) return prev;
          if (initialWalkId && templateData.templates.some((t) => t.id === initialWalkId)) return initialWalkId;
          return templateData.templates[0]?.id ?? null;
        });
        setSelectedCompletionId((prev) => {
          if (prev && completionData.completions.some((c) => c.id === prev)) return prev;
          if (initialCompletionId && completionData.completions.some((c) => c.id === initialCompletionId)) {
            return initialCompletionId;
          }
          return completionData.completions[0]?.id ?? null;
        });
      })
      .catch(() => {
        setTemplates([]);
        setCompletions([]);
      })
      .finally(() => setLoading(false));
  }, [teamId, initialWalkId, initialCompletionId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.workplace.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const filteredCompletions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return completions;
    return completions.filter(
      (c) =>
        c.walkName.toLowerCase().includes(q) ||
        c.workplace.toLowerCase().includes(q) ||
        c.completedByName.toLowerCase().includes(q),
    );
  }, [completions, search]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const selectedCompletion = completions.find((c) => c.id === selectedCompletionId) ?? null;

  return (
    <div className="walk-console" data-testid="walk-console">
      <header className="walk-console-top">
        <div className="walk-console-top-left">
          <Link to="/go" className="walk-console-back">
            ← Alenio Go console
          </Link>
          <h1 className="walk-console-title">Walks</h1>
          <p className="walk-console-sub enterprise-muted">
            Structured manager observations with saved walk history.
          </p>
        </div>
        {canManage ? (
          <Link to="/go/walks/new" className="walk-console-create-btn">
            + Create Walk
          </Link>
        ) : null}
      </header>

      <div className="walk-console-body">
        <aside className="walk-console-sidebar">
          <div className="walk-console-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`walk-console-tab${tab === "templates" ? " walk-console-tab--active" : ""}`}
              aria-selected={tab === "templates"}
              onClick={() => setTab("templates")}
            >
              Walks ({templates.length})
            </button>
            <button
              type="button"
              role="tab"
              className={`walk-console-tab${tab === "history" ? " walk-console-tab--active" : ""}`}
              aria-selected={tab === "history"}
              onClick={() => setTab("history")}
            >
              History ({completions.length})
            </button>
          </div>

          <input
            type="search"
            className="walk-console-search"
            placeholder={tab === "templates" ? "Search walks…" : "Search history…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {loading ? (
            <p className="walk-console-empty">Loading…</p>
          ) : tab === "templates" ? (
            filteredTemplates.length === 0 ? (
              <p className="walk-console-empty">
                {canManage
                  ? "No walks yet. Create a walk template to start structured observations."
                  : "No walk templates available."}
              </p>
            ) : (
              <ul className="walk-console-list">
                {filteredTemplates.map((walk) => (
                  <li
                    key={walk.id}
                    className={`walk-console-list-row${menuWalkId === walk.id ? " walk-console-list-row--menu-open" : ""}`}
                  >
                    <button
                      type="button"
                      className={`walk-console-list-item${walk.id === selectedTemplateId ? " walk-console-list-item--selected" : ""}`}
                      onClick={() => setSelectedTemplateId(walk.id)}
                    >
                      <strong>{walk.name}</strong>
                      <span className="enterprise-muted">{walk.workplace}</span>
                      <span className="walk-console-list-meta">
                        {walk.itemCount} items · {walk.completionCount} completed
                      </span>
                    </button>
                    {canManage ? (
                      <div className="enterprise-oneone-templates-more-wrap walk-console-list-kebab">
                        <button
                          type="button"
                          className="enterprise-dev-plan-kebab"
                          aria-label="Walk options"
                          aria-expanded={menuWalkId === walk.id}
                          disabled={deletingWalkId === walk.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuWalkId((prev) => (prev === walk.id ? null : walk.id));
                          }}
                        >
                          ⋮
                        </button>
                        {menuWalkId === walk.id ? (
                          <div className="enterprise-oneone-templates-more-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="enterprise-oneone-templates-more-item enterprise-oneone-templates-more-item--danger"
                              disabled={deletingWalkId === walk.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteWalk(walk);
                              }}
                            >
                              {deletingWalkId === walk.id ? "Deleting…" : "Delete walk"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : filteredCompletions.length === 0 ? (
            <p className="walk-console-empty">No completed walks yet.</p>
          ) : (
            <ul className="walk-console-list">
              {filteredCompletions.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`walk-console-list-item${row.id === selectedCompletionId ? " walk-console-list-item--selected" : ""}`}
                    onClick={() => setSelectedCompletionId(row.id)}
                  >
                    <strong>{row.walkName}</strong>
                    <span className="enterprise-muted">{row.workplace}</span>
                    <span className="walk-console-list-meta">
                      {formatWalkDateTime(row.completedAt)} · {row.completedByName}
                    </span>
                    {row.needsAttentionCount > 0 ? (
                      <span className="walk-console-list-flag">{row.needsAttentionCount} need attention</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="walk-console-main">
          {tab === "templates" ? (
            !selectedTemplate ? (
              <div className="walk-console-placeholder">
                <p>Select a walk to review details or start an observation.</p>
              </div>
            ) : (
              <div className="walk-template-detail">
                <header className="walk-template-detail-head">
                  <div>
                    <h2>{selectedTemplate.name}</h2>
                    <p className="enterprise-muted">{selectedTemplate.workplace}</p>
                  </div>
                  {canManage ? (
                    <div className="walk-template-detail-actions">
                      <Link to={`/go/walks/${selectedTemplate.id}/edit`} className="walk-template-edit-link">
                        Edit walk
                      </Link>
                      <button
                        type="button"
                        className="walk-template-start-btn"
                        onClick={() => navigate(`/go/walks/${selectedTemplate.id}/run`)}
                      >
                        Start Walk
                      </button>
                      <div className="enterprise-oneone-templates-more-wrap">
                        <button
                          type="button"
                          className="enterprise-dev-plan-kebab walk-template-detail-kebab"
                          aria-label="Walk options"
                          aria-expanded={menuWalkId === selectedTemplate.id}
                          disabled={deletingWalkId === selectedTemplate.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuWalkId((prev) => (prev === selectedTemplate.id ? null : selectedTemplate.id));
                          }}
                        >
                          ⋮
                        </button>
                        {menuWalkId === selectedTemplate.id ? (
                          <div className="enterprise-oneone-templates-more-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              className="enterprise-oneone-templates-more-item enterprise-oneone-templates-more-item--danger"
                              disabled={deletingWalkId === selectedTemplate.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteWalk(selectedTemplate);
                              }}
                            >
                              {deletingWalkId === selectedTemplate.id ? "Deleting…" : "Delete walk"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </header>

                <dl className="walk-template-detail-meta">
                  <div>
                    <dt>Observation items</dt>
                    <dd>{selectedTemplate.itemCount}</dd>
                  </div>
                  <div>
                    <dt>Completed walks</dt>
                    <dd>{selectedTemplate.completionCount}</dd>
                  </div>
                  <div>
                    <dt>Scoring</dt>
                    <dd>{selectedTemplate.scoringEnabled ? "Enabled" : "Off"}</dd>
                  </div>
                </dl>

                <section className="walk-template-detail-items">
                  <h3>Checklist</h3>
                  {getWalkTemplateSections(selectedTemplate).map((section) => (
                    <div key={section.id} className="walk-template-detail-section">
                      <h4>{section.title}</h4>
                      <ol>
                        {section.items.map((item) => {
                          const index = (selectedTemplate.items ?? []).findIndex((entry) => entry.id === item.id);
                          return (
                            <li key={item.id}>
                              <span className="walk-template-detail-index">{index + 1}</span>
                              {item.label}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
                </section>

                {!canManage ? (
                  <p className="enterprise-muted walk-template-member-note">
                    Walk execution is available to workspace owners and team leaders.
                  </p>
                ) : null}
              </div>
            )
          ) : !selectedCompletion ? (
            <div className="walk-console-placeholder">
              <p>Select a completed walk to review the observation record.</p>
            </div>
          ) : (
            <WalkHistoryDetail completion={selectedCompletion} />
          )}
        </section>
      </div>
    </div>
  );
}
