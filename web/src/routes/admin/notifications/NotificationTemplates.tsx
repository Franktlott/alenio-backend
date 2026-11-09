import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import {
  deletePushTemplate,
  fetchPushTemplates,
  PUSH_BODY_MAX,
  PUSH_LINK_LABELS,
  PUSH_TITLE_MAX,
  PUSH_TYPE_LABELS,
  savePushTemplate,
  type PushCampaignType,
  type PushLinkKind,
  type PushTemplate,
  type PushTemplateInput,
} from "../../../lib/notifications-api";
import { errorText, PhonePreview, TypeIcon } from "./notification-ui";

const EMPTY: PushTemplateInput = {
  name: "",
  title: "",
  body: "",
  type: "product_announcement",
  category: "",
  linkKind: "home",
  linkValue: "",
};

type Props = {
  canCreate: boolean;
  onUse: (template: PushTemplate) => void;
};

function TemplateForm({
  template,
  onDone,
}: {
  template: PushTemplate | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PushTemplateInput>(() =>
    template
      ? {
          name: template.name,
          title: template.title,
          body: template.body,
          type: template.type,
          category: template.category,
          linkKind: template.linkKind,
          linkValue: template.linkValue,
        }
      : EMPTY,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PushTemplateInput>(key: K, value: PushTemplateInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePushTemplate(
        { ...form, name: form.name.trim(), title: form.title.trim(), body: form.body.trim(), category: form.category.trim() },
        template?.id,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "push-templates"] });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="an-template-form" data-testid="an-template-form">
      <div className="an-form">
        <label className="an-field">
          <span>Template name</span>
          <input value={form.name} maxLength={80} onChange={(event) => set("name", event.target.value)} placeholder="Feature launch" />
        </label>
        <label className="an-field">
          <span>
            Title <em>{form.title.length}/{PUSH_TITLE_MAX}</em>
          </span>
          <input value={form.title} maxLength={PUSH_TITLE_MAX} onChange={(event) => set("title", event.target.value)} />
        </label>
        <label className="an-field">
          <span>
            Message <em>{form.body.length}/{PUSH_BODY_MAX}</em>
          </span>
          <textarea rows={3} value={form.body} maxLength={PUSH_BODY_MAX} onChange={(event) => set("body", event.target.value)} />
        </label>
        <div className="an-field-row">
          <label className="an-field">
            <span>Type</span>
            <select value={form.type} onChange={(event) => set("type", event.target.value as PushCampaignType)}>
              {Object.entries(PUSH_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="an-field">
            <span>When tapped, open</span>
            <select value={form.linkKind} onChange={(event) => set("linkKind", event.target.value as PushLinkKind)}>
              {Object.entries(PUSH_LINK_LABELS)
                .filter(([value]) => value !== "discover")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="an-field">
          <span>Category (optional)</span>
          <input value={form.category} maxLength={60} onChange={(event) => set("category", event.target.value)} />
        </label>
        {error ? (
          <p className="an-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="an-row-end">
          <button type="button" className="an-btn" onClick={onDone}>
            Cancel
          </button>
          <button
            type="button"
            className="an-btn an-btn--primary"
            disabled={busy || !form.name.trim() || !form.title.trim() || !form.body.trim()}
            onClick={() => void save()}
            data-testid="an-template-save"
          >
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
      <PhonePreview title={form.title} body={form.body} />
    </div>
  );
}

export function NotificationTemplates({ canCreate, onUse }: Props) {
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ["admin", "push-templates"], queryFn: fetchPushTemplates, staleTime: 30_000 });
  const [editing, setEditing] = useState<PushTemplate | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (template: PushTemplate) => {
    if (!window.confirm(`Delete the template “${template.name}”?`)) return;
    setError(null);
    try {
      await deletePushTemplate(template.id);
      await queryClient.invalidateQueries({ queryKey: ["admin", "push-templates"] });
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <section className="an-card an-templates" data-testid="an-templates">
      <div className="an-card-head">
        <div>
          <h2>Templates</h2>
          <p>Reusable starting points for common announcements.</p>
        </div>
        {canCreate && editing === null ? (
          <button type="button" className="an-btn an-btn--primary" onClick={() => setEditing("new")} data-testid="an-new-template">
            <Plus size={16} />
            New template
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="an-error" role="alert">
          {error}
        </p>
      ) : null}
      {editing ? (
        <TemplateForm template={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
      ) : templates.isLoading ? (
        <p className="an-empty-copy">Loading templates…</p>
      ) : (templates.data ?? []).length === 0 ? (
        <p className="an-empty-copy">No templates yet. Save one to reuse your best announcements.</p>
      ) : (
        <ul className="an-template-list">
          {(templates.data ?? []).map((template) => (
            <li key={template.id}>
              <TypeIcon type={template.type} boxed />
              <div className="an-template-copy">
                <strong>{template.name}</strong>
                <span>{template.title}</span>
                <small>
                  {PUSH_TYPE_LABELS[template.type]}
                  {template.category ? ` · ${template.category}` : ""}
                </small>
              </div>
              {canCreate ? (
                <div className="an-template-actions">
                  <button type="button" className="an-btn an-btn--primary" onClick={() => onUse(template)}>
                    <Send size={15} />
                    Use
                  </button>
                  <button type="button" className="an-icon-btn" aria-label={`Edit ${template.name}`} onClick={() => setEditing(template)}>
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="an-icon-btn" aria-label={`Delete ${template.name}`} onClick={() => void remove(template)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
