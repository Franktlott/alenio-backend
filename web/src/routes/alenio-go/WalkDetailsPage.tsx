import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  TempsButton,
  TempsPageHeader,
  TempsPageShell,
  TempsStatusBadge,
  TempsSummaryBar,
  useTempsNotice,
  walkStatusTone,
} from "../../components/temps";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import {
  WalkScheduleForm,
  defaultScheduleFormValue,
  findDraftWindowOverlapError,
  parseIntervalWindow,
  parseWindows,
  scheduleToFormValue,
  type WalkScheduleFormValue,
} from "../../components/walk-builder/WalkScheduleForm";
import { deleteWalkTemplate, fetchWalkTemplate } from "../../lib/walks/api";
import {
  archiveWalkTemplate,
  createDraftFromPublished,
  createWalkSchedule,
  deleteWalkSchedule,
  duplicateWalkTemplate,
  fetchWalkOccurrences,
  fetchWalkSchedules,
  fetchWalkTemplateVersions,
  updateWalkSchedule,
  type WalkOccurrenceRow,
  type WalkSchedule,
} from "../../lib/walks/library-api";
import {
  assignScopeLabel,
  formatScheduleSummary,
  summarizeWalkSchedules,
} from "../../lib/walks/schedule-summary";
import { flattenWalkItems, type WalkItemType, type WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type TabId = "overview" | "items" | "schedule" | "assignment" | "history";
type ScheduleModalMode = "create" | "edit" | null;

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function nextRunLabel(occurrences: WalkOccurrenceRow[]) {
  const next = occurrences
    .filter((o) => o.status === "UPCOMING" || o.status === "AVAILABLE" || o.status === "IN_PROGRESS")
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())[0];
  if (!next) return "—";

  const start = new Date(next.windowStart);
  const now = new Date();
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${start.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
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

function scheduleWriteBody(value: WalkScheduleFormValue, checklistName: string) {
  const windows =
    value.recurrence === "INTERVAL"
      ? parseIntervalWindow(
          value.intervalDayStart,
          value.windows[0]?.due ?? "22:00",
          value.windows[0]?.afterMinutes ?? 0,
        )
      : parseWindows(value.windows);
  return {
    name: checklistName.trim() || null,
    recurrence: value.recurrence,
    daysOfWeek: value.recurrence === "WEEKLY" ? value.daysOfWeek : null,
    intervalMinutes: value.recurrence === "INTERVAL" ? value.intervalMinutes : null,
    timezone: value.timezone,
    assignScope: value.assignScope,
    assignRole: value.assignRole.trim() || null,
    completionMode: value.completionMode,
    windows,
  };
}

function tabFromSearch(value: string | null): TabId {
  if (
    value === "overview" ||
    value === "items" ||
    value === "schedule" ||
    value === "assignment" ||
    value === "history"
  ) {
    return value;
  }
  return "overview";
}

export function WalkDetailsPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canManage, teamId } = useAlenioGoShell();

  const [template, setTemplate] = useState<WalkTemplate | null>(null);
  const [schedules, setSchedules] = useState<WalkSchedule[]>([]);
  const [versions, setVersions] = useState<
    Array<{ id: string; version: number; publishedAt: string; publishedByUserId: string | null }>
  >([]);
  const [occurrences, setOccurrences] = useState<WalkOccurrenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { showNotice, noticeDialog } = useTempsNotice();
  const [tab, setTab] = useState<TabId>(() => tabFromSearch(searchParams.get("tab")));
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  useEffect(() => {
    setTab(tabFromSearch(searchParams.get("tab")));
  }, [searchParams]);

  function selectTab(next: TabId) {
    setTab(next);
    if (next === "overview") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  }
  const [scheduleModal, setScheduleModal] = useState<ScheduleModalMode>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<WalkScheduleFormValue>(defaultScheduleFormValue());
  const [assignmentScheduleId, setAssignmentScheduleId] = useState<string | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<WalkScheduleFormValue>(defaultScheduleFormValue());
  const [confirmDeleteWalk, setConfirmDeleteWalk] = useState(false);
  const [confirmArchiveWalk, setConfirmArchiveWalk] = useState(false);
  const [confirmDeleteScheduleId, setConfirmDeleteScheduleId] = useState<string | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    if (!teamId || !templateId) return;
    setError(null);
    const from = new Date().toISOString();
    const tpl = await fetchWalkTemplate(teamId, templateId);
    setTemplate(tpl);

    const [scheduleRows, versionRows, occurrenceRows] = await Promise.all([
      fetchWalkSchedules(teamId, templateId).catch(() => [] as WalkSchedule[]),
      fetchWalkTemplateVersions(teamId, templateId).catch(
        () =>
          [] as Array<{
            id: string;
            version: number;
            publishedAt: string;
            publishedByUserId: string | null;
          }>,
      ),
      fetchWalkOccurrences(teamId, { templateId, from }).catch(() => [] as WalkOccurrenceRow[]),
    ]);
    setSchedules(scheduleRows);
    setVersions(versionRows);
    setOccurrences(occurrenceRows);
    setAssignmentScheduleId((prev) => {
      if (prev && scheduleRows.some((s) => s.id === prev)) return prev;
      return scheduleRows.find((s) => s.isActive)?.id ?? scheduleRows[0]?.id ?? null;
    });
  }, [teamId, templateId]);

  useEffect(() => {
    if (!canManage || !teamId || !templateId) return;
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load walk.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, templateId, load]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [headerMenuOpen]);

  const items = useMemo(() => (template ? flattenWalkItems(template) : []), [template]);
  const scheduleSummary = useMemo(() => summarizeWalkSchedules(schedules), [schedules]);
  const primarySchedule = useMemo(
    () => schedules.find((s) => s.id === assignmentScheduleId) ?? schedules.find((s) => s.isActive) ?? schedules[0] ?? null,
    [schedules, assignmentScheduleId],
  );

  useEffect(() => {
    if (!primarySchedule) return;
    setAssignmentForm(scheduleToFormValue(primarySchedule));
  }, [primarySchedule]);

  const confirmDeleteSchedule = useMemo(
    () => schedules.find((s) => s.id === confirmDeleteScheduleId) ?? null,
    [schedules, confirmDeleteScheduleId],
  );

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  if (!templateId) {
    return <Navigate to="/go/temp-checks/walks" replace />;
  }

  function openCreateSchedule() {
    setEditingScheduleId(null);
    setScheduleForm(defaultScheduleFormValue());
    setScheduleModal("create");
  }

  function openEditSchedule(schedule: WalkSchedule) {
    setEditingScheduleId(schedule.id);
    setScheduleForm(scheduleToFormValue(schedule));
    setScheduleModal("edit");
  }

  function closeScheduleModal() {
    setScheduleModal(null);
    setEditingScheduleId(null);
  }

  async function submitScheduleModal() {
    if (!teamId || !template) return;
    const body = scheduleWriteBody(scheduleForm, template.name);
    if (!body.windows.length) {
      showNotice({
        title: "Due time required",
        message: "Add at least one valid due time and completion window before saving.",
        tone: "warning",
      });
      return;
    }
    const overlapError =
      scheduleForm.recurrence === "INTERVAL"
        ? null
        : findDraftWindowOverlapError(scheduleForm.windows);
    if (overlapError) {
      showNotice({
        title: "Overlapping due times",
        message: overlapError,
        tone: "warning",
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (scheduleModal === "create") {
        await createWalkSchedule(teamId, {
          templateId: template.id,
          ...body,
          windows: body.windows,
        });
        showToast("Schedule created");
      } else if (scheduleModal === "edit" && editingScheduleId) {
        await updateWalkSchedule(teamId, editingScheduleId, body);
        showToast("Schedule updated");
      }
      closeScheduleModal();
      await load();
      selectTab("schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleScheduleActive(schedule: WalkSchedule) {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    try {
      await updateWalkSchedule(teamId, schedule.id, { isActive: !schedule.isActive });
      await load();
      showToast(schedule.isActive ? "Schedule paused" : "Schedule resumed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteScheduleAction() {
    if (!teamId || !confirmDeleteScheduleId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWalkSchedule(teamId, confirmDeleteScheduleId);
      setConfirmDeleteScheduleId(null);
      await load();
      showToast("Schedule deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment() {
    if (!teamId || !primarySchedule) return;
    setBusy(true);
    setError(null);
    try {
      await updateWalkSchedule(teamId, primarySchedule.id, {
        assignScope: assignmentForm.assignScope,
        assignRole: assignmentForm.assignRole.trim() || null,
        completionMode: assignmentForm.completionMode,
      });
      await load();
      showToast("Assignment updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update assignment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    if (!teamId || !template) return;
    setHeaderMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateWalkTemplate(teamId, template.id);
      navigate(`/go/temp-checks/walks/builder/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate walk.");
      setBusy(false);
    }
  }

  async function handleCreateDraft() {
    if (!teamId || !template) return;
    setHeaderMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      const draft = await createDraftFromPublished(teamId, template.id);
      navigate(`/go/temp-checks/walks/builder/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create draft.");
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!teamId || !template) return;
    setBusy(true);
    setError(null);
    try {
      await archiveWalkTemplate(teamId, template.id);
      setConfirmArchiveWalk(false);
      await load();
      showToast("Walk archived");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive walk.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWalk() {
    if (!teamId || !template) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWalkTemplate(teamId, template.id);
      navigate("/go/temp-checks/walks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete walk.");
      setBusy(false);
    }
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "items", label: "Items" },
    { id: "schedule", label: "Schedule" },
    { id: "assignment", label: "Assignment" },
    { id: "history", label: "History" },
  ];

  return (
    <TempsPageShell testId="walk-details-page" wide className="wsch-shell">
        {noticeDialog}
        {loading ? (
          <EnterprisePageLoading label="Loading walk…" />
        ) : !template ? (
          <div className="temps-stack" style={{ gap: "0.75rem" }}>
            <p className="temps-error">{error || "Walk not found."}</p>
            <TempsButton variant="secondary" onClick={() => navigate("/go/temp-checks/walks")}>
              ← Back to Walks
            </TempsButton>
          </div>
        ) : (
          <>
            <TempsPageHeader
              breadcrumb={
                <>
                  <Link to="/go/temp-checks/walks">Walks</Link>
                  <span aria-hidden>/</span>
                  <span>{template.name}</span>
                </>
              }
              title={template.name}
              description={template.description || undefined}
              badges={
                <>
                  <TempsStatusBadge tone={walkStatusTone(template.status)} />
                  <TempsStatusBadge tone="neutral">{`Version ${template.version}`}</TempsStatusBadge>
                </>
              }
              actions={
                <>
                  <TempsButton
                    variant="primary"
                    disabled={busy || template.status === "ARCHIVED"}
                    onClick={() => navigate(`/go/temp-checks/walks/builder/${template.id}`)}
                  >
                    Edit Walk
                  </TempsButton>
                  <div className="wsch-menu-wrap" ref={headerMenuRef}>
                    <TempsButton
                      variant="icon"
                      aria-label="More actions"
                      aria-expanded={headerMenuOpen}
                      disabled={busy}
                      onClick={() => setHeaderMenuOpen((open) => !open)}
                    >
                      <IconMore />
                    </TempsButton>
                    {headerMenuOpen ? (
                      <div className="wsch-row-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={() => void handleDuplicate()}
                        >
                          Duplicate
                        </button>
                        {template.status === "PUBLISHED" ? (
                          <button
                            type="button"
                            role="menuitem"
                            disabled={busy}
                            onClick={() => void handleCreateDraft()}
                          >
                            Edit as draft
                          </button>
                        ) : null}
                        {template.status !== "ARCHIVED" ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="wsch-row-menu-danger"
                            onClick={() => {
                              setHeaderMenuOpen(false);
                              setConfirmArchiveWalk(true);
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
                            setHeaderMenuOpen(false);
                            setConfirmDeleteWalk(true);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              }
            />

            <TempsSummaryBar
              items={[
                {
                  label: "Items",
                  value: `${items.length} item${items.length === 1 ? "" : "s"}`,
                },
                {
                  label: "Duration",
                  value:
                    template.estimatedDurationMinutes != null
                      ? `${template.estimatedDurationMinutes} minutes`
                      : "—",
                },
                { label: "Schedule", value: scheduleSummary.label },
                {
                  label: "Assignment",
                  value: primarySchedule ? assignScopeLabel(primarySchedule) : "Not set",
                },
                { label: "Updated", value: formatDateTime(template.updatedAt) },
              ]}
            />

            <div className="temps-builder-tabs" role="tablist" aria-label="Walk details">
              {tabs.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`temps-builder-tab${tab === id ? " is-active" : ""}`}
                  onClick={() => selectTab(id)}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {toast ? <p className="wil-toast">{toast}</p> : null}
            {error ? <p className="wil-error">{error}</p> : null}

            {tab === "overview" ? (
              <section className="wsch-day-card" aria-label="Walk overview">
                <dl className="wil-preview-block" style={{ display: "grid", gap: "0.85rem", margin: 0 }}>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Description</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{template.description || "—"}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Workplace</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{template.workplace || "—"}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Items</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{items.length}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Schedule</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{scheduleSummary.label}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Assignment</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>
                      {primarySchedule ? assignScopeLabel(primarySchedule) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Last published</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{formatDateTime(template.publishedAt)}</dd>
                  </div>
                  <div>
                    <dt style={{ fontWeight: 700, fontSize: "0.78rem", color: "#64748b" }}>Next run</dt>
                    <dd style={{ margin: "0.2rem 0 0" }}>{nextRunLabel(occurrences)}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {tab === "items" ? (
              <section className="wil-table-card" aria-label="Walk items">
                {items.length === 0 ? (
                  <p className="wil-muted" style={{ padding: "1.25rem" }}>
                    No items yet. Open the builder to add items from your library.
                  </p>
                ) : (
                  <div className="wil-table-wrap">
                    <table className="wil-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Type</th>
                          <th>Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <div className="wil-item-cell">
                                <span className="wil-item-icon wil-item-icon--temp">
                                  <WalkTypeIcon type={item.type as WalkItemType} size={18} />
                                </span>
                                <span className="wil-item-copy">
                                  <strong>{item.title}</strong>
                                  {item.description ? <em>{item.description}</em> : null}
                                </span>
                              </div>
                            </td>
                            <td>{item.type.replace(/_/g, " ")}</td>
                            <td>{item.required ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            {tab === "schedule" ? (
              <section aria-label="Walk schedules">
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                  <button
                    type="button"
                    className="wil-btn wil-btn--primary"
                    disabled={busy || template.status !== "PUBLISHED"}
                    onClick={openCreateSchedule}
                  >
                    Add schedule
                  </button>
                </div>
                {template.status !== "PUBLISHED" ? (
                  <p className="wil-muted">Publish this walk before adding schedules.</p>
                ) : null}
                <section className="wil-table-card wsch-table-card">
                  <div className="wil-table-wrap">
                    <table className="wil-table wsch-table">
                      <thead>
                        <tr>
                          <th>Checklist</th>
                          <th>Due times</th>
                          <th>Status</th>
                          <th className="wsch-actions-col">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedules.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="wil-empty">
                              No schedules yet. Add one to open this walk for associates.
                            </td>
                          </tr>
                        ) : (
                          schedules.map((schedule) => (
                            <tr key={schedule.id}>
                              <td>{template.name}</td>
                              <td>
                                <span className="wsch-meta">{formatScheduleSummary(schedule)}</span>
                              </td>
                              <td>
                                <span
                                  className={`wsch-status ${
                                    schedule.isActive ? "wsch-status--active" : "wsch-status--paused"
                                  }`}
                                >
                                  {schedule.isActive ? "Active" : "Paused"}
                                </span>
                              </td>
                              <td className="wsch-actions-col">
                                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className="wil-btn wil-btn--secondary"
                                    disabled={busy}
                                    onClick={() => openEditSchedule(schedule)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="wil-btn wil-btn--secondary"
                                    disabled={busy}
                                    onClick={() => void toggleScheduleActive(schedule)}
                                  >
                                    {schedule.isActive ? "Pause" : "Resume"}
                                  </button>
                                  <button
                                    type="button"
                                    className="wil-btn wil-btn--secondary"
                                    disabled={busy}
                                    onClick={() => setConfirmDeleteScheduleId(schedule.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </section>
            ) : null}

            {tab === "assignment" ? (
              <section className="wsch-day-card" aria-label="Walk assignment">
                {schedules.length === 0 ? (
                  <p className="wil-muted">
                    Add a schedule to assign who must complete it.{" "}
                    <button type="button" className="wb-linkish" onClick={() => selectTab("schedule")}>
                      Go to Schedule
                    </button>
                  </p>
                ) : (
                  <>
                    {schedules.length > 1 ? (
                      <label style={{ display: "block", marginBottom: "1rem" }}>
                        Schedule
                        <select
                          value={assignmentScheduleId ?? ""}
                          onChange={(e) => setAssignmentScheduleId(e.target.value)}
                        >
                          {schedules.map((schedule) => (
                            <option key={schedule.id} value={schedule.id}>
                              {schedule.name?.trim() || template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <WalkScheduleForm
                      value={assignmentForm}
                      onChange={setAssignmentForm}
                      showAssignment
                      disabled={busy}
                      checklistName={template.name}
                    />
                    <footer style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="wil-btn wil-btn--primary"
                        disabled={busy || !primarySchedule}
                        onClick={() => void saveAssignment()}
                      >
                        {busy ? "Saving…" : "Save assignment"}
                      </button>
                    </footer>
                  </>
                )}
              </section>
            ) : null}

            {tab === "history" ? (
              <section className="wil-table-card" aria-label="Version history">
                <div className="wil-table-wrap">
                  <table className="wil-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Published</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="wil-empty">
                            No published versions yet.
                          </td>
                        </tr>
                      ) : (
                        versions
                          .slice()
                          .sort((a, b) => b.version - a.version)
                          .map((row) => (
                            <tr key={row.id}>
                              <td>v{row.version}</td>
                              <td>{formatDateTime(row.publishedAt)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        )}

      {scheduleModal ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={closeScheduleModal}>
          <div
            className="wsch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-schedule-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-schedule-modal-title">
                {scheduleModal === "edit" ? "Edit schedule" : "Add schedule"}
              </h2>
              <button type="button" className="wil-row-menu" onClick={closeScheduleModal} aria-label="Close">
                ✕
              </button>
            </header>
            <p className="wil-subtitle">
              {scheduleModal === "edit"
                ? "Update when associates must complete this walk."
                : "Set when this walk opens for associates in Alenio Temps."}
            </p>
            <WalkScheduleForm
              value={scheduleForm}
              onChange={setScheduleForm}
              disabled={busy}
              checklistName={template?.name}
            />
            <footer className="wsch-modal-foot">
              <button type="button" className="wil-btn wil-btn--secondary" onClick={closeScheduleModal}>
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wil-btn--primary"
                disabled={
                  busy ||
                  (scheduleForm.recurrence !== "INTERVAL" &&
                    !!findDraftWindowOverlapError(scheduleForm.windows))
                }
                onClick={() => void submitScheduleModal()}
              >
                {busy ? "Saving…" : scheduleModal === "edit" ? "Save changes" : "Create schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteSchedule ? (
        <div
          className="wsch-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmDeleteScheduleId(null)}
        >
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-schedule-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-schedule-delete-title">Delete schedule?</h2>
            </header>
            <p className="wil-subtitle">
              This removes{" "}
              <strong>{confirmDeleteSchedule.name?.trim() || template?.name || "this schedule"}</strong>{" "}
              and its upcoming open occurrences.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmDeleteScheduleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void confirmDeleteScheduleAction()}
              >
                {busy ? "Deleting…" : "Delete schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmArchiveWalk && template ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={() => setConfirmArchiveWalk(false)}>
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-details-archive-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-details-archive-title">Archive walk?</h2>
            </header>
            <p className="wil-subtitle">
              This archives <strong>{template.name}</strong>. Associates will no longer see new
              scheduled occurrences.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmArchiveWalk(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void handleArchive()}
              >
                {busy ? "Archiving…" : "Archive walk"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteWalk && template ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={() => setConfirmDeleteWalk(false)}>
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="walk-details-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="walk-details-delete-title">Delete walk?</h2>
            </header>
            <p className="wil-subtitle">
              This permanently deletes <strong>{template.name}</strong>.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmDeleteWalk(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void handleDeleteWalk()}
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
