import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TempCheckEquipmentRow, TempCheckTemplateRow } from "../../lib/api";
import {
  deleteTeamTempCheckEquipment,
  deleteTeamTempCheckTemplate,
  fetchTeamTempCheckEquipment,
  fetchTeamTempCheckTemplates,
  postTeamTempCheckPublish,
  postTeamTempCheckUnpublish,
} from "../../lib/api";
import {
  formatWindowDuration,
  inferItemCategory,
  inferProgramIcon,
  programStatusDotClass,
} from "../../lib/temp-checks-program-helpers";
import { formatTempCheckTime, formatTempCheckWindow, formatTempRange } from "../../lib/temp-checks-display";
import { CheckBadgeIcon, ItemCategoryIcon, ProgramIcon } from "./TempCheckProgramIcons";

type Props = {
  teamId: string;
  canManage: boolean;
  initialTemplateId?: string;
  initialEquipmentId?: string;
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
          {template.isPublished === false ? (
            <Link to={`/go/temp-checks/${template.id}/edit`} className="tc-prog-overflow-item" role="menuitem" onClick={() => setOpen(false)}>
              Edit
            </Link>
          ) : null}
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

export function TempCheckWorkspace({ teamId, canManage, initialTemplateId, initialEquipmentId }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TempCheckTemplateRow[]>([]);
  const [equipment, setEquipment] = useState<TempCheckEquipmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialEquipmentId ? null : (initialTemplateId ?? null));
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(initialEquipmentId ?? null);
  const [search, setSearch] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingEquipmentId, setDeletingEquipmentId] = useState<string | null>(null);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void Promise.all([fetchTeamTempCheckTemplates(teamId), fetchTeamTempCheckEquipment(teamId)])
      .then(([templateData, equipmentData]) => {
        setTemplates(templateData.templates);
        setEquipment(equipmentData.equipment);
        setSelectedTemplateId((prev) => {
          if (initialEquipmentId) return null;
          if (prev && templateData.templates.some((t) => t.id === prev)) return prev;
          if (initialTemplateId && templateData.templates.some((t) => t.id === initialTemplateId)) return initialTemplateId;
          return templateData.templates[0]?.id ?? null;
        });
        setSelectedEquipmentId((prev) => {
          if (initialTemplateId) return null;
          if (prev && equipmentData.equipment.some((row) => row.id === prev)) return prev;
          if (initialEquipmentId && equipmentData.equipment.some((row) => row.id === initialEquipmentId)) return initialEquipmentId;
          return null;
        });
      })
      .catch(() => {
        setTemplates([]);
        setEquipment([]);
      })
      .finally(() => setLoading(false));
  }, [teamId, initialTemplateId, initialEquipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!initialTemplateId) return;
    if (templates.some((t) => t.id === initialTemplateId)) {
      setSelectedTemplateId(initialTemplateId);
      setSelectedEquipmentId(null);
    }
  }, [initialTemplateId, templates]);

  useEffect(() => {
    if (!initialEquipmentId) return;
    if (equipment.some((row) => row.id === initialEquipmentId)) {
      setSelectedEquipmentId(initialEquipmentId);
      setSelectedTemplateId(null);
    }
  }, [initialEquipmentId, equipment]);

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

  const filteredEquipment = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return equipment;
    return equipment.filter((row) => row.name.toLowerCase().includes(q));
  }, [equipment, equipmentSearch]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const selectedEquipment = equipment.find((row) => row.id === selectedEquipmentId) ?? null;
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

  async function handleDeleteEquipment(row: TempCheckEquipmentRow) {
    if (!window.confirm(`Delete "${row.name}"? Programs already built keep their saved items, but new programs will no longer pull this standard.`)) return;
    setDeletingEquipmentId(row.id);
    try {
      await deleteTeamTempCheckEquipment(teamId, row.id);
      setEquipment((prev) => {
        const next = prev.filter((item) => item.id !== row.id);
        setSelectedEquipmentId((selected) => (selected === row.id ? (next[0]?.id ?? null) : selected));
        return next;
      });
      if (initialEquipmentId === row.id) navigate("/go/temp-checks", { replace: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete equipment.");
    } finally {
      setDeletingEquipmentId(null);
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

          {loading && templates.length === 0 ? (
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
                        setSelectedEquipmentId(null);
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
                      <span
                        className={`tc-prog-card-pill${
                          template.isPublished === false ? " tc-prog-card-pill--draft" : " tc-prog-card-pill--live"
                        }`}
                      >
                        {template.isPublished === false ? "Draft" : "Live"}
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

          <section className="tc-prog-sidebar-section tc-prog-sidebar-section--equipment">
            <div className="tc-prog-sidebar-section-head">
              <h2 className="tc-prog-sidebar-title">Equipment Standards</h2>
              {canManage ? (
                <Link to="/go/temp-checks/equipment/new" className="tc-prog-sidebar-add" aria-label="Add equipment">
                  +
                </Link>
              ) : null}
            </div>
            <p className="tc-prog-sidebar-copy">Temperature ranges and corrective actions used when building programs.</p>
            <label className="tc-prog-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                type="search"
                value={equipmentSearch}
                placeholder="Search equipment..."
                onChange={(e) => setEquipmentSearch(e.target.value)}
                aria-label="Search equipment"
              />
            </label>

            {loading && equipment.length === 0 ? (
              <p className="tc-prog-empty">Loading equipment…</p>
            ) : filteredEquipment.length === 0 ? (
              <div className="tc-prog-empty">
                <p>{equipment.length === 0 ? "No equipment standards yet." : "No equipment matches your search."}</p>
                {canManage && equipment.length === 0 ? (
                  <Link to="/go/temp-checks/equipment/new" className="tc-prog-btn-primary tc-prog-btn-primary--small">
                    + Add equipment
                  </Link>
                ) : null}
              </div>
            ) : (
              <ul className="tc-prog-list tc-prog-list--equipment">
                {filteredEquipment.map((row) => {
                  const active = selectedEquipmentId === row.id;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={`tc-prog-card tc-prog-card--equipment${active ? " tc-prog-card--active" : ""}`}
                        onClick={() => {
                          setSelectedEquipmentId(row.id);
                          setSelectedTemplateId(null);
                          navigate(`/go/temp-checks/equipment/${row.id}`);
                        }}
                      >
                        <span className="tc-prog-card-icon tc-prog-card-icon--cooler">
                          <ItemCategoryIcon />
                        </span>
                        <span className="tc-prog-card-body">
                          <span className="tc-prog-card-name">{row.name}</span>
                          <span className="tc-prog-card-schedule">{formatTempRange(row.tempMinF, row.tempMaxF)}</span>
                        </span>
                        <span className="tc-prog-card-pill tc-prog-card-pill--equipment">
                          {row.actionCount} step{row.actionCount === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>

        <main className="tc-prog-detail">
          {selectedEquipment ? (
            <div className="tc-prog-detail-panel">
              <header className="tc-prog-detail-head">
                <div className="tc-prog-detail-head-main">
                  <span className="tc-prog-detail-icon tc-prog-detail-icon--cooler">
                    <ItemCategoryIcon />
                  </span>
                  <div>
                    <div className="tc-prog-detail-title-row">
                      <h2>{selectedEquipment.name}</h2>
                      <span className="tc-prog-status-badge tc-prog-status-badge--live">Standard</span>
                    </div>
                    <div className="tc-prog-detail-meta">
                      <span>{formatTempRange(selectedEquipment.tempMinF, selectedEquipment.tempMaxF)}</span>
                      <span className="tc-prog-meta-sep" aria-hidden>·</span>
                      <span>{selectedEquipment.actionCount} corrective step{selectedEquipment.actionCount === 1 ? "" : "s"}</span>
                      <span className="tc-prog-meta-sep" aria-hidden>·</span>
                      <span className="tc-prog-deploy-hint">Used when building temperature programs</span>
                    </div>
                  </div>
                </div>
                {canManage ? (
                  <div className="tc-prog-detail-actions">
                    <Link to={`/go/temp-checks/equipment/${selectedEquipment.id}/edit`} className="tc-prog-btn-ghost">
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="tc-prog-btn-ghost tc-prog-btn-ghost--danger"
                      disabled={deletingEquipmentId === selectedEquipment.id}
                      onClick={() => void handleDeleteEquipment(selectedEquipment)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </header>

              <div className="tc-prog-info-grid">
                <section className="tc-prog-info-card">
                  <h3>Temperature standard</h3>
                  <dl>
                    <div>
                      <dt>Range</dt>
                      <dd>{formatTempRange(selectedEquipment.tempMinF, selectedEquipment.tempMaxF)}</dd>
                    </div>
                    <div>
                      <dt>Min °F</dt>
                      <dd>{selectedEquipment.tempMinF ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Max °F</dt>
                      <dd>{selectedEquipment.tempMaxF ?? "—"}</dd>
                    </div>
                  </dl>
                </section>
                <section className="tc-prog-info-card">
                  <h3>Usage</h3>
                  <dl>
                    <div>
                      <dt>Programs</dt>
                      <dd>Selected when building check items</dd>
                    </div>
                    <div>
                      <dt>Corrective steps</dt>
                      <dd>{selectedEquipment.actionCount} configured</dd>
                    </div>
                  </dl>
                </section>
              </div>

              <section className="tc-prog-items-section">
                <h3>Corrective action steps</h3>
                {selectedEquipment.correctiveActions.length > 0 ? (
                  <ol className="tc-equipment-step-list">
                    {selectedEquipment.correctiveActions.map((action, index) => (
                      <li key={action.id}>
                        <span className="tc-equipment-step-index">{index + 1}</span>
                        <span>{action.label}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="enterprise-muted">No corrective steps configured yet.</p>
                )}
              </section>
            </div>
          ) : !selectedTemplate ? (
            <div className="tc-prog-detail-empty">
              <h2>Select a program or equipment standard</h2>
              <p>Choose a temperature program or equipment standard on the left to review details.</p>
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
                        <span className="tc-prog-status-badge tc-prog-status-badge--live">Live</span>
                      ) : (
                        <span className="tc-prog-status-badge tc-prog-status-badge--draft">Draft</span>
                      )}
                    </div>
                    <div className="tc-prog-detail-meta">
                      <span>{formatTempCheckTime(selectedTemplate.dueTimeLocal)}</span>
                      <span className="tc-prog-meta-sep" aria-hidden>·</span>
                      <span>Window {formatTempCheckWindow(selectedTemplate)}</span>
                      <span className="tc-prog-meta-sep" aria-hidden>·</span>
                      <span>{selectedTemplate.itemCount} items</span>
                      <span className="tc-prog-meta-sep" aria-hidden>·</span>
                      <span className="tc-prog-deploy-hint">
                        {selectedTemplate.isPublished !== false
                          ? "Deployed to linked tablets · unpublish to edit"
                          : "Not deployed to floor devices"}
                      </span>
                    </div>
                  </div>
                </div>
                {canManage ? (
                  <div className="tc-prog-detail-actions">
                    {selectedTemplate.isPublished !== false ? (
                      <button
                        type="button"
                        className="tc-prog-btn-offline"
                        disabled={publishBusyId === selectedTemplate.id}
                        onClick={() => void handleUnpublish(selectedTemplate)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                        {publishBusyId === selectedTemplate.id ? "Taking offline…" : "Unpublish"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tc-prog-btn-deploy"
                        disabled={publishBusyId === selectedTemplate.id}
                        onClick={() => void handlePublish(selectedTemplate)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M12 3v12M7 8l5-5 5 5" />
                          <path d="M5 21h14" />
                        </svg>
                        {publishBusyId === selectedTemplate.id ? "Publishing…" : "Publish"}
                      </button>
                    )}
                    <span className="tc-prog-action-divider" aria-hidden />
                    {selectedTemplate.isPublished === false ? (
                      <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="tc-prog-btn-ghost">
                        Edit
                      </Link>
                    ) : null}
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
                      <dd>{selectedTemplate.isPublished === false ? "Not deployed" : "Live on tablets"}</dd>
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
                      {canManage && selectedTemplate.isPublished === false ? (
                        <Link to={`/go/temp-checks/${selectedTemplate.id}/edit`} className="tc-prog-item-menu" aria-label={`Edit ${item.label}`}>
                          ⋯
                        </Link>
                      ) : null}
                    </article>
                  ))}
                </div>
                {canManage && selectedTemplate.isPublished === false ? (
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
