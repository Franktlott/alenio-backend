import { useCallback, useEffect, useState } from "react";
import {
  createOneOnOneTemplate,
  deleteOneOnOneTemplate,
  fetchOneOnOneTemplates,
  updateOneOnOneTemplate,
  type OneOnOneTemplate,
  type OneOnOneTemplateField,
  type OneOnOneTemplateFieldType,
} from "../lib/api";

const FIELD_TYPE_OPTIONS: {
  value: OneOnOneTemplateFieldType;
  label: string;
  defaultLabel: string;
}[] = [
  { value: "short_text", label: "Short answer", defaultLabel: "Question" },
  { value: "long_text", label: "Long answer", defaultLabel: "Question" },
  { value: "rating", label: "Rating", defaultLabel: "Rating" },
  { value: "manager_notes", label: "Manager notes", defaultLabel: "Manager notes" },
  { value: "associate_notes", label: "Associate notes", defaultLabel: "Associate notes" },
];

function fieldTypeLabel(type: OneOnOneTemplateFieldType): string {
  return FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function newField(type: OneOnOneTemplateFieldType, order: number): OneOnOneTemplateField {
  const opt = FIELD_TYPE_OPTIONS.find((o) => o.value === type)!;
  return {
    id: crypto.randomUUID(),
    label: opt.defaultLabel,
    type,
    order,
    required: false,
    ...(type === "rating" ? { ratingMax: 5 } : {}),
  };
}

function emptyEditorState() {
  return {
    title: "",
    description: "",
    fields: [newField("short_text", 0)],
  };
}

type Props = {
  teamId: string;
  open: boolean;
  onClose: () => void;
};

export function OneOnOneTemplatesModal({ teamId, open, onClose }: Props) {
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<OneOnOneTemplateField[]>([]);

  const loadTemplates = useCallback(async () => {
    if (!teamId) return;
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

  useEffect(() => {
    if (!open) return;
    setView("list");
    setEditingId(null);
    void loadTemplates();
  }, [open, loadTemplates]);

  const openCreate = () => {
    const blank = emptyEditorState();
    setEditingId(null);
    setTitle(blank.title);
    setDescription(blank.description);
    setFields(blank.fields);
    setErr(null);
    setView("editor");
  };

  const openEdit = (template: OneOnOneTemplate) => {
    setEditingId(template.id);
    setTitle(template.title);
    setDescription(template.description ?? "");
    setFields([...template.fields].sort((a, b) => a.order - b.order));
    setErr(null);
    setView("editor");
  };

  const addField = (type: OneOnOneTemplateFieldType) => {
    setFields((prev) => [...prev, newField(type, prev.length)]);
  };

  const updateField = (id: string, patch: Partial<OneOnOneTemplateField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields((prev) =>
      prev.filter((f) => f.id !== id).map((f, index) => ({ ...f, order: index })),
    );
  };

  const moveField = (id: string, direction: -1 | 1) => {
    setFields((prev) => {
      const index = prev.findIndex((f) => f.id === id);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy.map((f, i) => ({ ...f, order: i }));
    });
  };

  const onSave = async () => {
    if (!title.trim()) {
      setErr("Template name is required.");
      return;
    }
    if (fields.length === 0) {
      setErr("Add at least one field.");
      return;
    }
    if (fields.some((f) => !f.label.trim())) {
      setErr("Every field needs a label.");
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: fields.map((f, index) => ({
          ...f,
          label: f.label.trim(),
          order: index,
          required: Boolean(f.required),
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

  const onDelete = async (template: OneOnOneTemplate) => {
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
  };

  if (!open) return null;

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-modal-sheet enterprise-oneone-templates-modal"
        role="dialog"
        aria-label="1:1 templates"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <header className="enterprise-oneone-templates-head">
          {view === "editor" ? (
            <button
              type="button"
              className="enterprise-oneone-templates-back"
              onClick={() => {
                setView("list");
                setEditingId(null);
                setErr(null);
              }}
            >
              ← Back to list
            </button>
          ) : null}
          <h2 className="enterprise-oneone-templates-title">
            {view === "list" ? "1:1 templates" : editingId ? "Edit template" : "New 1:1 template"}
          </h2>
          {view === "list" ? (
            <button type="button" className="auth-submit enterprise-oneone-templates-create-btn" onClick={openCreate}>
              + Create template
            </button>
          ) : null}
        </header>

        {err ? (
          <p className="enterprise-form-error" role="alert">
            {err}
          </p>
        ) : null}

        {view === "list" ? (
          <div className="enterprise-oneone-templates-list-wrap">
            {loading ? <p className="enterprise-muted">Loading…</p> : null}
            {!loading && templates.length === 0 ? (
              <p className="enterprise-muted enterprise-oneone-templates-empty">
                No 1:1 templates yet. Create one to define questions, ratings, and notes for check-ins.
              </p>
            ) : null}
            {!loading && templates.length > 0 ? (
              <ul className="enterprise-oneone-templates-list">
                {templates.map((template) => (
                  <li key={template.id} className="enterprise-oneone-templates-list-item">
                    <button type="button" className="enterprise-oneone-templates-list-main" onClick={() => openEdit(template)}>
                      <strong>{template.title}</strong>
                      <span className="enterprise-muted">
                        {template.fields.length} field{template.fields.length !== 1 ? "s" : ""}
                        {template.description ? ` · ${template.description}` : ""}
                      </span>
                      <span className="enterprise-oneone-templates-field-tags">
                        {template.fields.slice(0, 4).map((f) => (
                          <span key={f.id} className="enterprise-oneone-templates-field-tag">
                            {fieldTypeLabel(f.type)}
                          </span>
                        ))}
                        {template.fields.length > 4 ? (
                          <span className="enterprise-oneone-templates-field-tag">+{template.fields.length - 4}</span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="enterprise-oneone-templates-delete-btn"
                      aria-label={`Delete ${template.title}`}
                      onClick={() => void onDelete(template)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="enterprise-oneone-templates-editor">
            <label className="enterprise-muted enterprise-profile-label" htmlFor="oneone-template-title">
              Template name
            </label>
            <input
              id="oneone-template-title"
              className="auth-input enterprise-oneone-templates-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Monthly check-in"
            />

            <label className="enterprise-muted enterprise-profile-label" htmlFor="oneone-template-desc">
              Description <span className="enterprise-muted">(optional)</span>
            </label>
            <input
              id="oneone-template-desc"
              className="auth-input enterprise-oneone-templates-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When to use this template"
            />

            <div className="enterprise-oneone-templates-fields-head">
              <h3 className="enterprise-oneone-templates-fields-title">Fields</h3>
              <div className="enterprise-oneone-templates-add-field-wrap">
                <select
                  className="auth-input enterprise-oneone-templates-add-field-select"
                  defaultValue=""
                  onChange={(e) => {
                    const value = e.target.value as OneOnOneTemplateFieldType;
                    if (!value) return;
                    addField(value);
                    e.target.value = "";
                  }}
                  aria-label="Add field type"
                >
                  <option value="">+ Add field…</option>
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <ul className="enterprise-oneone-templates-fields">
              {fields.map((field, index) => (
                <li key={field.id} className="enterprise-oneone-templates-field-row">
                  <div className="enterprise-oneone-templates-field-row-top">
                    <span className="enterprise-oneone-templates-field-type-badge">{fieldTypeLabel(field.type)}</span>
                    <div className="enterprise-oneone-templates-field-actions">
                      <button
                        type="button"
                        className="enterprise-oneone-templates-field-move"
                        disabled={index === 0}
                        aria-label="Move up"
                        onClick={() => moveField(field.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="enterprise-oneone-templates-field-move"
                        disabled={index === fields.length - 1}
                        aria-label="Move down"
                        onClick={() => moveField(field.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="enterprise-oneone-templates-field-remove"
                        aria-label="Remove field"
                        disabled={fields.length <= 1}
                        onClick={() => removeField(field.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <label className="enterprise-muted enterprise-oneone-templates-field-label" htmlFor={`field-label-${field.id}`}>
                    Label
                  </label>
                  <input
                    id={`field-label-${field.id}`}
                    className="auth-input enterprise-oneone-templates-field-input"
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                  />
                  {field.type === "rating" ? (
                    <>
                      <label className="enterprise-muted enterprise-oneone-templates-field-label" htmlFor={`field-max-${field.id}`}>
                        Max rating
                      </label>
                      <select
                        id={`field-max-${field.id}`}
                        className="auth-input enterprise-oneone-templates-field-input"
                        value={field.ratingMax ?? 5}
                        onChange={(e) => updateField(field.id, { ratingMax: Number(e.target.value) })}
                      >
                        {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <label className="enterprise-oneone-templates-required">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </li>
              ))}
            </ul>

            <div className="enterprise-oneone-templates-editor-actions">
              <button
                type="button"
                className="enterprise-profile-cancel-btn"
                disabled={saving}
                onClick={() => {
                  setView("list");
                  setEditingId(null);
                  setErr(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="auth-submit enterprise-oneone-templates-save-btn" disabled={saving} onClick={() => void onSave()}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
