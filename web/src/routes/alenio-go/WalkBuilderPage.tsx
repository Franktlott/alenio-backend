import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import {
  TempsBuilderTabs,
  TempsButton,
  TempsPageHeader,
  TempsPageShell,
  TempsSectionCard,
  TempsStatusBadge,
  TempsSummaryBar,
  useTempsNotice,
  walkStatusTone,
} from "../../components/temps";
import { WalkItemEditDrawer } from "../../components/walk-builder/WalkItemEditDrawer";
import {
  defaultScheduleFormValue,
  parseWindows,
  scheduleToFormValue,
  WalkScheduleForm,
  type WalkScheduleFormValue,
} from "../../components/walk-builder/WalkScheduleForm";
import { WalkTypeIcon } from "../../components/walk-builder/WalkItemIcons";
import {
  createWalkTemplate,
  deleteWalkItem,
  fetchWalkTemplate,
  fetchWalkTemplates,
  patchWalkItem,
  patchWalkTemplate,
  reorderWalkItems,
} from "../../lib/walks/api";
import { WALK_PALETTE_CARDS } from "../../lib/walks/item-catalog";
import {
  addLibraryItemToWalk,
  createDraftFromPublished,
  createWalkSchedule,
  deleteWalkSchedule,
  fetchLibraryItems,
  fetchOutdatedWalkItems,
  fetchWalkSchedules,
  publishWalk,
  updateWalkSchedule,
  type WalkLibraryItem,
  type WalkSchedule,
} from "../../lib/walks/library-api";
import {
  assignScopeLabel,
  formatScheduleSummary,
  summarizeWalkSchedules,
} from "../../lib/walks/schedule-summary";
import { flattenWalkItems, isPhase2ItemType, type WalkItem, type WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

const BUILDER_STEPS = [
  { id: "details", label: "Details", hint: "Name and walk info" },
  { id: "items", label: "Items", hint: "Add from Item Library" },
  { id: "schedule", label: "Schedule", hint: "When the walk is due" },
  { id: "assignment", label: "Assignment", hint: "Who completes it" },
  { id: "review", label: "Review & Publish", hint: "Validate and publish" },
] as const;

type StepId = (typeof BUILDER_STEPS)[number]["id"];
type ScheduleModalMode = "create" | "edit";

function typeLabel(type: string) {
  return WALK_PALETTE_CARDS.find((c) => c.type === type)?.label ?? type;
}

function getPublishValidation(name: string, itemCount: number, schedules: WalkSchedule[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!name.trim()) errors.push("Walk name is required.");
  if (itemCount === 0) errors.push("Add at least one item before publishing.");
  const activeSchedules = schedules.filter((s) => s.isActive);
  if (activeSchedules.length === 0) {
    warnings.push("No active schedule — associates won't see this walk on a cadence.");
  }
  const hasCustomAssignment = activeSchedules.some(
    (s) => s.assignScope !== "WORKSPACE" || Boolean(s.assignRole?.trim()),
  );
  if (activeSchedules.length > 0 && !hasCustomAssignment) {
    warnings.push("Using default assignment (all associates).");
  }
  return { errors, warnings, canPublish: errors.length === 0 };
}

function scheduleWriteBody(form: WalkScheduleFormValue) {
  const windows = parseWindows(form.windows, form.graceMinutes);
  return {
    name: form.name.trim() || null,
    recurrence: form.recurrence,
    daysOfWeek: form.recurrence === "WEEKLY" ? form.daysOfWeek : null,
    intervalMinutes: form.recurrence === "INTERVAL" ? form.intervalMinutes : null,
    timezone: form.timezone,
    assignScope: form.assignScope,
    assignRole: form.assignScope === "ROLE" ? form.assignRole.trim() || null : null,
    completionMode: form.completionMode,
    windows,
  };
}

export function WalkBuilderPage() {
  const { templateId: routeTemplateId } = useParams();
  const navigate = useNavigate();
  const { canManage, teamId, teamName } = useAlenioGoShell();

  const [template, setTemplate] = useState<WalkTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { showNotice, noticeDialog } = useTempsNotice();
  const [step, setStep] = useState<StepId>("details");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<WalkItem | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [workplaceDraft, setWorkplaceDraft] = useState("");
  const [estimatedDurationDraft, setEstimatedDurationDraft] = useState<number | "">(15);
  const [libraryItems, setLibraryItems] = useState<WalkLibraryItem[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState("");
  const [schedules, setSchedules] = useState<WalkSchedule[]>([]);
  const [scheduleModalMode, setScheduleModalMode] = useState<ScheduleModalMode | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleFormValue, setScheduleFormValue] = useState<WalkScheduleFormValue>(defaultScheduleFormValue);
  const [confirmDeleteScheduleId, setConfirmDeleteScheduleId] = useState<string | null>(null);
  const [assignmentScheduleId, setAssignmentScheduleId] = useState<string | null>(null);
  const [assignmentFormValue, setAssignmentFormValue] = useState<WalkScheduleFormValue>(defaultScheduleFormValue);
  const [outdated, setOutdated] = useState<
    Array<{ placementId: string; title: string; pinnedVersion: number; currentVersion: number }>
  >([]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const syncDraftsFromTemplate = useCallback(
    (data: WalkTemplate) => {
      setNameDraft(data.name);
      setDescriptionDraft(data.description ?? "");
      setWorkplaceDraft(data.workplace || teamName);
      setEstimatedDurationDraft(data.estimatedDurationMinutes ?? 15);
    },
    [teamName],
  );

  const loadSchedules = useCallback(
    async (templateId: string) => {
      if (!teamId) return;
      const rows = await fetchWalkSchedules(teamId, templateId).catch(() => []);
      setSchedules(rows);
      setAssignmentScheduleId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    },
    [teamId],
  );

  const loadTemplate = useCallback(
    async (id: string) => {
      if (!teamId) return;
      const [data, outdatedRows] = await Promise.all([
        fetchWalkTemplate(teamId, id),
        fetchOutdatedWalkItems(teamId, id).catch(() => []),
      ]);
      setTemplate(data);
      syncDraftsFromTemplate(data);
      setOutdated(outdatedRows);
      const flatItems = flattenWalkItems(data);
      setSelectedItemId((prev) => prev ?? flatItems[0]?.id ?? null);
      await loadSchedules(id);
    },
    [teamId, syncDraftsFromTemplate, loadSchedules],
  );

  useEffect(() => {
    if (!teamId) return;
    void fetchLibraryItems(teamId, { status: "ACTIVE" })
      .then(setLibraryItems)
      .catch(() => setLibraryItems([]));
  }, [teamId]);

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        if (routeTemplateId && routeTemplateId !== "undefined" && routeTemplateId !== "null") {
          await loadTemplate(routeTemplateId);
          return;
        }
        const list = await fetchWalkTemplates(teamId);
        if (cancelled) return;
        const draft = list.find((t) => t.status === "DRAFT") ?? list[0];
        if (draft) {
          navigate(`/go/temp-checks/walks/builder/${draft.id}`, { replace: true });
          return;
        }
        const created = await createWalkTemplate(teamId, {
          name: "New Temp Walk",
          description: "Temperature and food-safety checks for associates.",
          workplace: teamName,
          estimatedDurationMinutes: 15,
        });
        if (cancelled) return;
        navigate(`/go/temp-checks/walks/builder/${created.id}`, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not open Walk Builder.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, routeTemplateId, teamName, navigate, loadTemplate]);

  const items = useMemo(() => (template ? flattenWalkItems(template) : []), [template]);
  const defaultSectionId = template?.sections[0]?.id ?? null;

  const libraryCategories = useMemo(
    () => [...new Set(libraryItems.map((i) => i.category).filter(Boolean))].sort(),
    [libraryItems],
  );

  const filteredLibraryItems = useMemo(() => {
    let list = libraryItems;
    if (libraryCategoryFilter) {
      list = list.filter((i) => i.category === libraryCategoryFilter);
    }
    if (librarySearch.trim()) {
      const q = librarySearch.trim().toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [libraryItems, libraryCategoryFilter, librarySearch]);

  const scheduleSummary = useMemo(() => summarizeWalkSchedules(schedules), [schedules]);
  const assignmentSchedule = useMemo(
    () => schedules.find((s) => s.id === assignmentScheduleId) ?? schedules[0] ?? null,
    [schedules, assignmentScheduleId],
  );

  const publishValidation = useMemo(
    () => getPublishValidation(nameDraft, items.length, schedules),
    [nameDraft, items.length, schedules],
  );

  const publishLabel =
    template?.parentTemplateId || template?.status === "PUBLISHED" ? "Publish Changes" : "Publish Walk";

  useEffect(() => {
    if (!assignmentSchedule) return;
    setAssignmentFormValue(scheduleToFormValue(assignmentSchedule));
  }, [assignmentSchedule?.id]);

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  if (loading || !template) {
    return (
      <div className="temps-page temps-page--wide">
        {error ? <p className="wb-error">{error}</p> : <EnterprisePageLoading label="Opening Walk Builder…" />}
      </div>
    );
  }

  const activeTeamId = teamId;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!template) return;
    await loadTemplate(template.id);
  }

  async function saveDetailsPatch(patch: Parameters<typeof patchWalkTemplate>[2]) {
    const updated = await patchWalkTemplate(activeTeamId, template!.id, patch);
    setTemplate(updated);
    syncDraftsFromTemplate(updated);
  }

  async function saveDraft() {
    await withBusy(async () => {
      // Published walks must be edited via a child draft — never unpublish in place.
      if (template!.status === "PUBLISHED") {
        const draft = await createDraftFromPublished(activeTeamId, template!.id);
        await patchWalkTemplate(activeTeamId, draft.id, {
          name: nameDraft.trim() || template!.name,
          description: descriptionDraft.trim() || null,
          workplace: workplaceDraft.trim() || teamName,
          estimatedDurationMinutes:
            estimatedDurationDraft === "" ? null : Number(estimatedDurationDraft) || null,
        });
        navigate(`/go/temp-checks/walks/builder/${draft.id}`);
        showToast("Draft created — continue editing here");
        return;
      }

      await saveDetailsPatch({
        name: nameDraft.trim() || template!.name,
        description: descriptionDraft.trim() || null,
        workplace: workplaceDraft.trim() || teamName,
        estimatedDurationMinutes:
          estimatedDurationDraft === "" ? null : Number(estimatedDurationDraft) || null,
      });
      showToast("Draft saved");
    });
  }

  async function publishWalkAction() {
    if (!publishValidation.canPublish) {
      setStep("review");
      showNotice({
        title: "Walk not ready to publish",
        message: "Complete the following before publishing:",
        items:
          publishValidation.errors.length > 0
            ? publishValidation.errors
            : ["Complete the required walk setup before publishing."],
        tone: "warning",
      });
      return;
    }
    await withBusy(async () => {
      if (nameDraft.trim() && nameDraft.trim() !== template!.name) {
        await patchWalkTemplate(activeTeamId, template!.id, { name: nameDraft.trim() });
      }
      const result = await publishWalk(activeTeamId, template!.id);
      const published = result.template as WalkTemplate;
      setTemplate(published);
      syncDraftsFromTemplate(published);
      showToast(`Walk published (v${result.publishedVersion.version})`);
      navigate(`/go/temp-checks/walks/${published.id}`);
    });
  }

  async function addFromLibrary(libraryItemId: string) {
    await withBusy(async () => {
      await addLibraryItemToWalk(activeTeamId, template!.id, {
        libraryItemId,
        sectionId: defaultSectionId,
      });
      await refresh();
      showToast("Item added from library");
    });
  }

  async function toggleItemRequired(item: WalkItem) {
    await withBusy(async () => {
      await patchWalkItem(activeTeamId, template!.id, item.id, { required: !item.required });
      await refresh();
    });
  }

  async function updateOutdatedPlacement(placementId: string) {
    await withBusy(async () => {
      await patchWalkItem(activeTeamId, template!.id, placementId, { pinToCurrentVersion: true });
      await refresh();
      showToast("Pinned to latest library version");
    });
  }

  async function onDropReorder(targetId: string) {
    if (!dragItemId || dragItemId === targetId || !template) return;
    const ordered = items.map((i) => i.id);
    const from = ordered.indexOf(dragItemId);
    const to = ordered.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, dragItemId);
    setDragItemId(null);
    await withBusy(async () => {
      const sectionId = items.find((i) => i.id === dragItemId)?.sectionId ?? defaultSectionId;
      const sectionOrdered = ordered.filter((id) => items.find((i) => i.id === id)?.sectionId === sectionId);
      const updated = await reorderWalkItems(activeTeamId, template.id, sectionOrdered, sectionId);
      setTemplate(updated);
    });
  }

  function openCreateSchedule() {
    setEditingScheduleId(null);
    setScheduleFormValue(defaultScheduleFormValue());
    setScheduleModalMode("create");
  }

  function openEditSchedule(schedule: WalkSchedule) {
    setEditingScheduleId(schedule.id);
    setScheduleFormValue(scheduleToFormValue(schedule));
    setScheduleModalMode("edit");
  }

  function closeScheduleModal() {
    setScheduleModalMode(null);
    setEditingScheduleId(null);
  }

  async function submitScheduleModal() {
    const body = scheduleWriteBody(scheduleFormValue);
    if (!body.windows.length) {
      showNotice({
        title: "Time window required",
        message: "Add at least one valid time window before saving this schedule.",
        tone: "warning",
      });
      return;
    }
    await withBusy(async () => {
      if (scheduleModalMode === "create") {
        await createWalkSchedule(activeTeamId, {
          templateId: template!.id,
          ...body,
        });
        showToast("Schedule created");
      } else if (editingScheduleId) {
        await updateWalkSchedule(activeTeamId, editingScheduleId, body);
        showToast("Schedule updated");
      }
      closeScheduleModal();
      await loadSchedules(template!.id);
    });
  }

  async function toggleScheduleActive(schedule: WalkSchedule) {
    await withBusy(async () => {
      await updateWalkSchedule(activeTeamId, schedule.id, { isActive: !schedule.isActive });
      await loadSchedules(template!.id);
      showToast(schedule.isActive ? "Schedule paused" : "Schedule resumed");
    });
  }

  async function confirmDeleteSchedule() {
    if (!confirmDeleteScheduleId) return;
    await withBusy(async () => {
      await deleteWalkSchedule(activeTeamId, confirmDeleteScheduleId);
      setConfirmDeleteScheduleId(null);
      await loadSchedules(template!.id);
      showToast("Schedule deleted");
    });
  }

  async function saveAssignment() {
    if (!assignmentSchedule) return;
    const body = scheduleWriteBody(assignmentFormValue);
    if (!body.windows.length) {
      setError("Schedule windows are invalid.");
      return;
    }
    await withBusy(async () => {
      await updateWalkSchedule(activeTeamId, assignmentSchedule.id, {
        assignScope: body.assignScope,
        assignRole: body.assignRole,
        completionMode: body.completionMode,
      });
      await loadSchedules(template!.id);
      showToast("Assignment saved");
    });
  }

  const stepIndex = BUILDER_STEPS.findIndex((s) => s.id === step);
  const currentStepMeta = BUILDER_STEPS[stepIndex];
  const prevStep = stepIndex > 0 ? BUILDER_STEPS[stepIndex - 1] : null;
  const nextStep = stepIndex >= 0 && stepIndex < BUILDER_STEPS.length - 1 ? BUILDER_STEPS[stepIndex + 1] : null;

  function StepFooter() {
    return (
      <div className="temps-builder-foot">
        {prevStep ? (
          <TempsButton variant="ghost" onClick={() => setStep(prevStep.id)}>
            ← {prevStep.label}
          </TempsButton>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {nextStep ? (
            <>
              <TempsButton variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
                Save Draft
              </TempsButton>
              <TempsButton variant="primary" onClick={() => setStep(nextStep.id)}>
                Continue to {nextStep.label} →
              </TempsButton>
            </>
          ) : (
            <TempsButton
              variant="primary"
              disabled={busy || !publishValidation.canPublish}
              onClick={() => void publishWalkAction()}
            >
              {publishLabel}
            </TempsButton>
          )}
        </div>
      </div>
    );
  }

  const backTo = template.id
    ? `/go/temp-checks/walks/${template.id}`
    : "/go/temp-checks/walks";

  return (
    <TempsPageShell testId="walk-builder-page" wide className="temps-builder-page">
      <TempsPageHeader
        breadcrumb={
          <>
            <Link to="/go/temp-checks/walks">Walks</Link>
            <span aria-hidden>/</span>
            <Link to={backTo}>{nameDraft.trim() || "Untitled walk"}</Link>
            <span aria-hidden>/</span>
            <span>Edit</span>
          </>
        }
        title={nameDraft.trim() || "Untitled walk"}
        description={`Step ${stepIndex + 1} of ${BUILDER_STEPS.length}: ${currentStepMeta?.label ?? ""} — ${currentStepMeta?.hint ?? ""}`}
        badges={
          <>
            <TempsStatusBadge tone={walkStatusTone(template.status)} />
            <TempsStatusBadge tone="neutral">{`Version ${template.version}`}</TempsStatusBadge>
          </>
        }
        actions={
          <>
            <TempsButton variant="secondary" disabled={busy} onClick={() => void saveDraft()}>
              Save Draft
            </TempsButton>
            {template.status === "PUBLISHED" ? (
              <TempsButton
                variant="ghost"
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                Edit as draft
              </TempsButton>
            ) : null}
            <TempsButton
              variant="primary"
              disabled={busy || !publishValidation.canPublish}
              onClick={() => void publishWalkAction()}
            >
              {publishLabel}
            </TempsButton>
          </>
        }
      />

      {template.parentTemplateId ? (
        <p className="temps-toast">Editing a draft of a published walk</p>
      ) : null}
      {error ? <p className="temps-error">{error}</p> : null}
      {noticeDialog}
      {toast ? (
        <p className="temps-toast temps-toast--float" role="status">
          {toast}
        </p>
      ) : null}
      {outdated.length > 0 ? (
        <div className="temps-callout" style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <strong>{outdated.length} library item(s) have newer versions</strong>
          {outdated.slice(0, 3).map((o) => (
            <span key={o.placementId} style={{ display: "inline-flex", gap: 8, marginRight: 8 }}>
              {o.title} (v{o.pinnedVersion} → v{o.currentVersion})
              <TempsButton variant="ghost" onClick={() => void updateOutdatedPlacement(o.placementId)}>
                Update
              </TempsButton>
            </span>
          ))}
        </div>
      ) : null}

      <TempsBuilderTabs
        tabs={BUILDER_STEPS.map((s) => ({ id: s.id, label: s.label }))}
        active={step}
        onChange={setStep}
      />

      <div className="temps-builder-layout temps-builder-layout--with-summary">
        <div className="temps-builder-main">
          {step === "details" ? (
            <div className="temps-builder-form">
              <TempsSectionCard
                title="Basic information"
                description="Name and description shown to leaders and associates."
              >
                <label className="temps-field">
                  <span>
                    Walk name <em style={{ color: "var(--temps-danger)" }}>*</em>
                  </span>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => {
                      if (nameDraft.trim() && nameDraft.trim() !== template.name) {
                        void withBusy(async () => {
                          await saveDetailsPatch({ name: nameDraft.trim() });
                        });
                      }
                    }}
                    placeholder="e.g. Opening cooler walk"
                    aria-label="Walk name"
                  />
                  <span className="temps-field-help">Shown to associates on Alenio Temps.</span>
                </label>
                <label className="temps-field">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onBlur={() => {
                      const next = descriptionDraft.trim() || null;
                      if (next !== (template.description ?? null)) {
                        void withBusy(async () => {
                          await saveDetailsPatch({ description: next });
                        });
                      }
                    }}
                    placeholder="What this walk covers for leaders and auditors."
                  />
                </label>
              </TempsSectionCard>

              <TempsSectionCard
                title="Operational settings"
                description="Where this walk applies and how long it usually takes."
              >
                <div className="wb-form-row wb-form-row--details">
                  <label className="temps-field">
                    <span>Category or operational area</span>
                    <input
                      value={workplaceDraft}
                      onChange={(e) => setWorkplaceDraft(e.target.value)}
                      onBlur={() => {
                        const next = workplaceDraft.trim() || teamName;
                        if (next !== template.workplace) {
                          void withBusy(async () => {
                            await saveDetailsPatch({ workplace: next });
                          });
                        }
                      }}
                      placeholder={teamName}
                    />
                  </label>
                  <label className="temps-field">
                    <span>Estimated duration (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      max={480}
                      value={estimatedDurationDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEstimatedDurationDraft(raw === "" ? "" : Number(raw));
                      }}
                      onBlur={() => {
                        const next =
                          estimatedDurationDraft === ""
                            ? null
                            : Number(estimatedDurationDraft) || null;
                        if (next !== template.estimatedDurationMinutes) {
                          void withBusy(async () => {
                            await saveDetailsPatch({ estimatedDurationMinutes: next });
                          });
                        }
                      }}
                    />
                  </label>
                </div>
              </TempsSectionCard>

              <TempsSectionCard title="Associate experience">
                <div className="temps-callout">
                  <strong>Item-level instructions</strong>
                  Associate step-by-step instructions live on each item in the Item Library. Customize
                  them on the Items step.
                </div>
              </TempsSectionCard>

              <StepFooter />
            </div>
          ) : null}

          {step === "items" ? (
            <>
              <div className="wb-build-grid">
                <section className="wb-palette" aria-label="My Item Library">
                  <h3>My Item Library</h3>
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <input
                      type="search"
                      placeholder="Search library…"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      style={{ flex: "1 1 140px" }}
                    />
                    <select
                      value={libraryCategoryFilter}
                      onChange={(e) => setLibraryCategoryFilter(e.target.value)}
                      aria-label="Filter by category"
                    >
                      <option value="">All categories</option>
                      {libraryCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="wb-palette-list">
                    {filteredLibraryItems.length === 0 ? (
                      <p className="wb-muted">
                        {libraryItems.length === 0 ? (
                          <>
                            No library items yet.{" "}
                            <Link to="/go/temp-checks/library">Create items in Item Library</Link>.
                          </>
                        ) : (
                          "No items match your search."
                        )}
                      </p>
                    ) : (
                      filteredLibraryItems.map((lib) => (
                        <button
                          key={lib.id}
                          type="button"
                          className="wb-palette-card"
                          disabled={busy}
                          onClick={() => void addFromLibrary(lib.id)}
                        >
                          <span className="wb-palette-icon">
                            <WalkTypeIcon type={lib.type as WalkItem["type"]} />
                          </span>
                          <span>
                            <strong>{lib.name}</strong>
                            <em>
                              {lib.category} · v{lib.currentVersion}
                            </em>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <Link to="/go/temp-checks/library" className="wb-linkish">
                    Manage Item Library →
                  </Link>
                </section>

                <section className="wb-items wb-panel" aria-label="Your walk items" style={{ padding: "0.9rem" }}>
                  <h3>Your Walk Items</h3>
                  <div className="wb-item-list">
                    {items.length === 0 ? (
                      <p className="wb-muted">Add items from the left to start building this walk.</p>
                    ) : (
                      items.map((item) => (
                        <div
                          key={item.id}
                          className={`wb-item-row${selectedItemId === item.id ? " wb-item-row--selected" : ""}${
                            !isPhase2ItemType(item.type) ? " wb-item-row--soon" : ""
                          }`}
                          draggable
                          onDragStart={() => setDragItemId(item.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => void onDropReorder(item.id)}
                          onClick={() => setSelectedItemId(item.id)}
                        >
                          <span className="wb-item-handle" aria-hidden>
                            ⋮⋮
                          </span>
                          <span className="wb-item-icon">
                            <WalkTypeIcon type={item.type} />
                          </span>
                          <span className="wb-item-copy">
                            <strong>{item.title}</strong>
                            <em>{typeLabel(item.type)}</em>
                          </span>
                          <button
                            type="button"
                            className={`wb-item-required${item.required ? "" : " wb-item-required--off"}`}
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleItemRequired(item);
                            }}
                            title={item.required ? "Mark optional" : "Mark required"}
                            aria-pressed={item.required}
                          >
                            {item.required ? "Required" : "Optional"}
                          </button>
                          <button
                            type="button"
                            className="wb-item-menu"
                            aria-label={`Edit ${item.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem(item);
                            }}
                          >
                            ⋯
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <Link to="/go/temp-checks/library" className="wb-add-item">
                    + Create in Item Library
                  </Link>
                </section>
              </div>
              <div className="wb-panel" style={{ paddingTop: "0.85rem", paddingBottom: "0.85rem" }}>
                <StepFooter />
              </div>
            </>
          ) : null}

          {step === "schedule" ? (
            <section className="wb-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "1rem" }}>
                <p className="wb-muted" style={{ margin: 0 }}>
                  Define when this walk becomes due. You can schedule drafts now — checks open after publish.
                </p>
                <button type="button" className="wb-btn wb-btn--primary" disabled={busy} onClick={openCreateSchedule}>
                  Add schedule
                </button>
              </div>
              {schedules.length === 0 ? (
                <div className="wb-empty-state">
                  <strong>Not scheduled yet</strong>
                  <p className="wb-muted">Add a daily, weekly, interval, or one-time schedule for associates.</p>
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.75rem" }}>
                  {schedules.map((schedule) => (
                    <li
                      key={schedule.id}
                      className="wb-summary-card"
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}
                    >
                      <div>
                        <strong>{schedule.name?.trim() || "Untitled schedule"}</strong>
                        <p className="wb-muted" style={{ margin: "0.25rem 0 0" }}>
                          {formatScheduleSummary(schedule)}
                        </p>
                        <span
                          className={`wsch-status ${schedule.isActive ? "wsch-status--active" : "wsch-status--paused"}`}
                          style={{ marginTop: "0.35rem", display: "inline-block" }}
                        >
                          {schedule.isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="wb-btn wb-btn--ghost"
                          disabled={busy}
                          onClick={() => void toggleScheduleActive(schedule)}
                        >
                          {schedule.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          className="wb-btn wb-btn--ghost"
                          disabled={busy}
                          onClick={() => openEditSchedule(schedule)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="wb-btn wb-btn--ghost wb-btn--danger"
                          disabled={busy}
                          onClick={() => setConfirmDeleteScheduleId(schedule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <StepFooter />
            </section>
          ) : null}

          {step === "assignment" ? (
            <section className="wb-panel">
              {schedules.length === 0 ? (
                <>
                  <div className="wb-empty-state">
                    <strong>Add a schedule first</strong>
                    <p className="wb-muted">Assignment is configured on each schedule — who should complete the check.</p>
                  </div>
                  <button type="button" className="wb-btn wb-btn--primary" onClick={() => setStep("schedule")}>
                    Go to Schedule
                  </button>
                </>
              ) : (
                <>
                  {schedules.length > 1 ? (
                    <label style={{ display: "block", marginBottom: "1rem" }}>
                      Schedule
                      <select
                        value={assignmentScheduleId ?? ""}
                        onChange={(e) => setAssignmentScheduleId(e.target.value)}
                      >
                        {schedules.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name?.trim() || formatScheduleSummary(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <WalkScheduleForm
                    value={assignmentFormValue}
                    onChange={setAssignmentFormValue}
                    showAssignment
                    disabled={busy}
                  />
                  <div style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="wb-btn wb-btn--primary"
                      disabled={busy || !assignmentSchedule}
                      onClick={() => void saveAssignment()}
                    >
                      Save assignment
                    </button>
                  </div>
                </>
              )}
              <StepFooter />
            </section>
          ) : null}

          {step === "review" ? (
            <section className="wb-panel">
              <article className="wb-summary-card" style={{ marginBottom: "1rem" }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.65rem" }}>
                  <li>
                    <strong>Name:</strong> {nameDraft.trim() || "—"}
                  </li>
                  <li>
                    <strong>Items:</strong> {items.length}
                  </li>
                  <li>
                    <strong>Schedule:</strong> {scheduleSummary.label}
                  </li>
                  <li>
                    <strong>Assignment:</strong>{" "}
                    {assignmentSchedule ? assignScopeLabel(assignmentSchedule) : "—"}
                  </li>
                  <li>
                    <strong>Version:</strong> v{template.version}
                  </li>
                  <li>
                    <strong>Status:</strong> {template.status}
                  </li>
                </ul>
              </article>

              {publishValidation.errors.length > 0 ? (
                <div className="wb-error wb-error--banner" style={{ marginBottom: "0.75rem" }}>
                  <strong>Fix before publishing</strong>
                  <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.25rem" }}>
                    {publishValidation.errors.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {publishValidation.warnings.length > 0 ? (
                <div
                  className="wb-error wb-error--banner"
                  style={{ background: "#fffbeb", color: "#92400e", marginBottom: "0.75rem" }}
                >
                  <strong>Warnings</strong>
                  <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.25rem" }}>
                    {publishValidation.warnings.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <StepFooter />
            </section>
          ) : null}
        </div>

        <aside className="temps-section-card" aria-label="Walk summary">
          <h3 className="temps-section-title">Walk summary</h3>
          <TempsSummaryBar
            items={[
              {
                label: "Items",
                value: `${items.length} item${items.length === 1 ? "" : "s"}`,
              },
              { label: "Schedule", value: scheduleSummary.label },
              {
                label: "Assignment",
                value: assignmentSchedule ? assignScopeLabel(assignmentSchedule) : "Not set",
              },
            ]}
          />
          {step !== "review" ? (
            <div style={{ marginTop: "0.85rem" }}>
              <TempsButton variant="secondary" onClick={() => setStep("review")} style={{ width: "100%" }}>
                Review & Publish
              </TempsButton>
            </div>
          ) : null}
        </aside>
      </div>

      {scheduleModalMode ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={closeScheduleModal}>
          <div
            className="wsch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wb-schedule-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="wb-schedule-modal-title">
                {scheduleModalMode === "edit" ? "Edit schedule" : "Add schedule"}
              </h2>
              <button type="button" className="wil-row-menu" onClick={closeScheduleModal} aria-label="Close">
                ✕
              </button>
            </header>
            <WalkScheduleForm value={scheduleFormValue} onChange={setScheduleFormValue} disabled={busy} />
            <footer className="wsch-modal-foot">
              <button type="button" className="wb-btn wb-btn--ghost" onClick={closeScheduleModal}>
                Cancel
              </button>
              <button type="button" className="wb-btn wb-btn--primary" disabled={busy} onClick={() => void submitScheduleModal()}>
                {scheduleModalMode === "edit" ? "Save schedule" : "Create schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteScheduleId ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={() => setConfirmDeleteScheduleId(null)}>
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2>Delete schedule?</h2>
            </header>
            <p className="wil-subtitle">Future occurrences for this schedule will be removed.</p>
            <footer className="wsch-modal-foot">
              <button type="button" className="wb-btn wb-btn--ghost" onClick={() => setConfirmDeleteScheduleId(null)}>
                Cancel
              </button>
              <button type="button" className="wb-btn wb-btn--danger" disabled={busy} onClick={() => void confirmDeleteSchedule()}>
                Delete
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <WalkItemEditDrawer
        open={!!editingItem}
        item={editingItem}
        busy={busy}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await withBusy(async () => {
            await patchWalkItem(activeTeamId, template.id, editingItem.id, patch);
            await refresh();
            setEditingItem(null);
            showToast("Item updated");
          });
        }}
        onDelete={async () => {
          if (!editingItem) return;
          await withBusy(async () => {
            await deleteWalkItem(activeTeamId, template.id, editingItem.id);
            setEditingItem(null);
            await refresh();
            showToast("Item deleted");
          });
        }}
      />
    </TempsPageShell>
  );
}
