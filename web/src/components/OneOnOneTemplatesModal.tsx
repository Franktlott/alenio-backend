import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addCheckInTemplateFromLibrary,
  createOneOnOneTemplate,
  deleteOneOnOneTemplate,
  fetchCheckInTemplateLibrary,
  fetchOneOnOneTemplates,
  updateOneOnOneTemplate,
  type CheckInLibraryTemplate,
  type OneOnOneTemplate,
  type OneOnOneTemplateField,
  type OneOnOneTemplateFieldType,
} from "../lib/api";
import { appendLeaderCommentsIfMissing } from "../lib/check-in-leader-comments";

const QUESTION_TYPE_OPTIONS: {
  value: OneOnOneTemplateFieldType;
  label: string;
  defaultLabel: string;
}[] = [
  { value: "short_text", label: "Short answer", defaultLabel: "Question" },
  { value: "long_text", label: "Long answer", defaultLabel: "Question" },
  { value: "rating", label: "Rating", defaultLabel: "Rating" },
];

const FIELD_TYPE_LABELS: Record<OneOnOneTemplateFieldType, string> = {
  section: "Section",
  short_text: "Short answer",
  long_text: "Long answer",
  rating: "Rating",
  manager_notes: "Leader comments",
  associate_notes: "Associate notes",
};

type SectionGroup = {
  section: OneOnOneTemplateField;
  fields: OneOnOneTemplateField[];
};

function isSection(f: OneOnOneTemplateField) {
  return f.type === "section";
}

function fieldTypeLabel(type: OneOnOneTemplateFieldType, ratingMax?: number): string {
  if (type === "rating") return `Rating (1-${ratingMax ?? 5})`;
  return FIELD_TYPE_LABELS[type] ?? type;
}

function newSection(title: string): OneOnOneTemplateField {
  return {
    id: crypto.randomUUID(),
    label: title,
    type: "section",
    order: 0,
    required: false,
  };
}

function newQuestion(type: OneOnOneTemplateFieldType): OneOnOneTemplateField {
  const opt = QUESTION_TYPE_OPTIONS.find((o) => o.value === type)!;
  return {
    id: crypto.randomUUID(),
    label: opt.defaultLabel,
    type,
    order: 0,
    required: false,
    helpText: null,
    ...(type === "rating" ? { ratingMax: 5 } : {}),
  };
}

function reorderFields(items: OneOnOneTemplateField[]): OneOnOneTemplateField[] {
  return items.map((f, i) => ({ ...f, order: i }));
}

function parseSections(fields: OneOnOneTemplateField[]): SectionGroup[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;

  for (const field of sorted) {
    if (isSection(field)) {
      current = { section: field, fields: [] };
      groups.push(current);
    } else if (current) {
      current.fields.push(field);
    } else {
      const fallback = newSection("General");
      current = { section: fallback, fields: [field] };
      groups.push(current);
    }
  }

  if (groups.length === 0) {
    groups.push({ section: newSection("Opening"), fields: [] });
  }

  return groups;
}

function flattenSections(groups: SectionGroup[]): OneOnOneTemplateField[] {
  const flat: OneOnOneTemplateField[] = [];
  for (const group of groups) {
    flat.push(group.section);
    flat.push(...group.fields);
  }
  return reorderFields(flat);
}

function normalizeLoadedFields(fields: OneOnOneTemplateField[]): OneOnOneTemplateField[] {
  const sorted = reorderFields([...fields]);
  if (sorted.some(isSection)) return sorted;
  return flattenSections([{ section: newSection("Opening"), fields: sorted.filter((f) => !isSection(f)) }]);
}

function emptyEditorState() {
  const section = newSection("");
  const base = flattenSections([{ section, fields: [newQuestion("short_text")] }]);
  return {
    title: "",
    description: "",
    fields: appendLeaderCommentsIfMissing(base),
  };
}

type Props = {
  teamId: string;
  open: boolean;
  onClose: () => void;
};

type EditorView = "edit" | "preview";
type ModalView = "list" | "library" | "editor";

export function OneOnOneTemplatesModal({ teamId, open, onClose }: Props) {
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [library, setLibrary] = useState<CheckInLibraryTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingLibraryKey, setAddingLibraryKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<ModalView>("list");
  const [librarySearch, setLibrarySearch] = useState("");
  const [previewSource, setPreviewSource] = useState<"team" | "library" | null>(null);
  const [editorView, setEditorView] = useState<EditorView>("edit");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<OneOnOneTemplateField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [fieldMenuId, setFieldMenuId] = useState<string | null>(null);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);

  const sectionGroups = useMemo(() => parseSections(fields), [fields]);
  const selectedField = fields.find((f) => f.id === selectedFieldId && !isSection(f)) ?? null;
  const questionFields = fields.filter((f) => !isSection(f));

  const teamLibraryKeys = useMemo(
    () => new Set(templates.map((template) => template.libraryKey).filter((key): key is string => !!key)),
    [templates],
  );

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" })),
    [library],
  );

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    if (!query) return sortedLibrary;
    return sortedLibrary.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.fields.some((field) => field.type !== "section" && field.label.toLowerCase().includes(query)),
    );
  }, [librarySearch, sortedLibrary]);

  const sortedTeamTemplates = useMemo(
    () => [...templates].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" })),
    [templates],
  );

  const loadTemplates = useCallback(async () => {
    if (!teamId?.trim()) {
      setErr("No workspace selected.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchOneOnOneTemplates(teamId);
      setTemplates(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const list = await fetchCheckInTemplateLibrary();
      setLibrary(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load template library.");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setView("list");
    setEditorView("edit");
    setEditingId(null);
    setPreviewOnly(false);
    setPreviewSource(null);
    setLibrarySearch("");
    setMoreOpen(false);
    setFieldMenuId(null);
    void loadTemplates();
  }, [open, loadTemplates]);

  const openLibraryBrowse = () => {
    setErr(null);
    setLibrarySearch("");
    setView("library");
    if (library.length === 0) {
      void loadLibrary();
    }
  };

  useEffect(() => {
    if (!fieldMenuId && !moreOpen) return;
    const closeMenus = () => {
      setFieldMenuId(null);
      setMoreOpen(false);
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, [fieldMenuId, moreOpen]);

  const openCreate = () => {
    const blank = emptyEditorState();
    setEditingId(null);
    setPreviewOnly(false);
    setTitle(blank.title);
    setDescription(blank.description);
    setFields(blank.fields);
    setSelectedFieldId(blank.fields.find((f) => !isSection(f))?.id ?? null);
    setCollapsedSections(new Set());
    setErr(null);
    setEditorView("edit");
    setView("editor");
  };

  const loadTemplateIntoEditor = (template: OneOnOneTemplate, mode: EditorView, readOnly: boolean) => {
    const normalized = normalizeLoadedFields(template.fields);
    setEditingId(template.id);
    setPreviewOnly(readOnly);
    setTitle(template.title);
    setDescription(template.description ?? "");
    setFields(normalized);
    setSelectedFieldId(normalized.find((f) => !isSection(f))?.id ?? null);
    setCollapsedSections(new Set());
    setErr(null);
    setEditorView(mode);
    setView("editor");
  };

  const openEdit = (template: OneOnOneTemplate) => {
    loadTemplateIntoEditor(template, "edit", false);
  };

  const openPreview = (template: OneOnOneTemplate) => {
    setPreviewSource("team");
    loadTemplateIntoEditor(template, "preview", true);
  };

  const openLibraryPreview = (item: CheckInLibraryTemplate) => {
    const normalized = normalizeLoadedFields(item.fields);
    setEditingId(null);
    setPreviewOnly(true);
    setPreviewSource("library");
    setTitle(item.title);
    setDescription(item.description ?? "");
    setFields(normalized);
    setSelectedFieldId(null);
    setCollapsedSections(new Set());
    setErr(null);
    setEditorView("preview");
    setView("editor");
  };

  const exitPreviewToSource = () => {
    setView(previewSource === "library" ? "library" : "list");
    setPreviewOnly(false);
    setEditorView("edit");
    setPreviewSource(null);
    setErr(null);
  };

  const addLibraryToTeam = async (libraryKey: string) => {
    if (!teamId?.trim()) return;
    setAddingLibraryKey(libraryKey);
    setErr(null);
    try {
      await addCheckInTemplateFromLibrary(teamId, libraryKey);
      await loadTemplates();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add template to team.");
    } finally {
      setAddingLibraryKey(null);
    }
  };

  const updateField = (id: string, patch: Partial<OneOnOneTemplateField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const addSection = () => {
    const section = newSection("");
    setFields((prev) => [...prev, section]);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(section.id);
      return next;
    });
  };

  const addQuestion = (afterSectionId?: string) => {
    const question = newQuestion("short_text");
    setFields((prev) => {
      const groups = parseSections(prev);
      const targetIdx = afterSectionId
        ? groups.findIndex((g) => g.section.id === afterSectionId)
        : groups.length - 1;
      const idx = targetIdx >= 0 ? targetIdx : groups.length - 1;
      groups[idx].fields.push(question);
      return flattenSections(groups);
    });
    setSelectedFieldId(question.id);
    setFieldMenuId(null);
  };

  const removeField = (id: string) => {
    const next = fields.filter((f) => f.id !== id);
    const groups = parseSections(
      next.length ? next : flattenSections([{ section: newSection("Opening"), fields: [] }]),
    );
    const flat = flattenSections(groups);
    setFields(flat);
    if (selectedFieldId === id) {
      setSelectedFieldId(flat.find((f) => !isSection(f))?.id ?? null);
    }
    setFieldMenuId(null);
  };

  const duplicateField = (id: string) => {
    const source = fields.find((f) => f.id === id);
    if (!source || isSection(source)) return;
    const copy: OneOnOneTemplateField = {
      ...source,
      id: crypto.randomUUID(),
      label: `${source.label} (copy)`,
    };
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return reorderFields(next);
    });
    setSelectedFieldId(copy.id);
    setFieldMenuId(null);
  };

  const moveFieldInFlatList = (id: string, direction: -1 | 1) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return reorderFields(copy);
    });
  };

  const onDragReorder = (targetId: string) => {
    if (!dragFieldId || dragFieldId === targetId) return;
    setFields((prev) => {
      const from = prev.findIndex((f) => f.id === dragFieldId);
      const to = prev.findIndex((f) => f.id === targetId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return reorderFields(copy);
    });
    setDragFieldId(null);
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const onSave = async () => {
    if (!teamId?.trim()) {
      setErr("No workspace selected.");
      return;
    }
    if (!title.trim()) {
      setErr("Template name is required.");
      return;
    }
    if (questionFields.length === 0) {
      setErr("Add at least one question.");
      return;
    }
    if (questionFields.some((f) => !f.label.trim())) {
      setErr("Every question needs a label.");
      return;
    }
    const sectionFields = fields.filter(isSection);
    if (sectionFields.some((f) => !f.label.trim())) {
      setErr("Every section needs a name.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: reorderFields(fields).map((f) => ({
          ...f,
          label: f.label.trim(),
          required: isSection(f) ? false : Boolean(f.required),
          helpText: f.helpText?.trim() || null,
          ...(f.type === "rating" ? { ratingMax: f.ratingMax ?? 5 } : {}),
        })),
      };
      if (editingId) {
        await updateOneOnOneTemplate(teamId, editingId, payload);
      } else {
        await createOneOnOneTemplate(teamId, payload);
      }
      await loadTemplates();
      setView("list");
      setEditingId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save template.");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteTemplate = async (template: OneOnOneTemplate) => {
    if (!window.confirm(`Delete "${template.title}"? This cannot be undone.`)) return;
    setErr(null);
    try {
      await deleteOneOnOneTemplate(teamId, template.id);
      await loadTemplates();
      if (editingId === template.id) {
        setView("list");
        setEditingId(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete template.");
    }
    setMoreOpen(false);
  };

  if (!open) return null;

  const isDraft = !editingId;

  return (
    <div className="enterprise-modal-backdrop enterprise-oneone-templates-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`enterprise-modal-sheet enterprise-oneone-templates-modal${view === "editor" ? " enterprise-oneone-templates-modal--editor" : " enterprise-oneone-templates-modal--list"}`}
        role="dialog"
        aria-label="Check-in templates"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "list" ? (
          <>
            <header className="enterprise-oneone-templates-list-header">
              <div className="enterprise-oneone-templates-list-header-text">
                <p className="enterprise-oneone-templates-kicker">Team · Check-ins</p>
                <h2 className="enterprise-oneone-templates-title">Check-in templates</h2>
                <p className="enterprise-oneone-templates-subtitle">
                  Manage your team&apos;s check-ins or search the library for ready-to-use templates.
                </p>
              </div>
              <div className="enterprise-oneone-templates-list-header-actions">
                {!loading && templates.length > 0 ? (
                  <button
                    type="button"
                    className="enterprise-oneone-templates-library-search-btn enterprise-oneone-templates-library-search-btn--header"
                    onClick={openLibraryBrowse}
                  >
                    Search check-in library
                  </button>
                ) : null}
                <button type="button" className="enterprise-oneone-templates-primary-btn" onClick={openCreate}>
                  + New Template
                </button>
                <button type="button" className="enterprise-oneone-templates-close" aria-label="Close" onClick={onClose}>
                  ×
                </button>
              </div>
            </header>
            {err ? <p className="enterprise-form-error enterprise-oneone-templates-list-error" role="alert">{err}</p> : null}
            <div className="enterprise-oneone-templates-list-wrap">
              <section className="enterprise-oneone-templates-section">
                <header className="enterprise-oneone-templates-section-head enterprise-oneone-templates-section-head--compact">
                  <h3 className="enterprise-oneone-templates-section-title">Your team templates</h3>
                </header>
                {loading ? <p className="enterprise-muted enterprise-oneone-templates-list-status">Loading team templates…</p> : null}
                {!loading && templates.length === 0 ? (
                  <div className="enterprise-oneone-templates-empty-panel enterprise-oneone-templates-empty-panel--compact">
                    <p className="enterprise-oneone-templates-empty-title">No team templates yet</p>
                    <p className="enterprise-muted enterprise-oneone-templates-empty">
                      Search the check-in library to add a template, or create your own with + New Template.
                    </p>
                    <button type="button" className="enterprise-oneone-templates-library-search-btn" onClick={openLibraryBrowse}>
                      Search check-in library
                    </button>
                  </div>
                ) : null}
                {!loading && templates.length > 0 ? (
                  <div className="enterprise-oneone-templates-scroll-panel">
                    <ul className="enterprise-oneone-templates-compact-list">
                      {sortedTeamTemplates.map((template) => {
                        const questionCount = template.fields.filter((f) => f.type !== "section").length;
                        return (
                          <li key={template.id} className="enterprise-oneone-templates-compact-item">
                            <button
                              type="button"
                              className="enterprise-oneone-templates-compact-main"
                              onClick={() => openPreview(template)}
                              title={template.description ?? undefined}
                            >
                              <span className="enterprise-oneone-templates-compact-title">{template.title}</span>
                              <span className="enterprise-oneone-templates-compact-meta">
                                {questionCount} question{questionCount !== 1 ? "s" : ""}
                              </span>
                            </button>
                            <div className="enterprise-oneone-templates-compact-actions">
                              <button
                                type="button"
                                className="enterprise-oneone-templates-table-action"
                                onClick={() => openPreview(template)}
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                className="enterprise-oneone-templates-table-action"
                                onClick={() => openEdit(template)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                                aria-label={`Delete ${template.title}`}
                                onClick={() => void onDeleteTemplate(template)}
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </section>
            </div>
          </>
        ) : view === "library" ? (
          <>
            <header className="enterprise-oneone-templates-list-header">
              <div className="enterprise-oneone-templates-list-header-text">
                <button type="button" className="enterprise-oneone-templates-library-back" onClick={() => setView("list")}>
                  ← Back to team templates
                </button>
                <p className="enterprise-oneone-templates-kicker">Template library</p>
                <h2 className="enterprise-oneone-templates-title">Search check-in library</h2>
                <p className="enterprise-oneone-templates-subtitle">
                  Browse ready-to-use check-ins in alphabetical order. Preview first, then add to your team.
                </p>
              </div>
              <div className="enterprise-oneone-templates-list-header-actions">
                <button type="button" className="enterprise-oneone-templates-close" aria-label="Close" onClick={onClose}>
                  ×
                </button>
              </div>
            </header>
            {err ? <p className="enterprise-form-error enterprise-oneone-templates-list-error" role="alert">{err}</p> : null}
            <div className="enterprise-oneone-templates-list-wrap enterprise-oneone-templates-list-wrap--library">
              <label className="enterprise-oneone-templates-library-search">
                <span className="visually-hidden">Search check-in library</span>
                <input
                  type="search"
                  className="auth-input enterprise-oneone-templates-library-search-input"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Search check-ins…"
                  autoFocus
                />
              </label>
              <div className="enterprise-oneone-templates-scroll-panel">
                {libraryLoading ? <p className="enterprise-muted enterprise-oneone-templates-list-status">Loading library…</p> : null}
                {!libraryLoading && filteredLibrary.length === 0 ? (
                  <p className="enterprise-muted enterprise-oneone-templates-library-empty">
                    {librarySearch.trim() ? "No check-ins match your search." : "No library templates available."}
                  </p>
                ) : null}
                {!libraryLoading && filteredLibrary.length > 0 ? (
                  <ul className="enterprise-oneone-templates-compact-list">
                    {filteredLibrary.map((item) => {
                      const questionCount = item.fields.filter((f) => f.type !== "section").length;
                      const onTeam = teamLibraryKeys.has(item.key);
                      return (
                        <li key={item.key} className="enterprise-oneone-templates-compact-item">
                          <button
                            type="button"
                            className="enterprise-oneone-templates-compact-main"
                            onClick={() => openLibraryPreview(item)}
                            title={item.description ?? undefined}
                          >
                            <span className="enterprise-oneone-templates-compact-title">{item.title}</span>
                            <span className="enterprise-oneone-templates-compact-meta">
                              {questionCount} question{questionCount !== 1 ? "s" : ""}
                              {onTeam ? " · On team" : ""}
                            </span>
                          </button>
                          <div className="enterprise-oneone-templates-compact-actions">
                            <button
                              type="button"
                              className="enterprise-oneone-templates-table-action"
                              onClick={() => openLibraryPreview(item)}
                            >
                              Preview
                            </button>
                            <button
                              type="button"
                              className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--primary"
                              disabled={onTeam || addingLibraryKey === item.key}
                              onClick={() => void addLibraryToTeam(item.key)}
                            >
                              {onTeam ? "On team" : addingLibraryKey === item.key ? "Adding…" : "Add to team"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="enterprise-oneone-templates-editor-top">
              <div className="enterprise-oneone-templates-editor-top-left">
                <button
                  type="button"
                  className="enterprise-oneone-templates-back"
                  onClick={() => {
                    if (previewOnly && !editingId) {
                      exitPreviewToSource();
                      return;
                    }
                    setView(previewSource === "library" ? "library" : "list");
                    setEditingId(null);
                    setEditorView("edit");
                    setPreviewOnly(false);
                    setPreviewSource(null);
                    setErr(null);
                  }}
                >
                  ← Back to templates
                </button>
                <div className="enterprise-oneone-templates-editor-title-row">
                  <h2 className="enterprise-oneone-templates-editor-title">
                    {editingId ? "Edit template:" : "New template:"}
                  </h2>
                  <input
                    className="enterprise-oneone-templates-editor-title-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Template name"
                    aria-label="Template name"
                  />
                  {isDraft ? <span className="enterprise-oneone-templates-draft-badge">Draft</span> : null}
                </div>
                {!previewOnly && editorView === "edit" ? (
                  <input
                    className="enterprise-oneone-templates-editor-desc-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description (optional)"
                    aria-label="Template description"
                  />
                ) : null}
              </div>
              <div className="enterprise-oneone-templates-editor-top-actions">
                {previewOnly && !editingId ? (
                  <button type="button" className="enterprise-oneone-templates-toolbar-btn" onClick={exitPreviewToSource}>
                    Back to library
                  </button>
                ) : previewOnly ? (
                  <button
                    type="button"
                    className="enterprise-oneone-templates-toolbar-btn"
                    onClick={() => {
                      setPreviewOnly(false);
                      setEditorView("edit");
                    }}
                  >
                    Edit template
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`enterprise-oneone-templates-toolbar-btn${editorView === "preview" ? " enterprise-oneone-templates-toolbar-btn--active" : ""}`}
                    onClick={() => setEditorView((v) => (v === "preview" ? "edit" : "preview"))}
                  >
                    Preview
                  </button>
                )}
                <div className="enterprise-oneone-templates-more-wrap">
                  <button
                    type="button"
                    className="enterprise-oneone-templates-toolbar-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreOpen((v) => !v);
                    }}
                  >
                    More ▾
                  </button>
                  {moreOpen ? (
                    <div className="enterprise-oneone-templates-more-menu" onClick={(e) => e.stopPropagation()}>
                      {editingId ? (
                        <button
                          type="button"
                          className="enterprise-oneone-templates-more-item enterprise-oneone-templates-more-item--danger"
                          onClick={() => {
                            const t = templates.find((x) => x.id === editingId);
                            if (t) void onDeleteTemplate(t);
                          }}
                        >
                          Delete template
                        </button>
                      ) : null}
                      <button type="button" className="enterprise-oneone-templates-more-item" onClick={() => setMoreOpen(false)}>
                        Close menu
                      </button>
                    </div>
                  ) : null}
                </div>
                {!previewOnly ? (
                  <button
                    type="button"
                    className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-save-btn"
                    disabled={saving}
                    onClick={() => void onSave()}
                  >
                    {saving ? "Saving…" : "Save template"}
                  </button>
                ) : null}
                <button type="button" className="enterprise-oneone-templates-close" aria-label="Close" onClick={onClose}>
                  ×
                </button>
              </div>
            </header>

            {err ? <p className="enterprise-form-error enterprise-oneone-templates-editor-error" role="alert">{err}</p> : null}

            {editorView === "preview" ? (
              <div className="enterprise-oneone-templates-preview">
                <p className="enterprise-muted enterprise-oneone-templates-preview-intro">
                  This is how team members will see the check-in form.
                </p>
                {description.trim() ? (
                  <p className="enterprise-muted enterprise-oneone-templates-preview-desc">{description.trim()}</p>
                ) : null}
                {sectionGroups.map((group) => (
                  <section key={group.section.id} className="enterprise-oneone-templates-preview-section">
                    <h3>{group.section.label.trim() || "Untitled section"}</h3>
                    <ul>
                      {group.fields.map((field) => (
                        <li key={field.id}>
                          <strong>
                            {field.label}
                            {field.required ? " *" : ""}
                          </strong>
                          <span className="enterprise-muted">{fieldTypeLabel(field.type, field.ratingMax)}</span>
                          {field.helpText ? <p className="enterprise-muted">{field.helpText}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="enterprise-oneone-templates-editor-split">
                <div className="enterprise-oneone-templates-fields-pane">
                  <div className="enterprise-oneone-templates-fields-pane-head">
                    <div>
                      <h3 className="enterprise-oneone-templates-fields-pane-title">Template fields</h3>
                      <p className="enterprise-muted enterprise-oneone-templates-fields-pane-sub">
                        Add sections and questions for this check-in.
                      </p>
                    </div>
                    <div className="enterprise-oneone-templates-fields-pane-actions">
                      <button type="button" className="enterprise-oneone-templates-pane-btn" onClick={addSection}>
                        + Add section
                      </button>
                      <button
                        type="button"
                        className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-pane-btn enterprise-oneone-templates-pane-btn--primary"
                        onClick={() => addQuestion(sectionGroups[sectionGroups.length - 1]?.section.id)}
                      >
                        Add question
                      </button>
                    </div>
                  </div>

                  <div className="enterprise-oneone-templates-sections">
                    {sectionGroups.map((group) => {
                      const collapsed = collapsedSections.has(group.section.id);
                      return (
                        <section key={group.section.id} className="enterprise-oneone-templates-section-block">
                          <div className="enterprise-oneone-templates-section-head">
                            <button
                              type="button"
                              className="enterprise-oneone-templates-section-toggle"
                              onClick={() => toggleSection(group.section.id)}
                              aria-expanded={!collapsed}
                            >
                              <span className="enterprise-oneone-templates-section-chevron">{collapsed ? "▸" : "▾"}</span>
                              <input
                                className={`enterprise-oneone-templates-section-title-input${
                                  !group.section.label.trim() ? " enterprise-oneone-templates-section-title-input--empty" : ""
                                }`}
                                value={group.section.label}
                                onChange={(e) => updateField(group.section.id, { label: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Section name"
                                aria-label="Section name"
                              />
                              <span className="enterprise-oneone-templates-section-count">
                                {group.fields.length} question{group.fields.length !== 1 ? "s" : ""}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="enterprise-oneone-templates-section-add-q"
                              onClick={() => addQuestion(group.section.id)}
                            >
                              + Question
                            </button>
                          </div>

                          {!collapsed ? (
                            <ul className="enterprise-oneone-templates-question-list">
                              {group.fields.map((field, qIndex) => (
                                <li
                                  key={field.id}
                                  className={`enterprise-oneone-templates-question-row${
                                    selectedFieldId === field.id ? " enterprise-oneone-templates-question-row--selected" : ""
                                  }${fieldMenuId === field.id ? " enterprise-oneone-templates-question-row--menu-open" : ""}`}
                                  draggable
                                  onDragStart={() => setDragFieldId(field.id)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => onDragReorder(field.id)}
                                >
                                  <button type="button" className="enterprise-oneone-templates-question-drag" aria-label="Reorder" tabIndex={-1}>
                                    ⠿
                                  </button>
                                  <button
                                    type="button"
                                    className="enterprise-oneone-templates-question-main"
                                    onClick={() => {
                                      setSelectedFieldId(field.id);
                                      setFieldMenuId(null);
                                    }}
                                  >
                                    <span className="enterprise-oneone-templates-question-num">{qIndex + 1}</span>
                                    <span className="enterprise-oneone-templates-question-label">{field.label || "Untitled question"}</span>
                                    <span className="enterprise-oneone-templates-field-type-badge">
                                      {fieldTypeLabel(field.type, field.ratingMax)}
                                    </span>
                                  </button>
                                  <div className="enterprise-oneone-templates-question-menu-wrap">
                                    <button
                                      type="button"
                                      className="enterprise-oneone-templates-question-menu-btn"
                                      aria-label="Question options"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFieldMenuId((id) => (id === field.id ? null : field.id));
                                      }}
                                    >
                                      ⋮
                                    </button>
                                    {fieldMenuId === field.id ? (
                                      <div className="enterprise-oneone-templates-question-menu" onClick={(e) => e.stopPropagation()}>
                                        <button type="button" onClick={() => duplicateField(field.id)}>Duplicate</button>
                                        <button type="button" onClick={() => moveFieldInFlatList(field.id, -1)}>Move up</button>
                                        <button type="button" onClick={() => moveFieldInFlatList(field.id, 1)}>Move down</button>
                                        <button type="button" className="enterprise-oneone-templates-menu-danger" onClick={() => removeField(field.id)}>
                                          Delete
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </li>
                              ))}
                              {group.fields.length === 0 ? (
                                <li className="enterprise-oneone-templates-section-empty">
                                  <button type="button" className="enterprise-muted" onClick={() => addQuestion(group.section.id)}>
                                    + Add a question to this section
                                  </button>
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>

                  <button type="button" className="enterprise-oneone-templates-add-section-link" onClick={addSection}>
                    + Add section
                  </button>
                </div>

                <aside className="enterprise-oneone-templates-field-pane">
                  {selectedField ? (
                    <>
                      <div className="enterprise-oneone-templates-field-pane-head">
                        <h3 className="enterprise-oneone-templates-field-pane-title">Edit field</h3>
                        <button
                          type="button"
                          className="enterprise-oneone-templates-field-delete"
                          onClick={() => removeField(selectedField.id)}
                        >
                          Delete field
                        </button>
                      </div>

                      <label className="enterprise-oneone-templates-field-form-label" htmlFor="oneone-field-label">
                        Label
                      </label>
                      <input
                        id="oneone-field-label"
                        className="auth-input enterprise-oneone-templates-field-form-input"
                        value={selectedField.label}
                        onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      />
                      <p className="enterprise-muted enterprise-oneone-templates-field-hint">
                        {selectedField.type === "manager_notes"
                          ? "Leaders fill this in when running the check-in."
                          : "This is the question your team member will see."}
                      </p>

                      <label className="enterprise-oneone-templates-field-form-label" htmlFor="oneone-field-type">
                        Type
                      </label>
                      {selectedField.type === "manager_notes" ? (
                        <p className="enterprise-oneone-templates-field-type-readonly" id="oneone-field-type">
                          Leader comments
                          <span className="enterprise-muted"> Added automatically to every check-in.</span>
                        </p>
                      ) : (
                        <select
                          id="oneone-field-type"
                          className="auth-input enterprise-oneone-templates-field-form-input"
                          value={selectedField.type}
                          onChange={(e) => {
                            const type = e.target.value as OneOnOneTemplateFieldType;
                            updateField(selectedField.id, {
                              type,
                              ...(type === "rating" ? { ratingMax: selectedField.ratingMax ?? 5 } : {}),
                            });
                          }}
                        >
                          {QUESTION_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}

                      <label className="enterprise-oneone-templates-field-check">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedField.required)}
                          onChange={(e) => updateField(selectedField.id, { required: e.target.checked })}
                        />
                        <span>
                          <strong>Required</strong>
                          <span className="enterprise-muted">Team members must answer this question.</span>
                        </span>
                      </label>

                      <label className="enterprise-oneone-templates-field-form-label" htmlFor="oneone-field-help">
                        Help text <span className="enterprise-muted">(optional)</span>
                      </label>
                      <textarea
                        id="oneone-field-help"
                        className="auth-input enterprise-oneone-templates-field-form-textarea"
                        rows={3}
                        value={selectedField.helpText ?? ""}
                        onChange={(e) => updateField(selectedField.id, { helpText: e.target.value || null })}
                        placeholder="Add guidance or context for this question"
                      />

                      {selectedField.type === "rating" ? (
                        <details className="enterprise-oneone-templates-display-options">
                          <summary>Display options</summary>
                          <label className="enterprise-oneone-templates-field-form-label" htmlFor="oneone-field-rating-max">
                            Max rating
                          </label>
                          <select
                            id="oneone-field-rating-max"
                            className="auth-input enterprise-oneone-templates-field-form-input"
                            value={selectedField.ratingMax ?? 5}
                            onChange={(e) => updateField(selectedField.id, { ratingMax: Number(e.target.value) })}
                          >
                            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </details>
                      ) : null}

                      <div className="enterprise-oneone-templates-field-pane-foot">
                        <button
                          type="button"
                          className="enterprise-profile-cancel-btn"
                          onClick={() => setSelectedFieldId(null)}
                        >
                          Cancel
                        </button>
                        <button type="button" className="enterprise-oneone-templates-primary-btn enterprise-oneone-templates-done-btn" onClick={() => setSelectedFieldId(null)}>
                          Done
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="enterprise-oneone-templates-field-pane-empty">
                      <p className="enterprise-muted">Select a question from the list to edit its settings.</p>
                    </div>
                  )}
                </aside>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
