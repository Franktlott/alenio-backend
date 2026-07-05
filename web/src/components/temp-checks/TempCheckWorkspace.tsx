import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TempCheckTemplateRow } from "../../lib/api";
import { deleteTeamTempCheckTemplate, fetchTeamTempCheckTemplates, postTeamTempCheckPublish, postTeamTempCheckUnpublish } from "../../lib/api";
import {
  computeProgramKpis,
  formatWindowDuration,
  inferItemCategory,
  inferProgramIcon,
  programStatusDotClass,
} from "../../lib/temp-checks-program-helpers";
import { formatTempCheckTime, formatTempCheckWindow, formatTempRange } from "../../lib/temp-checks-display";
import { CheckBadgeIcon, ItemCategoryIcon, KpiIcon, ProgramIcon } from "./TempCheckProgramIcons";

type Props = {
  teamId: string;
  canManage: boolean;
  initialTemplateId?: string;
};

const PROGRAM_SETTINGS = [
  "Required for all locations",
  "Require initials",
  "Per-item corrective actions",
  "Bluetooth probe required",
] as const;

function ProgramOverflowMenu({
  template,
  canManage,
  onDelete,
  deleting,
}: {
  template: TempCheckTemplateRow;
  canManage: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  if (!canManage) return null;

  return (
    <div className="tc-prog-overflow" ref={ref}>
      <button
        type="button"
        className="tc-prog-overflow-btn"
        aria-label="Program options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div className="tc-prog-overflow-menu" role="menu">
          <Link to={`/go/temp-checks/${template.id}/edit`} className="tc-prog-overflow-item" role="menuitem" onClick={() => setOpen(false)}>
            Edit
          </Link>
          <button
            type="button"
            className="tc-prog-overflow-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              window.alert("Duplicate will be available in a future update.");
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            className="tc-prog-overflow-item tc-prog-overflow-item--danger"
            role="menuitem"
            disabled={deleting}
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TempCheckWorkspace({ teamId, canManage, initialTemplateId }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TempCheckTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

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
  const kpis = useMemo(() => computeProgramKpis(templates), [templates]);
  const windowDuration = selectedTemplate
    ? formatWindowDuration(selectedTemplate.windowStartLocal, selectedTemplate.windowEndLocal)
    : "";

  async function handleDelete(template: TempCheckTemplateRow) {
    if (!window.confirm(`Delete "${template.name}"? This removes the program from Alenio Go devices.`)) return;
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
      window.alert(err instanceof Error ? err.message : "Could not delete program.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePublish(template: TempCheckTemplateRow) {
    setPublishBusyId(template.id);
    try {
      const updated = await postTeamTempCheckPublish(teamId, template.id);
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? updated : t)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not publish program.");
    } finally {
      setPublishBusyId(null);
    }
  }

  async function handleUnpublish(template: TempCheckTemplateRow) {
    if (!window.confirm(`Unpublish "${template.name}"? It will be removed from floor tablets until published again.`)) return;
    setPublishBusyId(template.id);
    try {
      const updated = await postTeamTempCheckUnpublish(teamId, template.id);
      setTemplates((prev) => prev.map((t) => (t.id === template.id ? updated : t)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not unpublish program.");
    } finally {
      setPublishBusyId(null);
    }
  }

  const selectedTone = selectedTemplate ? inferProgramIcon(selectedTemplate.name) : "default";

  return (
    <div className="tc-prog" data-testid="temp-check-programs-page">
      <header className="tc-prog-header">
        <div className="tc-prog-header-left">
          <Link to="/go" className="tc-prog-back" aria-label="Back to Alenio Go console">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div>
            <h1 className="tc-prog-title">Temp Checks</h1>
            <p className="tc-prog-subtitle">Configure recurring temperature programs for Alenio Go.</p>
          </div>
        </div>
        {canManage ? (
          <Link to="/go/temp-checks/new" className="tc-prog-btn-primary">
            + New Program
          </Link>
        ) : null}
      </header>

      <section className="tc-prog-kpis" aria-label="Program summary">
        <article className="tc-prog-kpi tc-prog-kpi--green">
          <span className="tc-prog-kpi-icon">
            <KpiIcon kind="programs" />
          </span>
          <div>
            <span className="tc-prog-kpi-value">{kpis.activePrograms}</span>
            <span className="tc-prog-kpi-label">Active Programs</span>
          </div>
        </article>
        <article className="tc-prog-kpi tc-prog-kpi--blue">
          <span className="tc-prog-kpi-icon">
            <KpiIcon kind="due" />
          </span>
          <div>
            <span className="tc-prog-kpi-value">{kpis.nextDueTime}</span>
            <span className="tc-prog-kpi-label">{kpis.nextDueLabel}</span>
          </div>
        </article>
        <article className="tc-prog-kpi tc-prog-kpi--purple">
          <span className="tc-prog-kpi-icon">
            <KpiIcon kind="items" />
          </span>
          <div>
            <span className="tc-prog-kpi-value">{kpis.totalTempItems}</span>
            <span className="tc-prog-kpi-label">Total Temp Items</span>
          </div>
        </article>
        <article className="tc-prog-kpi tc-prog-kpi--orange">
          <span className="tc-prog-kpi-icon">
            <KpiIcon kind="locations" />
          </span>
          <div>
            <span className="tc-prog-kpi-value">All</span>
            <span className="tc-prog-kpi-label">Locations Using</span>
          </div>
        </article>
        <article className="tc-prog-kpi tc-prog-kpi--green">
          <span className="tc-prog-kpi-icon">
            <KpiIcon kind="completion" />
          </span>
          <div>
            <span className="tc-prog-kpi-value">—</span>
            <span className="tc-prog-kpi-label">Completion (30 days)</span>
          </div>
        </article>
      </section>

      <div className="tc-prog-layout">
        <aside className="tc-prog-sidebar">
          <h2 className="tc-prog-sidebar-title">Temperature Programs</h2>
          <label className="tc-prog-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
            <input
              type="search"
              value={search}
              placeholder="Search programs..."
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search programs"
            />
          </label>

          {loading ? (
            <p className="tc-prog-empty">Loading programs…</p>
          ) : filteredTemplates.length === 0 ? (
            <div className="tc-prog-empty">
              <p>{templates.length === 0 ? "No programs yet. Create your first temperature program." : "No programs match your search."}</p>
              {canManage && templates.length === 0 ? (
                <Link to="/go/temp-checks/new" className="tc-prog-btn-primary tc-prog-btn-primary--small">
                  + New Program
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="tc-prog-list">
              {filteredTemplates.map((template) => {
                const tone = inferProgramIcon(template.name);
                const active = selectedTemplateId === template.id;
                return (
                  <li key={template.id}>
                    <button
                      type="button"
                      className={`tc-prog-card${active ? " tc-prog-card--active" : ""}`}
                      onClick={() => {
                        setSelectedTemplateId(template.id);
                        navigate(`/go/temp-checks/${template.id}`);
                      }}
                    >
                      <span className={`tc-prog-dot ${programStatusDotClass(tone)}`} aria-hidden />
                      <span className={`tc-prog-card-icon tc-prog-card-icon--${tone}`}>
                        <ProgramIcon tone={tone} />
                      </span>
                      <span className="tc-prog-card-body">
                        <span className="tc-prog-card-name">{template.name}</span>
                        <span className="tc-prog-card-schedule">
                          {formatTempCheckTime(template.dueTimeLocal)} · Daily
                        </span>
                      </span>
                      <span className="tc-prog-card-pill">
                        {template.isPublished === false ? "Draft" : `${template.itemCount} items`}
                      </span>
                      <ProgramOverflowMenu
                        template={template}
                        canManage={canManage}
                        deleting={deletingId === template.id}
                        onDelete={() => void handleDelete(template)}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <main className="tc-prog-detail">
          {!selectedTemplate ? (
            <div className="tc-prog-detail-empty">
              <h2>Select a temperature program</h2>
              <p>Choose a program on the left to review schedule, items, and corrective actions.</p>
            </div>
          ) : (
            <div className="tc-prog-detail-panel">
              <header className="tc-prog-detail-head">
                <div className="tc-prog-detail-head-main">
                  <span className={`tc-prog-detail-icon tc-prog-detail-icon--${selectedTone}`}>
                    <ProgramIcon tone={selectedTone} />
                  </span>
                  <div>
                    <div className="tc-prog-detail-title-row">
                      <h2>{selectedTemplate.name}</h2>
                      {selectedTemplate.isPublished !== false ? (
                        <span className="tc-prog-badge-active">Published</span>
                      ) : (
                        <span className="tc-prog-badge-draft">Draft</span>
                      )}
                    </div>
                    <div className="tc-prog-detail-meta">
                      <span>{formatTempCheckTime(selectedTemplate.dueTimeLocal)}</span>
                      <span>Window {formatTempCheckWindow(selectedTemplate)}</span>
                      <span>{selectedTemplate.itemCount} Temperature Items</span>
                    </div>
                  </div>
                </div>
                {canManage ? (
                  <div className="tc-prog-detail-actions">
                    {selectedTemplate.isPublished !== false ? (
                      <button
                        type="button"
                        className="tc-prog-btn-ghost"
                        disabled={publishBusyId === selectedTemplate.id}
                        onClick={() => void handleUnpublish(selectedTemplate)}
                      >
                        Unpublish
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tc-prog-btn-publish"
                        disabled={publishBusyId === selectedTemplate.id}
                        onClick={() => void handlePublish(selectedTemplate)}
                      >
                        {publishBusyId === selectedTemplate.id ? "Publishing…" : "Publish to tablets"}
                      </button>
                    )}
                    <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="tc-prog-btn-ghost">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="tc-prog-btn-ghost"
                      onClick={() => window.alert("Duplicate will be available in a future update.")}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="tc-prog-btn-ghost tc-prog-btn-ghost--danger"
                      disabled={deletingId === selectedTemplate.id}
                      onClick={() => void handleDelete(selectedTemplate)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </header>

              {selectedTemplate.isPublished === false ? (
                <div className="tc-prog-publish-banner" role="status">
                  <div>
                    <strong>Draft — not on floor tablets yet</strong>
                    <p>Publish this program when you are ready for leaders to run it on Alenio Go kiosks.</p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      className="tc-prog-btn-publish tc-prog-btn-publish--compact"
                      disabled={publishBusyId === selectedTemplate.id}
                      onClick={() => void handlePublish(selectedTemplate)}
                    >
                      {publishBusyId === selectedTemplate.id ? "Publishing…" : "Publish"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="tc-prog-info-grid">
                <section className="tc-prog-info-card">
                  <h3>Schedule</h3>
                  <dl>
                    <div>
                      <dt>Due Time</dt>
                      <dd>{formatTempCheckTime(selectedTemplate.dueTimeLocal)}</dd>
                    </div>
                    <div>
                      <dt>Window</dt>
                      <dd>{formatTempCheckWindow(selectedTemplate)}</dd>
                    </div>
                    <div>
                      <dt>Repeat</dt>
                      <dd>Daily</dd>
                    </div>
                  </dl>
                </section>
                <section className="tc-prog-info-card">
                  <h3>Assignment</h3>
                  <dl>
                    <div>
                      <dt>Scope</dt>
                      <dd>All Locations</dd>
                    </div>
                    <div>
                      <dt>Devices</dt>
                      <dd>{selectedTemplate.isPublished === false ? "Draft — not published" : "Published to linked tablets"}</dd>
                    </div>
                  </dl>
                  <button type="button" className="tc-prog-link-btn" disabled>
                    Manage
                  </button>
                </section>
                <section className="tc-prog-info-card">
                  <h3>Program Settings</h3>
                  <ul className="tc-prog-settings-list">
                    {PROGRAM_SETTINGS.map((setting) => (
                      <li key={setting}>
                        <CheckBadgeIcon />
                        <span>{setting}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="tc-prog-info-card">
                  <h3>Summary</h3>
                  <dl>
                    <div>
                      <dt>Items</dt>
                      <dd>{selectedTemplate.itemCount} Temp Items</dd>
                    </div>
                    <div>
                      <dt>Frequency</dt>
                      <dd>Daily Program</dd>
                    </div>
                    <div>
                      <dt>Window</dt>
                      <dd>{windowDuration}</dd>
                    </div>
                    <div>
                      <dt>Completion</dt>
                      <dd className="tc-prog-muted">No history yet</dd>
                    </div>
                  </dl>
                </section>
              </div>

              {selectedTemplate.description ? (
                <p className="tc-prog-description">{selectedTemplate.description}</p>
              ) : null}

              <section className="tc-prog-items-section">
                <h3>Temperature Items</h3>
                <div className="tc-prog-item-stack">
                  {selectedTemplate.items.map((item) => (
                    <article key={item.id} className="tc-prog-item-card">
                      <div className="tc-prog-item-card-left">
                        <CheckBadgeIcon className="tc-prog-item-check" />
                        <span className="tc-prog-item-cat-icon">
                          <ItemCategoryIcon />
                        </span>
                        <div>
                          <strong>{item.label}</strong>
                          <span>{inferItemCategory(item.label)}</span>
                        </div>
                      </div>
                      <div className="tc-prog-item-range">
                        <span className="tc-prog-item-range-label">Range</span>
                        <strong>{formatTempRange(item.tempMinF, item.tempMaxF)}</strong>
                      </div>
                      <div className="tc-prog-item-actions-col">
                        <span className="tc-prog-item-range-label">Out of range</span>
                        {item.correctiveActions.length > 0 ? (
                          <span className="tc-prog-steps-pill">
                            {item.correctiveActions.length} step{item.correctiveActions.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="tc-prog-steps-pill tc-prog-steps-pill--empty">Not set</span>
                        )}
                      </div>
                      {canManage ? (
                        <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="tc-prog-item-menu" aria-label={`Edit ${item.label}`}>
                          ⋯
                        </Link>
                      ) : null}
                    </article>
                  ))}
                </div>
                {canManage ? (
                  <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="tc-prog-add-item">
                    + Add Temperature Item
                  </Link>
                ) : null}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
