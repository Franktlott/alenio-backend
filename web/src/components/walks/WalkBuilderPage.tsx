import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "opening", label: "Opening", icon: "☀️" },
  { value: "closing", label: "Closing", icon: "🌙" },
  { value: "safety", label: "Safety", icon: "🛡️" },
  { value: "standards", label: "Standards", icon: "✓" },
  { value: "operations", label: "Operations", icon: "⚙️" },
] as const;

const TIME_OPTIONS = ["3 minutes", "5 minutes", "10 minutes", "15 minutes", "20 minutes"] as const;
const DEFAULT_WALK_WORKPLACE = "All Areas";

type ObservationRow = {
  id: string;
  label: string;
  helperText: string;
  required: boolean;
  photoRequired: boolean;
  commentRequired: boolean;
};

type SectionRow = {
  id: string;
  title: string;
  observations: ObservationRow[];
};

type SubmitPayload = {
  name: string;
  workplace: string;
  scoringEnabled: boolean;
  sections: { title: string; items: { label: string }[] }[];
  items: { label: string }[];
};

type Props = {
  pageTitle: string;
  pageSubtitle: string;
  busy?: boolean;
  error?: string | null;
  initial?: {
    name: string;
    workplace: string;
    scoringEnabled: boolean;
    sections?: { title: string; items: { label: string }[] }[];
    items?: { label: string }[];
  };
  onSubmit: (payload: SubmitPayload) => Promise<void>;
  onCancel: () => void;
};

function newObservation(label = "", helperText = ""): ObservationRow {
  return {
    id: crypto.randomUUID(),
    label,
    helperText,
    required: true,
    photoRequired: false,
    commentRequired: false,
  };
}

function newSection(title = "New Section", observations?: ObservationRow[]): SectionRow {
  return {
    id: crypto.randomUUID(),
    title,
    observations: observations ?? [newObservation()],
  };
}

function sectionsFromInitial(initial?: Props["initial"]): SectionRow[] {
  if (initial?.sections?.length) {
    return initial.sections.map((section) =>
      newSection(
        section.title,
        section.items.map((item) => newObservation(item.label)),
      ),
    );
  }
  if (initial?.items?.length) {
    return [newSection("Observations", initial.items.map((item) => newObservation(item.label)))];
  }
  return [newSection("Section 1", [newObservation()])];
}

function IconGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function IconCamera({ active }: { active?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={active ? "walk-builder-icon--active" : undefined}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconComment({ active }: { active?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={active ? "walk-builder-icon--active" : undefined}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function WalkBuilderPage({
  pageTitle,
  pageSubtitle,
  busy,
  error,
  initial,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const workplace = initial?.workplace?.trim() || DEFAULT_WALK_WORKPLACE;
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("opening");
  const [estimatedTime, setEstimatedTime] = useState<(typeof TIME_OPTIONS)[number]>("5 minutes");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [scoringEnabled, setScoringEnabled] = useState(initial?.scoringEnabled ?? true);
  const [sections, setSections] = useState<SectionRow[]>(() => sectionsFromInitial(initial));
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<{
    sectionId: string;
    observationId: string;
  } | null>(null);
  const [lastSavedAt] = useState<Date | null>(null);
  const baselineRef = useRef<string>("");

  const categoryMeta = CATEGORY_OPTIONS.find((c) => c.value === category) ?? CATEGORY_OPTIONS[0];
  const allObservations = useMemo(
    () => sections.flatMap((section) => section.observations),
    [sections],
  );
  const filledObservations = useMemo(
    () => allObservations.filter((row) => row.label.trim()),
    [allObservations],
  );
  const globalObservationIndex = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const section of sections) {
      for (const observation of section.observations) {
        index += 1;
        map.set(observation.id, index);
      }
    }
    return map;
  }, [sections]);

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        name,
        workplace,
        category,
        estimatedTime,
        description,
        tags,
        scoringEnabled,
        sections,
      }),
    [name, workplace, category, estimatedTime, description, tags, scoringEnabled, sections],
  );

  const hasUnsavedChanges = baselineRef.current !== "" && snapshot !== baselineRef.current;

  useEffect(() => {
    baselineRef.current = snapshot;
  }, []);

  const updateObservation = useCallback(
    (sectionId: string, observationId: string, patch: Partial<ObservationRow>) => {
      setSections((rows) =>
        rows.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                observations: section.observations.map((row) =>
                  row.id === observationId ? { ...row, ...patch } : row,
                ),
              }
            : section,
        ),
      );
    },
    [],
  );

  const updateSectionTitle = (sectionId: string, title: string) => {
    setSections((rows) => rows.map((section) => (section.id === sectionId ? { ...section, title } : section)));
  };

  const addSection = () => {
    setSections((rows) => [...rows, newSection(`Section ${rows.length + 1}`)]);
  };

  const removeSection = (sectionId: string) => {
    setSections((rows) => (rows.length <= 1 ? rows : rows.filter((section) => section.id !== sectionId)));
  };

  const addObservation = (sectionId: string) => {
    setSections((rows) =>
      rows.map((section) =>
        section.id === sectionId
          ? { ...section, observations: [...section.observations, newObservation()] }
          : section,
      ),
    );
  };

  const duplicateObservation = (sectionId: string, index: number) => {
    setSections((rows) =>
      rows.map((section) => {
        if (section.id !== sectionId) return section;
        const source = section.observations[index];
        if (!source) return section;
        const copy = {
          ...source,
          id: crypto.randomUUID(),
          label: source.label ? `${source.label} (copy)` : "",
        };
        const observations = [...section.observations];
        observations.splice(index + 1, 0, copy);
        return { ...section, observations };
      }),
    );
  };

  const removeObservation = (sectionId: string, observationId: string) => {
    setSections((rows) =>
      rows.map((section) => {
        if (section.id !== sectionId) return section;
        if (section.observations.length <= 1) return section;
        return {
          ...section,
          observations: section.observations.filter((row) => row.id !== observationId),
        };
      }),
    );
  };

  const moveObservation = (targetSectionId: string, targetIndex: number) => {
    if (!dragTarget) return;
    setSections((rows) => {
      const next = rows.map((section) => ({
        ...section,
        observations: [...section.observations],
      }));
      const sourceSection = next.find((section) => section.id === dragTarget.sectionId);
      const targetSection = next.find((section) => section.id === targetSectionId);
      if (!sourceSection || !targetSection) return rows;

      const sourceIndex = sourceSection.observations.findIndex((row) => row.id === dragTarget.observationId);
      if (sourceIndex < 0) return rows;

      const [moved] = sourceSection.observations.splice(sourceIndex, 1);
      if (!moved) return rows;

      const adjustedTargetIndex =
        sourceSection.id === targetSection.id && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      targetSection.observations.splice(
        Math.max(0, Math.min(adjustedTargetIndex, targetSection.observations.length)),
        0,
        moved,
      );
      return next;
    });
  };

  async function handleSave() {
    setLocalErr(null);
    const payloadSections = sections
      .map((section) => ({
        title: section.title.trim(),
        items: section.observations
          .map((row) => ({ label: row.label.trim() }))
          .filter((row) => row.label),
      }))
      .filter((section) => section.title && section.items.length > 0);

    if (!name.trim()) {
      setLocalErr("Walk name is required.");
      return;
    }
    const flatItems = payloadSections.flatMap((section) => section.items);
    if (payloadSections.length === 0) {
      setLocalErr("Add at least one section with an observation item.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      workplace: workplace.trim(),
      scoringEnabled,
      sections: payloadSections,
      items: flatItems,
    });
    baselineRef.current = snapshot;
  }

  const previewItems = filledObservations.length ? filledObservations : allObservations;
  const detailsComplete = Boolean(name.trim());
  const observationsComplete = sections.some(
    (section) => section.title.trim() && section.observations.some((row) => row.label.trim()),
  );
  const reviewReady = detailsComplete && observationsComplete;
  const processSteps = [
    {
      label: "Fill walk details",
      helper: "Name, category, and timing",
      complete: detailsComplete,
      active: !detailsComplete,
    },
    {
      label: "Add observations",
      helper: "Group required checks into sections",
      complete: observationsComplete,
      active: detailsComplete && !observationsComplete,
    },
    {
      label: "Review full walk",
      helper: "Confirm preview and scoring",
      complete: reviewReady,
      active: reviewReady,
    },
    {
      label: "Publish walk",
      helper: "Save it for managers to run",
      complete: false,
      active: reviewReady,
    },
  ];

  return (
    <div className="walk-builder" data-testid="walk-builder-page">
      <div className="walk-builder-inner">
        <header className="walk-builder-header">
          <div className="walk-builder-header-copy">
            <Link to="/go/walks" className="walk-builder-back">
              ← Walks
            </Link>
            <h1 className="walk-builder-title">{pageTitle}</h1>
            <p className="walk-builder-subtitle">{pageSubtitle}</p>
          </div>
          <div className="walk-builder-header-actions">
            <button
              type="button"
              className="walk-builder-btn-secondary"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              Save Draft
            </button>
            <button
              type="button"
              className="walk-builder-btn-primary"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? "Publishing…" : "Publish Walk"}
            </button>
          </div>
        </header>

        <ol className="walk-builder-process" aria-label="Create walk process">
          {processSteps.map((step, index) => (
            <li
              key={step.label}
              className={`walk-builder-process-step${
                step.complete ? " walk-builder-process-step--complete" : ""
              }${step.active ? " walk-builder-process-step--active" : ""}`}
            >
              <span className="walk-builder-process-number">{step.complete ? "✓" : index + 1}</span>
              <span className="walk-builder-process-copy">
                <strong>{step.label}</strong>
                <span>{step.helper}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="walk-builder-grid">
          <div className="walk-builder-main">
            <section className="walk-builder-card">
              <header className="walk-builder-card-head">
                <span className="walk-builder-step">1</span>
                <h2 className="walk-builder-card-title">Walk Details</h2>
              </header>

              <div className="walk-builder-fields">
                <label className="walk-builder-field">
                  <span className="walk-builder-label">
                    Walk Name <span className="walk-builder-required">*</span>
                  </span>
                  <input
                    className="walk-builder-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Opening Standards Walk"
                    maxLength={80}
                  />
                  <span className="walk-builder-char-count">{name.length}/80</span>
                </label>

                <div className="walk-builder-field-row">
                  <label className="walk-builder-field">
                    <span className="walk-builder-label">Category</span>
                    <select
                      className="walk-builder-input walk-builder-select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number]["value"])}
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.icon} {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="walk-builder-field">
                    <span className="walk-builder-label">Estimated Time</span>
                    <select
                      className="walk-builder-input walk-builder-select"
                      value={estimatedTime}
                      onChange={(e) => setEstimatedTime(e.target.value as (typeof TIME_OPTIONS)[number])}
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="walk-builder-field">
                  <span className="walk-builder-label">Description (optional)</span>
                  <textarea
                    className="walk-builder-input walk-builder-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe when and how managers should use this walk."
                    maxLength={250}
                    rows={3}
                  />
                  <span className="walk-builder-char-count">{description.length}/250</span>
                </label>

                <label className="walk-builder-field walk-builder-toggle-field">
                  <input
                    type="checkbox"
                    checked={scoringEnabled}
                    onChange={(e) => setScoringEnabled(e.target.checked)}
                  />
                  <span>
                    <strong>Enable scoring</strong>
                    <span className="walk-builder-toggle-hint"> (pass rate % on completed walks)</span>
                  </span>
                </label>

                <label className="walk-builder-field">
                  <span className="walk-builder-label">Tags (optional)</span>
                  <input
                    className="walk-builder-input"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. Opening, Standards, Front End"
                  />
                </label>
              </div>
            </section>

            <section className="walk-builder-card">
              <header className="walk-builder-card-head walk-builder-card-head--split">
                <div className="walk-builder-card-head-copy">
                  <div className="walk-builder-card-head-top">
                    <span className="walk-builder-step">2</span>
                    <h2 className="walk-builder-card-title">Observations</h2>
                  </div>
                  <p className="walk-builder-card-sub">
                    Add the observations managers will review during this walk.
                  </p>
                </div>
                <div className="walk-builder-card-head-actions">
                  <button type="button" className="walk-builder-link-btn" onClick={addSection}>
                    + Add Section
                  </button>
                  <button type="button" className="walk-builder-btn-outline" disabled>
                    Import Template
                  </button>
                </div>
              </header>

              <div className="walk-builder-sections">
                {sections.map((section, sectionIndex) => (
                  <div key={section.id} className="walk-builder-section-block">
                    <div className="walk-builder-section-head">
                      <input
                        className="walk-builder-section-title"
                        value={section.title}
                        onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                        placeholder={`Section ${sectionIndex + 1}`}
                        maxLength={120}
                        aria-label={`Section ${sectionIndex + 1} title`}
                      />
                      <div className="walk-builder-section-head-actions">
                        <button
                          type="button"
                          className="walk-builder-link-btn"
                          onClick={() => addObservation(section.id)}
                        >
                          + Add Observation
                        </button>
                        <button
                          type="button"
                          className="walk-builder-icon-btn walk-builder-icon-btn--danger"
                          aria-label={`Delete section ${section.title || sectionIndex + 1}`}
                          disabled={sections.length <= 1}
                          onClick={() => removeSection(section.id)}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>

                    <ul
                      className="walk-builder-obs-list"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        moveObservation(section.id, section.observations.length);
                        setDragTarget(null);
                      }}
                    >
                      {section.observations.map((row, index) => (
                        <li
                          key={row.id}
                          className={`walk-builder-obs-row${
                            dragTarget?.observationId === row.id
                              ? " walk-builder-obs-row--dragging"
                              : ""
                          }`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            moveObservation(section.id, index);
                            setDragTarget(null);
                          }}
                        >
                          <button
                            type="button"
                            className="walk-builder-obs-grip"
                            aria-label={`Reorder observation ${globalObservationIndex.get(row.id) ?? index + 1}`}
                            draggable
                            onDragStart={() => setDragTarget({ sectionId: section.id, observationId: row.id })}
                            onDragEnd={() => setDragTarget(null)}
                          >
                            <IconGrip />
                          </button>
                          <span className="walk-builder-obs-badge">
                            {globalObservationIndex.get(row.id) ?? index + 1}
                          </span>
                          <div className="walk-builder-obs-fields">
                            <input
                              className="walk-builder-obs-title"
                              value={row.label}
                              onChange={(e) =>
                                updateObservation(section.id, row.id, { label: e.target.value })
                              }
                              placeholder="Observation title"
                              maxLength={280}
                            />
                            <input
                              className="walk-builder-obs-helper"
                              value={row.helperText}
                              onChange={(e) =>
                                updateObservation(section.id, row.id, { helperText: e.target.value })
                              }
                              placeholder="Optional helper text for managers"
                              maxLength={200}
                            />
                          </div>
                          <div className="walk-builder-obs-actions">
                            {row.required ? <span className="walk-builder-obs-pill">Required</span> : null}
                            <button
                              type="button"
                              className={`walk-builder-icon-btn${row.photoRequired ? " walk-builder-icon-btn--active" : ""}`}
                              aria-label="Photo required"
                              aria-pressed={row.photoRequired}
                              onClick={() =>
                                updateObservation(section.id, row.id, { photoRequired: !row.photoRequired })
                              }
                            >
                              <IconCamera active={row.photoRequired} />
                            </button>
                            <button
                              type="button"
                              className={`walk-builder-icon-btn${row.commentRequired ? " walk-builder-icon-btn--active" : ""}`}
                              aria-label="Comment required"
                              aria-pressed={row.commentRequired}
                              onClick={() =>
                                updateObservation(section.id, row.id, { commentRequired: !row.commentRequired })
                              }
                            >
                              <IconComment active={row.commentRequired} />
                            </button>
                            <button
                              type="button"
                              className="walk-builder-icon-btn"
                              aria-label="Duplicate observation"
                              onClick={() => duplicateObservation(section.id, index)}
                            >
                              <IconCopy />
                            </button>
                            <button
                              type="button"
                              className="walk-builder-icon-btn walk-builder-icon-btn--danger"
                              aria-label="Delete observation"
                              disabled={section.observations.length <= 1}
                              onClick={() => removeObservation(section.id, row.id)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="walk-builder-preview-col">
            <section className="walk-builder-card walk-builder-preview-card">
              <header className="walk-builder-preview-head">
                <div className="walk-builder-preview-title-row">
                  <IconEye />
                  <h2>Live Walk Preview</h2>
                </div>
                <span className="walk-builder-preview-pill">{previewItems.length} items</span>
              </header>

              <div className="walk-builder-preview-body">
                <h3 className="walk-builder-preview-walk-title">{name.trim() || "Untitled Walk"}</h3>
                <p className="walk-builder-preview-meta">
                  <span>
                    {categoryMeta.icon} {categoryMeta.label}
                  </span>
                  <span aria-hidden>•</span>
                  <span>{estimatedTime.replace(" minutes", " min")}</span>
                </p>

                <div className="walk-builder-preview-sections">
                  {sections.map((section) => {
                    const sectionItems = section.observations.filter((row) => row.label.trim());
                    if (sectionItems.length === 0) return null;
                    return (
                      <div key={section.id} className="walk-builder-preview-section">
                        <h4 className="walk-builder-preview-section-title">
                          {section.title.trim() || "Untitled section"}
                        </h4>
                        <ol className="walk-builder-preview-list">
                          {sectionItems.map((row) => (
                            <li key={row.id}>
                              <span className="walk-builder-preview-index">
                                {globalObservationIndex.get(row.id)}
                              </span>
                              <span>{row.label.trim()}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>

                {previewItems.length > 6 ? (
                  <p className="walk-builder-preview-more-copy">
                    + {previewItems.length - 6} more observations in this walk
                  </p>
                ) : null}

                <div className="walk-builder-preview-score">
                  <span className="walk-builder-preview-score-label">Pass Rate Preview</span>
                  <strong className="walk-builder-preview-score-value">—</strong>
                  <p className="walk-builder-preview-score-hint">Complete this walk to see score.</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {localErr || error ? (
        <p className="walk-builder-error" role="alert">
          {localErr || error}
        </p>
      ) : null}

      <footer className="walk-builder-savebar">
        <div className="walk-builder-savebar-inner">
          <div className="walk-builder-savebar-status">
            {hasUnsavedChanges ? (
              <>
                <span className="walk-builder-savebar-dot" aria-hidden />
                You have unsaved changes
              </>
            ) : (
              <span className="enterprise-muted">All changes saved</span>
            )}
          </div>
          <p className="walk-builder-savebar-saved">
            {lastSavedAt ? `Last saved: ${lastSavedAt.toLocaleTimeString()}` : "Not saved yet"}
          </p>
          <div className="walk-builder-savebar-actions">
            <button type="button" className="walk-builder-btn-secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="walk-builder-btn-primary"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {busy ? "Saving…" : "Save Walk"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
