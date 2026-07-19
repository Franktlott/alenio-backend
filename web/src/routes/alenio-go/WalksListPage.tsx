import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  TempsButton,
  TempsDataTable,
  TempsEmptyState,
  TempsPageHeader,
  TempsPageShell,
  TempsStatusBadge,
  TempsToolbar,
  walkStatusTone,
} from "../../components/temps";
import {
  archiveWalkTemplate,
  duplicateWalkTemplate,
  fetchWalkSchedules,
  type WalkSchedule,
} from "../../lib/walks/library-api";
import {
  createWalkTemplate,
  deleteWalkTemplate,
  fetchWalkTemplates,
} from "../../lib/walks/api";
import { summarizeWalkSchedules } from "../../lib/walks/schedule-summary";
import { flattenWalkItems, type WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type StatusFilter = "" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
type ScheduleFilter = "" | "scheduled" | "unscheduled" | "paused";

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

function walkPath(walk: WalkTemplate, tab?: "schedule") {
  if (tab === "schedule") return `/go/temp-checks/walks/${walk.id}?tab=schedule`;
  return `/go/temp-checks/walks/${walk.id}`;
}

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function IconChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function IconMore({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

function IconWalk({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconBuilding({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </svg>
  );
}

export function WalksListPage() {
  const navigate = useNavigate();
  const { canManage, teamId, teamName } = useAlenioGoShell();
  const [walks, setWalks] = useState<WalkTemplate[]>([]);
  const [schedules, setSchedules] = useState<WalkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>("");
  const [workplaceFilter, setWorkplaceFilter] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    const [list, scheduleRows] = await Promise.all([
      fetchWalkTemplates(teamId),
      fetchWalkSchedules(teamId),
    ]);
    setWalks(list);
    setSchedules(scheduleRows);
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

  useEffect(() => {
    if (!menuId) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const schedulesByTemplate = useMemo(() => {
    const map: Record<string, WalkSchedule[]> = {};
    for (const schedule of schedules) {
      if (!map[schedule.templateId]) map[schedule.templateId] = [];
      map[schedule.templateId].push(schedule);
    }
    return map;
  }, [schedules]);

  const workplaceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const walk of walks) {
      const value = walk.workplace?.trim();
      if (value) set.add(value);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [walks]);

  const filteredWalks = useMemo(() => {
    const query = q.trim().toLowerCase();
    return walks.filter((walk) => {
      if (statusFilter && walk.status !== statusFilter) return false;
      if (workplaceFilter && walk.workplace !== workplaceFilter) return false;
      if (query) {
        const haystack = `${walk.name} ${walk.description ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (scheduleFilter) {
        const summary = summarizeWalkSchedules(schedulesByTemplate[walk.id] ?? []);
        if (summary.status !== scheduleFilter) return false;
      }
      return true;
    });
  }, [walks, q, statusFilter, scheduleFilter, workplaceFilter, schedulesByTemplate]);

  const confirmArchiveWalk = useMemo(
    () => walks.find((w) => w.id === confirmArchiveId) ?? null,
    [walks, confirmArchiveId],
  );

  const confirmDeleteWalk = useMemo(
    () => walks.find((w) => w.id === confirmDeleteId) ?? null,
    [walks, confirmDeleteId],
  );

  const listStats = useMemo(() => {
    let draft = 0;
    let published = 0;
    let scheduled = 0;
    for (const walk of walks) {
      if (walk.status === "DRAFT") draft += 1;
      if (walk.status === "PUBLISHED") published += 1;
      const summary = summarizeWalkSchedules(schedulesByTemplate[walk.id] ?? []);
      if (summary.status === "scheduled") scheduled += 1;
    }
    return { draft, published, scheduled };
  }, [walks, schedulesByTemplate]);

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

  async function openEdit(walk: WalkTemplate) {
    if (walk.status === "ARCHIVED") {
      navigate(`/go/temp-checks/walks/${walk.id}`);
      return;
    }
    // Open the walk in the builder. Published walks stay published until the
    // user explicitly saves/publishes changes (Save Draft creates a child draft).
    navigate(`/go/temp-checks/walks/builder/${walk.id}`);
  }

  async function handleDuplicate(walk: WalkTemplate) {
    setMenuId(null);
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateWalkTemplate(teamId!, walk.id);
      navigate(`/go/temp-checks/walks/builder/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate walk.");
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!teamId || !confirmArchiveId) return;
    setBusy(true);
    setError(null);
    try {
      await archiveWalkTemplate(teamId, confirmArchiveId);
      setConfirmArchiveId(null);
      await load();
      showToast("Walk archived");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive walk.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!teamId || !confirmDeleteId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWalkTemplate(teamId, confirmDeleteId);
      setConfirmDeleteId(null);
      await load();
      showToast("Walk deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete walk.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <TempsPageShell testId="walks-list-page" wide className="temps-page--fill">
      <TempsPageHeader
        title="Checklists"
        description="Build reusable checks, schedule them, and publish them to Alenio Temps."
        actions={
          <TempsButton variant="primary" disabled={busy} onClick={() => void createWalk()}>
            + Create checklist
          </TempsButton>
        }
      />

      {toast ? (
        <p className="temps-toast temps-toast--float" role="status">
          {toast}
        </p>
      ) : null}
      {error ? <p className="temps-error">{error}</p> : null}

      <TempsToolbar>
        <label className="wil-search">
          <span className="wil-search-icon">
            <IconSearch />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search walks..."
            aria-label="Search walks"
          />
        </label>

        <label className="wil-select-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Walk status"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <IconChevronDown />
        </label>

        <label className="wil-select-wrap">
          <select
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value as ScheduleFilter)}
            aria-label="Schedule status"
          >
            <option value="">All schedules</option>
            <option value="scheduled">Scheduled</option>
            <option value="unscheduled">Not scheduled</option>
            <option value="paused">Paused</option>
          </select>
          <IconChevronDown />
        </label>

        <label className="wil-select-wrap walks-workplace-select">
          <span className="walks-workplace-ico" aria-hidden>
            <IconBuilding />
          </span>
          <select
            value={workplaceFilter}
            onChange={(e) => setWorkplaceFilter(e.target.value)}
            aria-label="Filter by workplace"
          >
            <option value="">All workplaces</option>
            {workplaceOptions.map((workplace) => (
              <option key={workplace} value={workplace}>
                {workplace}
              </option>
            ))}
          </select>
          <IconChevronDown />
        </label>
      </TempsToolbar>

      {loading ? (
        <EnterprisePageLoading label="Loading walks…" />
      ) : walks.length === 0 ? (
        <TempsDataTable label="Walks" minHeight="short">
          <TempsEmptyState
            icon={<IconWalk size={18} />}
            title="No walks yet"
            description="Create a walk, then add items from your Item Library."
            action={
              <TempsButton variant="primary" disabled={busy} onClick={() => void createWalk()}>
                + Create Walk
              </TempsButton>
            }
          />
        </TempsDataTable>
      ) : (
        <TempsDataTable
          label="Walks"
          footer={
            <>
              <span>
                Showing {filteredWalks.length} of {walks.length} walk
                {walks.length === 1 ? "" : "s"}
              </span>
              <div className="temps-stats-strip" style={{ border: "none", padding: 0, background: "transparent" }}>
                <span>
                  <strong>{listStats.draft}</strong> draft
                </span>
                <span>
                  <strong>{listStats.published}</strong> published
                </span>
                <span>
                  <strong>{listStats.scheduled}</strong> scheduled
                </span>
              </div>
            </>
          }
        >
          <table className="wil-table">
            <thead>
              <tr>
                <th>Walk</th>
                <th>Status</th>
                <th>Items</th>
                <th>Schedule</th>
                <th>Workplace</th>
                <th>Version</th>
                <th>Updated</th>
                <th className="wsch-actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWalks.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <TempsEmptyState
                      compact
                      title="No walks match these filters"
                      description="Try clearing a filter or search term."
                    />
                  </td>
                </tr>
              ) : (
                filteredWalks.map((walk) => {
                  const count = flattenWalkItems(walk).length;
                  const scheduleSummary = summarizeWalkSchedules(
                    schedulesByTemplate[walk.id] ?? [],
                  );
                  return (
                    <tr key={walk.id} onClick={() => navigate(walkPath(walk))}>
                      <td>
                        <div className="wil-item-cell">
                          <span className="temps-row-icon">
                            <IconWalk size={14} />
                          </span>
                          <span className="wil-item-copy">
                            <strong>{walk.name}</strong>
                            <em>{walk.description || "No description"}</em>
                          </span>
                        </div>
                      </td>
                      <td>
                        <TempsStatusBadge tone={walkStatusTone(walk.status)} />
                      </td>
                      <td>
                        {count} item{count === 1 ? "" : "s"}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="wb-linkish"
                          title="Manage schedule"
                          onClick={() => navigate(walkPath(walk, "schedule"))}
                        >
                          {scheduleSummary.status === "scheduled" ? (
                            <TempsStatusBadge tone="active">{scheduleSummary.label}</TempsStatusBadge>
                          ) : scheduleSummary.status === "paused" ? (
                            <TempsStatusBadge tone="paused">{scheduleSummary.label}</TempsStatusBadge>
                          ) : (
                            <span className="temps-muted-status">{scheduleSummary.label}</span>
                          )}
                        </button>
                      </td>
                      <td className="wil-updated">{walk.workplace || "—"}</td>
                      <td>v{walk.version}</td>
                      <td className="wil-updated">{relativeTime(walk.updatedAt)}</td>
                      <td className="wsch-actions-col" onClick={(e) => e.stopPropagation()}>
                        <div className="walks-row-actions">
                          <TempsButton
                            variant="ghost"
                            disabled={busy || walk.status === "ARCHIVED"}
                            onClick={() => void openEdit(walk)}
                          >
                            Edit
                          </TempsButton>
                          <div
                            className="wsch-menu-wrap"
                            ref={menuId === walk.id ? menuRef : undefined}
                          >
                            <button
                              type="button"
                              className="wil-row-menu"
                              aria-label={`Actions for ${walk.name}`}
                              aria-expanded={menuId === walk.id}
                              disabled={busy}
                              onClick={() =>
                                setMenuId((prev) => (prev === walk.id ? null : walk.id))
                              }
                            >
                              <IconMore />
                            </button>
                            {menuId === walk.id ? (
                              <div className="wsch-row-menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy || walk.status === "ARCHIVED"}
                                  onClick={() => {
                                    setMenuId(null);
                                    navigate(walkPath(walk, "schedule"));
                                  }}
                                >
                                  Manage schedule
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={busy}
                                  onClick={() => void handleDuplicate(walk)}
                                >
                                  Duplicate
                                </button>
                                {walk.status !== "ARCHIVED" ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="wsch-row-menu-danger"
                                    onClick={() => {
                                      setMenuId(null);
                                      setConfirmArchiveId(walk.id);
                                    }}
                                  >
                                    Archive
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="wsch-row-menu-danger"
                                  onClick={() => {
                                    setMenuId(null);
                                    setConfirmDeleteId(walk.id);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TempsDataTable>
      )}

      {confirmArchiveWalk ? (
        <div
          className="wsch-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmArchiveId(null)}
        >
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-archive-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-archive-title">Archive walk?</h2>
            </header>
            <p className="wil-subtitle">
              This archives <strong>{confirmArchiveWalk.name}</strong>. Associates will no longer see
              new scheduled occurrences. Existing history is kept.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmArchiveId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void confirmArchive()}
              >
                {busy ? "Archiving…" : "Archive walk"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteWalk ? (
        <div
          className="wsch-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-delete-title">Delete walk?</h2>
            </header>
            <p className="wil-subtitle">
              This permanently deletes <strong>{confirmDeleteWalk.name}</strong> and its draft
              content. Published history may remain on completed runs.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? "Deleting…" : "Delete walk"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </TempsPageShell>
  );
}
