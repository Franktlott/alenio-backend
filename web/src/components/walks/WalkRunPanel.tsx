import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WalkItemResponse, WalkItemStatus, WalkTemplateRow } from "../../lib/api";
import { uploadChatMedia } from "../../lib/api";
import {
  allWalkItemsReviewed,
  computeWalkDraftStats,
  getWalkTemplateSections,
} from "../../lib/walks-display";

type DraftResponse = {
  itemId: string;
  label: string;
  status?: WalkItemStatus;
  notes: string;
  photoUrl: string | null;
  photoPreview?: string | null;
};

type FilterTab = "all" | "not_started" | "needs_attention" | "na" | "completed";

type FlatItem = {
  itemId: string;
  label: string;
  sectionTitle: string;
  index: number;
};

type Props = {
  template: WalkTemplateRow;
  busy?: boolean;
  error?: string | null;
  managerName?: string;
  onManagerNameChange?: (name: string) => void;
  requireManagerName?: boolean;
  verifiedLeaderName?: string | null;
  onSignOutLeader?: () => void;
  onComplete: (payload: { responses: WalkItemResponse[]; finalNotes?: string | null }) => Promise<void>;
  onCancel: () => void;
};

function estimateWalkMinutes(itemCount: number): number {
  return Math.max(3, Math.min(30, Math.ceil(itemCount * 0.55)));
}

function filterLabel(tab: FilterTab): string {
  if (tab === "all") return "All";
  if (tab === "not_started") return "Not Started";
  if (tab === "needs_attention") return "Needs Attention";
  if (tab === "na") return "N/A";
  return "Completed";
}

function matchesFilter(status: WalkItemStatus | undefined, tab: FilterTab): boolean {
  if (tab === "all") return true;
  if (tab === "not_started") return !status;
  if (tab === "needs_attention") return status === "needs_attention";
  if (tab === "na") return status === "na";
  return Boolean(status);
}

export function WalkRunPanel({
  template,
  busy,
  error,
  managerName = "",
  onManagerNameChange,
  requireManagerName,
  verifiedLeaderName,
  onSignOutLeader,
  onComplete,
  onCancel,
}: Props) {
  const sections = useMemo(() => getWalkTemplateSections(template), [template]);
  const templateItems = template.items ?? [];
  const flatItems = useMemo(() => {
    const rows: FlatItem[] = [];
    let index = 0;
    for (const section of sections) {
      for (const item of section.items) {
        index += 1;
        rows.push({
          itemId: item.id,
          label: item.label,
          sectionTitle: section.title,
          index,
        });
      }
    }
    return rows;
  }, [sections]);

  const [responses, setResponses] = useState<DraftResponse[]>(() =>
    templateItems.map((item) => ({
      itemId: item.id,
      label: item.label,
      notes: "",
      photoUrl: null,
      photoPreview: null,
    })),
  );
  const [finalNotes, setFinalNotes] = useState("");
  const [showFinalNotes, setShowFinalNotes] = useState(false);
  const [sectionNotes, setSectionNotes] = useState<Record<string, string>>({});
  const [openSectionNotes, setOpenSectionNotes] = useState<Record<string, boolean>>({});
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [focusIndex, setFocusIndex] = useState(0);
  const [autosavedLabel, setAutosavedLabel] = useState("Ready to start");
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});

  const stats = useMemo(() => {
    const reviewed = responses
      .filter((r) => r.status)
      .map((r) => ({
        itemId: r.itemId,
        label: r.label,
        status: r.status!,
        notes: r.notes.trim() || null,
        photoUrl: r.photoUrl,
      }));
    return computeWalkDraftStats(reviewed);
  }, [responses]);

  const filterCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: flatItems.length,
      not_started: 0,
      needs_attention: 0,
      na: 0,
      completed: 0,
    };
    for (const item of flatItems) {
      const row = responses.find((r) => r.itemId === item.itemId);
      if (!row?.status) counts.not_started += 1;
      if (row?.status === "needs_attention") counts.needs_attention += 1;
      if (row?.status === "na") counts.na += 1;
      if (row?.status) counts.completed += 1;
    }
    return counts;
  }, [flatItems, responses]);

  const visibleItems = useMemo(
    () =>
      flatItems.filter((item) => {
        const row = responses.find((r) => r.itemId === item.itemId);
        return matchesFilter(row?.status, activeFilter);
      }),
    [flatItems, responses, activeFilter],
  );

  const progressPct =
    templateItems.length === 0 ? 0 : Math.round((stats.totalReviewed / templateItems.length) * 100);
  const readyToComplete = allWalkItemsReviewed(
    templateItems.length,
    responses
      .filter((r) => r.status)
      .map((r) => ({
        itemId: r.itemId,
        label: r.label,
        status: r.status!,
        notes: r.notes.trim() || null,
        photoUrl: r.photoUrl,
      })),
  );
  const estMinutes = estimateWalkMinutes(templateItems.length);
  const walkTag = template.workplace.split(" ")[0] ?? "Walk";
  const startedAt = useMemo(() => new Date(), []);

  useEffect(() => {
    setAutosavedLabel("Autosaved just now");
  }, [responses, finalNotes, sectionNotes]);

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => {
        const items = section.items
          .map((item) => flatItems.find((row) => row.itemId === item.id))
          .filter(Boolean) as FlatItem[];
        const filteredItems = items.filter((item) => {
          const row = responses.find((r) => r.itemId === item.itemId);
          return matchesFilter(row?.status, activeFilter);
        });
        return { section, items: filteredItems };
      })
      .filter((group) => group.items.length > 0);
  }, [sections, flatItems, responses, activeFilter]);

  const scrollToItem = useCallback((itemId: string) => {
    itemRefs.current[itemId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  function setStatus(itemId: string, status: WalkItemStatus) {
    setResponses((rows) => rows.map((row) => (row.itemId === itemId ? { ...row, status } : row)));
    setLocalErr(null);
  }

  async function onPhotoSelected(itemId: string, file: File | null) {
    if (!file) return;
    setUploadingItemId(itemId);
    setLocalErr(null);
    try {
      const uploaded = await uploadChatMedia(file);
      const preview = URL.createObjectURL(file);
      setResponses((rows) =>
        rows.map((row) =>
          row.itemId === itemId ? { ...row, photoUrl: uploaded.url, photoPreview: preview } : row,
        ),
      );
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setUploadingItemId(null);
    }
  }

  function goToRelative(step: number) {
    const pool = activeFilter === "all" ? flatItems : visibleItems;
    if (pool.length === 0) return;
    const currentId = flatItems[focusIndex]?.itemId;
    const poolIndex = Math.max(0, pool.findIndex((item) => item.itemId === currentId));
    const nextIndex = Math.min(pool.length - 1, Math.max(0, poolIndex + step));
    const target = pool[nextIndex];
    if (!target) return;
    const absoluteIndex = flatItems.findIndex((item) => item.itemId === target.itemId);
    setFocusIndex(absoluteIndex >= 0 ? absoluteIndex : 0);
    scrollToItem(target.itemId);
  }

  function goToNextUnreviewed() {
    const next = flatItems.find((item) => !responses.find((r) => r.itemId === item.itemId)?.status);
    if (next) {
      const absoluteIndex = flatItems.findIndex((item) => item.itemId === next.itemId);
      setFocusIndex(absoluteIndex);
      scrollToItem(next.itemId);
      return;
    }
    void submit();
  }

  function setSectionNote(sectionId: string, notes: string) {
    setSectionNotes((prev) => ({ ...prev, [sectionId]: notes }));
  }

  function buildFinalNotes(): string | null {
    const blocks: string[] = [];
    if (finalNotes.trim()) blocks.push(finalNotes.trim());
    for (const section of sections) {
      const note = sectionNotes[section.id]?.trim();
      if (note) blocks.push(`${section.title}: ${note}`);
    }
    return blocks.length > 0 ? blocks.join("\n\n") : null;
  }

  async function submit() {
    setLocalErr(null);
    if (!readyToComplete) {
      setLocalErr("Review every observation item before completing the walk.");
      return;
    }
    if (requireManagerName && !verifiedLeaderName?.trim() && !managerName.trim()) {
      setLocalErr("Enter your name so this walk is recorded.");
      return;
    }
    const payload: WalkItemResponse[] = responses.map((row) => ({
      itemId: row.itemId,
      label: row.label,
      status: row.status!,
      notes: row.notes.trim() || null,
      photoUrl: row.photoUrl,
    }));
    await onComplete({
      responses: payload,
      finalNotes: buildFinalNotes(),
    });
  }

  return (
    <div className="walk-run-page" data-testid="walk-run-panel">
      <div className="walk-run-page-top">
        <header className="walk-run-page-header">
          <div className="walk-run-page-header-main">
            <button type="button" className="walk-run-page-back" onClick={onCancel} disabled={busy}>
              ← Exit walk
            </button>
            <p className="walk-run-page-kicker">Manager observation walk</p>
            <h1 className="walk-run-page-title">{template.name}</h1>
            <p className="walk-run-page-meta">
              <span>📍 {template.workplace}</span>
              <span aria-hidden>•</span>
              <span>🏷 {walkTag}</span>
              <span aria-hidden>•</span>
              <span>⏱ Est. {estMinutes} min</span>
            </p>
          </div>
          <div className="walk-run-page-header-actions">
            <button type="button" className="walk-run-page-actions-btn" onClick={onCancel} disabled={busy}>
              Walk actions
            </button>
          </div>
        </header>

        {verifiedLeaderName?.trim() ? (
          <div className="walk-run-page-manager walk-run-page-manager--leader">
            <div className="walk-run-page-manager-leader">
              <span className="walk-run-page-manager-leader-label">Signed in as</span>
              <strong className="walk-run-page-manager-leader-name">{verifiedLeaderName}</strong>
            </div>
            {onSignOutLeader ? (
              <button type="button" className="walk-run-page-manager-signout" onClick={onSignOutLeader} disabled={busy}>
                Switch leader
              </button>
            ) : null}
          </div>
        ) : requireManagerName ? (
          <div className="walk-run-page-manager">
            <label className="walk-run-page-manager-label" htmlFor="walk-manager-name">
              Your name
            </label>
            <input
              id="walk-manager-name"
              className="walk-run-page-manager-input"
              value={managerName}
              onChange={(e) => onManagerNameChange?.(e.target.value)}
              maxLength={120}
              placeholder="e.g. Alex M."
              required
            />
          </div>
        ) : null}

        <div className="walk-run-page-filters" role="tablist" aria-label="Filter observations">
          {(["all", "not_started", "needs_attention", "na", "completed"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeFilter === tab}
              className={`walk-run-page-filter${activeFilter === tab ? " walk-run-page-filter--active" : ""}`}
              onClick={() => setActiveFilter(tab)}
            >
              {filterLabel(tab)} ({filterCounts[tab]})
            </button>
          ))}
        </div>
      </div>

      <div className="walk-run-page-split">
        <main className="walk-run-page-checklist">
            {visibleSections.length === 0 ? (
              <p className="walk-run-page-empty">No observations match this filter.</p>
            ) : (
              <div className="walk-run-page-sections">
                {visibleSections.map(({ section, items }) => (
                  <section key={section.id} className="walk-run-page-section-block">
                    {sections.length > 1 ? (
                      <h3 className="walk-run-page-section-label">{section.title}</h3>
                    ) : null}
                    <ul className="walk-run-page-rows">
                      {items.map((item) => {
                        const row = responses.find((r) => r.itemId === item.itemId);
                        if (!row) return null;
                        return (
                          <li
                            key={item.itemId}
                            ref={(el) => {
                              itemRefs.current[item.itemId] = el;
                            }}
                            className={`walk-run-page-row${row.status ? ` walk-run-page-row--${row.status}` : ""}`}
                          >
                            <span className="walk-run-page-row-index">{item.index}</span>
                            <span className="walk-run-page-row-label">{row.label}</span>
                            <div className="walk-run-page-row-actions">
                              <label
                                className={`walk-run-page-row-photo${row.photoUrl ? " walk-run-page-row-photo--added" : ""}`}
                                title="Add photo"
                              >
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={busy || uploadingItemId === row.itemId}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    e.target.value = "";
                                    void onPhotoSelected(row.itemId, file);
                                  }}
                                />
                                📷
                              </label>
                              <div className="walk-run-page-row-status" role="group" aria-label={`Status for ${row.label}`}>
                                <button
                                  type="button"
                                  className={`walk-run-page-row-btn walk-run-page-row-btn--pass${row.status === "pass" ? " walk-run-page-row-btn--active" : ""}`}
                                  disabled={busy}
                                  onClick={() => setStatus(row.itemId, "pass")}
                                  title="Pass"
                                >
                                  Pass
                                </button>
                                <button
                                  type="button"
                                  className={`walk-run-page-row-btn walk-run-page-row-btn--attention${row.status === "needs_attention" ? " walk-run-page-row-btn--active" : ""}`}
                                  disabled={busy}
                                  onClick={() => setStatus(row.itemId, "needs_attention")}
                                  title="Needs Attention"
                                >
                                  Needs Attn
                                </button>
                                <button
                                  type="button"
                                  className={`walk-run-page-row-btn walk-run-page-row-btn--na${row.status === "na" ? " walk-run-page-row-btn--active" : ""}`}
                                  disabled={busy}
                                  onClick={() => setStatus(row.itemId, "na")}
                                  title="N/A"
                                >
                                  N/A
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="walk-run-page-section-notes">
                      <button
                        type="button"
                        className="walk-run-page-section-notes-toggle"
                        onClick={() =>
                          setOpenSectionNotes((prev) => ({
                            ...prev,
                            [section.id]: !prev[section.id],
                          }))
                        }
                      >
                        {openSectionNotes[section.id] ? "Hide section notes" : "Add section notes"}
                        {sectionNotes[section.id]?.trim() ? " •" : ""}
                      </button>
                      {openSectionNotes[section.id] ? (
                        <textarea
                          className="walk-run-page-section-notes-input"
                          value={sectionNotes[section.id] ?? ""}
                          onChange={(e) => setSectionNote(section.id, e.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder={`Notes for ${section.title} (optional)`}
                        />
                      ) : null}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </main>

          <aside className="walk-run-page-sidebar">
            <section className="walk-run-page-side-card">
              <h2>Walk Summary</h2>
              <div className="walk-run-page-ring-wrap">
                <svg className="walk-run-page-ring" viewBox="0 0 120 120" aria-hidden>
                  <circle cx="60" cy="60" r="52" className="walk-run-page-ring-track" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="walk-run-page-ring-progress"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 52}`,
                      strokeDashoffset: `${2 * Math.PI * 52 * (1 - progressPct / 100)}`,
                    }}
                  />
                </svg>
                <strong className="walk-run-page-ring-value">{progressPct}%</strong>
              </div>
              <dl className="walk-run-page-side-stats">
                <div>
                  <dt>Completed</dt>
                  <dd>
                    {stats.totalReviewed} / {templateItems.length}
                  </dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{Math.max(0, templateItems.length - stats.totalReviewed)}</dd>
                </div>
              </dl>
            </section>

            <section className="walk-run-page-side-card">
              <h2>Results so far</h2>
              <ul className="walk-run-page-results">
                <li>
                  <span className="walk-run-page-dot walk-run-page-dot--pass" aria-hidden />
                  Pass <strong>{stats.passCount}</strong>
                </li>
                <li>
                  <span className="walk-run-page-dot walk-run-page-dot--attention" aria-hidden />
                  Needs Attention <strong>{stats.needsAttentionCount}</strong>
                </li>
                <li>
                  <span className="walk-run-page-dot walk-run-page-dot--na" aria-hidden />
                  N/A <strong>{stats.naCount}</strong>
                </li>
              </ul>
            </section>

            <section className="walk-run-page-side-card">
              <button
                type="button"
                className="walk-run-page-notes-btn"
                onClick={() => setShowFinalNotes((v) => !v)}
              >
                ✎ Add overall notes
              </button>
              {showFinalNotes ? (
                <textarea
                  className="walk-run-page-final-notes"
                  value={finalNotes}
                  onChange={(e) => setFinalNotes(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Overall observations, coaching notes, or next steps"
                />
              ) : null}
            </section>

            <section className="walk-run-page-side-card walk-run-page-side-info">
              <h2>Walk Info</h2>
              <ul>
                <li>📍 {template.workplace}</li>
                <li>🏷 {walkTag}</li>
                <li>⏱ Est. {estMinutes} min</li>
                <li>
                  🗓 Started {startedAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </li>
                <li>
                  <span>Walk ID: {template.id.slice(0, 8).toUpperCase()}</span>
                </li>
              </ul>
            </section>
          </aside>
      </div>

      {localErr || error ? (
        <p className="walk-run-page-error" role="alert">
          {localErr || error}
        </p>
      ) : null}

      <footer className="walk-run-page-footer">
        <div className="walk-run-page-footer-inner">
          <button type="button" className="walk-run-page-footer-secondary" disabled={busy} onClick={() => goToRelative(-1)}>
            Previous
          </button>
          <p className="walk-run-page-footer-status">
            <span className="walk-run-page-footer-dot" aria-hidden />
            {autosavedLabel}
          </p>
          <button
            type="button"
            className="walk-run-page-footer-primary"
            disabled={busy}
            onClick={() => (readyToComplete ? void submit() : goToNextUnreviewed())}
            data-testid="walk-complete-btn"
          >
            {busy ? "Saving walk…" : readyToComplete ? "Complete Walk" : "Next"}
          </button>
        </div>
      </footer>
    </div>
  );
}
