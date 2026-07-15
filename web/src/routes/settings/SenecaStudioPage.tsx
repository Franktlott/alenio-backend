import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  COACHING_STYLE_OPTIONS,
  DEFAULT_STUDIO_DATA,
  createSenecaKnowledge,
  deleteSenecaKnowledge,
  fetchSenecaKnowledge,
  fetchSenecaPromptTemplates,
  fetchSenecaStudio,
  fetchSenecaStudioVersions,
  previewSenecaStudio,
  publishSenecaStudio,
  restoreSenecaStudioVersion,
  saveSenecaStudioDraft,
  senecaStudioAccess,
  submitSenecaGenerationFeedback,
  updateSenecaPromptTemplate,
  type SenecaCoachingStyle,
  type SenecaConfigVersionRow,
  type SenecaFeedbackRating,
  type SenecaKnowledgeRow,
  type SenecaPreviewResponse,
  type SenecaPromptTemplateRow,
  type SenecaResponseLength,
  type SenecaStudioData,
  type SenecaTone,
} from "../../lib/seneca-studio-api";

function StatusBadge({
  source,
  status,
}: {
  source: string;
  status: string | null;
}) {
  const label =
    status === "PUBLISHED" || source === "published"
      ? "Published"
      : status === "DRAFT" || source === "draft"
        ? "Draft"
        : "Default";
  const tone =
    label === "Published" ? "published" : label === "Draft" ? "draft" : "default";
  return <span className={`seneca-studio-badge seneca-studio-badge--${tone}`}>{label}</span>;
}

function EditableChecklist({
  title,
  subtitle,
  items,
  variant,
  canEdit,
  onChange,
}: {
  title: string;
  subtitle: string;
  items: string[];
  variant: "always" | "never";
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section className="seneca-studio-card">
      <h3 className="seneca-studio-card-title">{title}</h3>
      <p className="seneca-studio-card-subtitle">{subtitle}</p>
      <ul className={`seneca-studio-checklist seneca-studio-checklist--${variant}`}>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>
            <span className="seneca-studio-checklist-mark" aria-hidden>
              {variant === "always" ? "✓" : "−"}
            </span>
            {canEdit ? (
              <input
                className="seneca-studio-inline-input"
                value={item}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = e.target.value;
                  onChange(next);
                }}
              />
            ) : (
              <span>{item}</span>
            )}
            {canEdit ? (
              <button
                type="button"
                className="seneca-studio-icon-btn"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="seneca-studio-add-row"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed) return;
            onChange([...items, trimmed]);
            setDraft("");
          }}
        >
          <input
            className="auth-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add item…"
          />
          <button type="submit" className="enterprise-team-pill-btn" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      ) : null}
    </section>
  );
}

function TermPills({
  title,
  subtitle,
  terms,
  variant,
  canEdit,
  onChange,
}: {
  title: string;
  subtitle: string;
  terms: string[];
  variant: "approved" | "avoided";
  canEdit: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section className="seneca-studio-card">
      <h3 className="seneca-studio-card-title">{title}</h3>
      <p className="seneca-studio-card-subtitle">{subtitle}</p>
      <div className="seneca-studio-pills">
        {terms.map((term) => (
          <span key={term} className={`seneca-studio-pill seneca-studio-pill--${variant}`}>
            {term}
            {canEdit ? (
              <button
                type="button"
                className="seneca-studio-pill-remove"
                aria-label={`Remove ${term}`}
                onClick={() => onChange(terms.filter((t) => t !== term))}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {canEdit ? (
        <form
          className="seneca-studio-add-row"
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = draft.trim();
            if (!trimmed || terms.includes(trimmed)) return;
            onChange([...terms, trimmed]);
            setDraft("");
          }}
        >
          <input
            className="auth-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="+ Add term"
          />
          <button type="submit" className="enterprise-team-pill-btn" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function SenecaStudioPage() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const teamId = selectedTeamId || teams?.[0]?.id || "";
  const team = teams?.find((t) => t.id === teamId);
  const access = senecaStudioAccess(team?.role);
  const canEdit = access.canEdit;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studio, setStudio] = useState<SenecaStudioData>(DEFAULT_STUDIO_DATA);
  const [source, setSource] = useState("default");
  const [status, setStatus] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [knowledge, setKnowledge] = useState<SenecaKnowledgeRow[]>([]);
  const [templates, setTemplates] = useState<SenecaPromptTemplateRow[]>([]);
  const [kbTitle, setKbTitle] = useState("");
  const [kbCategory, setKbCategory] = useState("general");
  const [kbContent, setKbContent] = useState("");

  const [previewQuestion, setPreviewQuestion] = useState(
    "Vera has missed two check-ins in a row. How should I address it?",
  );
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<SenecaPreviewResponse | null>(null);
  const [feedbackSent, setFeedbackSent] = useState<SenecaFeedbackRating | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<SenecaConfigVersionRow[]>([]);

  const patchStudio = useCallback((partial: Partial<SenecaStudioData>) => {
    setStudio((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setNotice(null);
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [studioRes, knowledgeRes, templateRes] = await Promise.all([
        fetchSenecaStudio(teamId),
        fetchSenecaKnowledge(teamId).catch(() => [] as SenecaKnowledgeRow[]),
        fetchSenecaPromptTemplates(teamId).catch(() => [] as SenecaPromptTemplateRow[]),
      ]);
      setStudio(studioRes.studio ?? DEFAULT_STUDIO_DATA);
      setSource(studioRes.source);
      setStatus(studioRes.status);
      setVersion(studioRes.version);
      setPublishedAt(studioRes.publishedAt);
      setKnowledge(knowledgeRes);
      setTemplates(templateRes);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Seneca Studio.");
      setStudio(DEFAULT_STUDIO_DATA);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const versionLabel = useMemo(() => {
    if (version == null) return "Using defaults";
    const date = publishedAt
      ? new Date(publishedAt).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;
    return date ? `v${version} · Published ${date}` : `v${version}`;
  }, [version, publishedAt]);

  async function withBusy<T>(fn: () => Promise<T>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (okMessage) setNotice(okMessage);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    if (!teamId || !canEdit) return;
    const res = await withBusy(() => saveSenecaStudioDraft(teamId, studio), "Draft saved.");
    if (!res) return;
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setPublishedAt(res.publishedAt);
    setDirty(false);
  }

  async function onPublish() {
    if (!teamId || !canEdit) return;
    if (dirty) {
      const saved = await withBusy(() => saveSenecaStudioDraft(teamId, studio));
      if (!saved) return;
    }
    const res = await withBusy(() => publishSenecaStudio(teamId), "Published.");
    if (!res) return;
    setStudio(res.studio);
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setPublishedAt(res.publishedAt);
    setDirty(false);
  }

  async function onOpenHistory() {
    if (!teamId) return;
    setHistoryOpen(true);
    try {
      setVersions(await fetchSenecaStudioVersions(teamId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load version history.");
    }
  }

  async function onRestore(v: number) {
    if (!teamId || !canEdit) return;
    const res = await withBusy(() => restoreSenecaStudioVersion(teamId, v), `Restored v${v} as draft.`);
    if (!res) return;
    setStudio(res.studio);
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setPublishedAt(res.publishedAt);
    setDirty(false);
    setHistoryOpen(false);
  }

  async function onAddKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !canEdit || !kbTitle.trim()) return;
    const row = await withBusy(
      () =>
        createSenecaKnowledge(teamId, {
          title: kbTitle.trim(),
          category: kbCategory.trim() || "general",
          contentText: kbContent.trim(),
        }),
      "Knowledge added.",
    );
    if (!row) return;
    setKnowledge((prev) => [row, ...prev]);
    setKbTitle("");
    setKbCategory("general");
    setKbContent("");
  }

  async function onRemoveKnowledge(id: string) {
    if (!teamId || !canEdit) return;
    await withBusy(() => deleteSenecaKnowledge(teamId, id), "Knowledge removed.");
    setKnowledge((prev) => prev.filter((k) => k.id !== id));
  }

  async function onSaveTemplate(templateKey: string, instructions: string) {
    if (!teamId || !canEdit) return;
    const row = await withBusy(
      () => updateSenecaPromptTemplate(teamId, templateKey, instructions),
      "Template saved.",
    );
    if (!row) return;
    setTemplates((prev) => prev.map((t) => (t.templateKey === templateKey ? row : t)));
  }

  async function onGeneratePreview() {
    if (!teamId || !previewQuestion.trim()) return;
    setPreviewBusy(true);
    setError(null);
    setFeedbackSent(null);
    try {
      if (canEdit && dirty) {
        await saveSenecaStudioDraft(teamId, studio);
        setDirty(false);
      }
      const res = await previewSenecaStudio(teamId, { question: previewQuestion.trim() });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onFeedback(rating: SenecaFeedbackRating) {
    if (!teamId || !preview?.generationId) return;
    try {
      await submitSenecaGenerationFeedback(teamId, preview.generationId, { rating });
      setFeedbackSent(rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save feedback.");
    }
  }

  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading Seneca Studio" />;
  }

  if (!access.canView) {
    return <Navigate to="/settings" replace />;
  }

  if (loading) {
    return <EnterprisePageLoading label="Loading Seneca Studio" />;
  }

  return (
    <div className="enterprise-tab-shell seneca-studio-page" data-testid="seneca-studio-page">
      <div className="seneca-studio-page-inner">
        <nav className="seneca-studio-breadcrumb" aria-label="Breadcrumb">
          <Link to="/settings">Settings</Link>
          <span aria-hidden>›</span>
          <Link to="/settings/ai">AI</Link>
          <span aria-hidden>›</span>
          <span>Seneca Studio</span>
        </nav>

        <header className="seneca-studio-header">
          <div>
            <h1 className="seneca-studio-title">Seneca Studio</h1>
            <p className="seneca-studio-subtitle">
              Configure how Seneca coaches your managers and teams.
            </p>
          </div>
          <div className="seneca-studio-header-actions">
            <button
              type="button"
              className="enterprise-team-pill-btn"
              disabled={previewBusy || !previewQuestion.trim()}
              onClick={() => void onGeneratePreview()}
            >
              {previewBusy ? "Generating…" : "Preview"}
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="enterprise-team-pill-btn"
                  disabled={busy || !dirty}
                  onClick={() => void onSaveDraft()}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="auth-submit seneca-studio-publish-btn"
                  disabled={busy}
                  onClick={() => void onPublish()}
                >
                  Publish changes
                </button>
              </>
            ) : (
              <span className="seneca-studio-badge seneca-studio-badge--readonly">View only</span>
            )}
          </div>
        </header>

        <div className="seneca-studio-version-bar">
          <div className="seneca-studio-version-meta">
            <span className="seneca-studio-version-label">Current version</span>
            <StatusBadge source={source} status={status} />
            <span className="seneca-studio-version-detail">{versionLabel}</span>
            {dirty ? <span className="seneca-studio-badge seneca-studio-badge--dirty">Unsaved</span> : null}
          </div>
          <button type="button" className="seneca-studio-link-btn" onClick={() => void onOpenHistory()}>
            View version history
          </button>
        </div>

        {error ? (
          <p className="enterprise-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="seneca-studio-notice">{notice}</p> : null}

        <div className="seneca-studio-columns">
          <div className="seneca-studio-col seneca-studio-col--left">
            <section className="seneca-studio-card">
              <h3 className="seneca-studio-card-title">Coaching behavior</h3>
              <p className="seneca-studio-card-subtitle">Tone, length, and coaching focus.</p>

              <label className="seneca-studio-field-label">Tone</label>
              <div className="seneca-studio-segment" role="group" aria-label="Tone">
                {(["supportive", "balanced", "direct"] as SenecaTone[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`seneca-studio-segment-btn${studio.tone === value ? " is-active" : ""}`}
                    disabled={!canEdit}
                    onClick={() => patchStudio({ tone: value })}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>

              <label className="seneca-studio-field-label">Response length</label>
              <div className="seneca-studio-segment" role="group" aria-label="Response length">
                {(["concise", "standard", "detailed"] as SenecaResponseLength[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`seneca-studio-segment-btn${studio.responseLength === value ? " is-active" : ""}`}
                    disabled={!canEdit}
                    onClick={() => patchStudio({ responseLength: value })}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>

              <label className="seneca-studio-field-label" htmlFor="seneca-coaching-style">
                Coaching style
              </label>
              <select
                id="seneca-coaching-style"
                className="auth-input"
                disabled={!canEdit}
                value={studio.coachingStyle}
                onChange={(e) => patchStudio({ coachingStyle: e.target.value as SenecaCoachingStyle })}
              >
                {COACHING_STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="seneca-studio-toggle-row">
                <div>
                  <p className="seneca-studio-toggle-label">Ask follow-up questions</p>
                  <p className="seneca-studio-card-subtitle">Clarify before giving coaching advice.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={studio.askFollowUps}
                  className={`seneca-studio-switch${studio.askFollowUps ? " is-on" : ""}`}
                  disabled={!canEdit}
                  onClick={() => patchStudio({ askFollowUps: !studio.askFollowUps })}
                >
                  <span className="seneca-studio-switch-knob" />
                </button>
              </div>
            </section>

            <section className="seneca-studio-card">
              <h3 className="seneca-studio-card-title">Leadership philosophy</h3>
              <p className="seneca-studio-card-subtitle">
                These instructions shape how Seneca coaches in any situation.
              </p>
              <textarea
                className="auth-input seneca-studio-textarea"
                rows={10}
                disabled={!canEdit}
                value={studio.leadershipPhilosophy}
                onChange={(e) => patchStudio({ leadershipPhilosophy: e.target.value })}
                placeholder="Describe leadership style, coaching expectations, and values…"
              />
              <p className="seneca-studio-char-count">
                Characters: {studio.leadershipPhilosophy.length}
              </p>
            </section>
          </div>

          <div className="seneca-studio-col seneca-studio-col--middle">
            <EditableChecklist
              title="Always do"
              subtitle="Things Seneca should always do."
              items={studio.alwaysDo}
              variant="always"
              canEdit={canEdit}
              onChange={(alwaysDo) => patchStudio({ alwaysDo })}
            />
            <EditableChecklist
              title="Never do"
              subtitle="Things Seneca should never do."
              items={studio.neverDo}
              variant="never"
              canEdit={canEdit}
              onChange={(neverDo) => patchStudio({ neverDo })}
            />
            <TermPills
              title="Approved terminology"
              subtitle="Words and phrases Seneca should use."
              terms={studio.approvedTerms}
              variant="approved"
              canEdit={canEdit}
              onChange={(approvedTerms) => patchStudio({ approvedTerms })}
            />
            <TermPills
              title="Avoid terminology"
              subtitle="Words and phrases Seneca should avoid."
              terms={studio.avoidedTerms}
              variant="avoided"
              canEdit={canEdit}
              onChange={(avoidedTerms) => patchStudio({ avoidedTerms })}
            />

            <section className="seneca-studio-card">
              <h3 className="seneca-studio-card-title">Knowledge base</h3>
              <p className="seneca-studio-card-subtitle">
                Active documents Seneca can use for coaching context.
              </p>
              <ul className="seneca-studio-kb-list">
                {knowledge.length === 0 ? (
                  <li className="seneca-studio-empty">No knowledge documents yet.</li>
                ) : (
                  knowledge.map((row) => (
                    <li key={row.id} className="seneca-studio-kb-item">
                      <div>
                        <p className="seneca-studio-kb-title">{row.title}</p>
                        <p className="seneca-studio-kb-meta">
                          {row.category} · {row.status} · v{row.version}
                        </p>
                      </div>
                      {canEdit ? (
                        <button
                          type="button"
                          className="seneca-studio-icon-btn"
                          aria-label={`Remove ${row.title}`}
                          onClick={() => void onRemoveKnowledge(row.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
              {canEdit ? (
                <form className="seneca-studio-kb-form" onSubmit={(e) => void onAddKnowledge(e)}>
                  <input
                    className="auth-input"
                    placeholder="Title"
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                    required
                  />
                  <input
                    className="auth-input"
                    placeholder="Category"
                    value={kbCategory}
                    onChange={(e) => setKbCategory(e.target.value)}
                  />
                  <textarea
                    className="auth-input seneca-studio-textarea"
                    rows={3}
                    placeholder="Content or notes…"
                    value={kbContent}
                    onChange={(e) => setKbContent(e.target.value)}
                  />
                  <button type="submit" className="enterprise-team-pill-btn" disabled={busy || !kbTitle.trim()}>
                    Add document
                  </button>
                </form>
              ) : null}
            </section>

            <section className="seneca-studio-card">
              <h3 className="seneca-studio-card-title">Prompt templates</h3>
              <p className="seneca-studio-card-subtitle">
                Workspace instructions appended to Seneca&apos;s global coaching prompt.
              </p>
              <div className="seneca-studio-templates">
                {templates.length === 0 ? (
                  <p className="seneca-studio-empty">Templates will appear once the API is available.</p>
                ) : (
                  templates.map((tpl) => (
                    <div key={tpl.templateKey} className="seneca-studio-template">
                      <label className="seneca-studio-field-label" htmlFor={`tpl-${tpl.templateKey}`}>
                        {tpl.title}
                      </label>
                      <textarea
                        id={`tpl-${tpl.templateKey}`}
                        className="auth-input seneca-studio-textarea"
                        rows={3}
                        disabled={!canEdit}
                        defaultValue={tpl.instructions}
                        key={`${tpl.templateKey}-${tpl.version}`}
                        onBlur={(e) => {
                          if (!canEdit) return;
                          if (e.target.value === tpl.instructions) return;
                          void onSaveTemplate(tpl.templateKey, e.target.value);
                        }}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="seneca-studio-col seneca-studio-col--right">
            <section className="seneca-studio-card seneca-studio-preview-card">
              <h3 className="seneca-studio-card-title">Live preview</h3>
              <p className="seneca-studio-card-subtitle">Test how Seneca will respond.</p>
              <label className="seneca-studio-field-label" htmlFor="seneca-preview-q">
                Manager question
              </label>
              <textarea
                id="seneca-preview-q"
                className="auth-input seneca-studio-textarea"
                rows={4}
                value={previewQuestion}
                onChange={(e) => setPreviewQuestion(e.target.value)}
              />
              <button
                type="button"
                className="auth-submit seneca-studio-preview-btn"
                disabled={previewBusy || !previewQuestion.trim()}
                onClick={() => void onGeneratePreview()}
              >
                {previewBusy ? "Generating…" : "Generate preview"}
              </button>

              {preview ? (
                <div className="seneca-studio-preview-result">
                  <div className="seneca-studio-preview-you">
                    <span>You</span>
                    <p>{preview.question}</p>
                  </div>
                  <div className="seneca-studio-preview-seneca">
                    <div className="seneca-studio-preview-seneca-head">
                      <span aria-hidden>✦</span> Seneca
                    </div>
                    <p>{preview.response}</p>
                    {preview.promptVersion ? (
                      <p className="seneca-studio-preview-meta">Prompt: {preview.promptVersion}</p>
                    ) : null}
                    {preview.knowledgeUsed?.length ? (
                      <p className="seneca-studio-preview-meta">
                        Knowledge: {preview.knowledgeUsed.join(", ")}
                      </p>
                    ) : null}
                    <div className="seneca-studio-feedback">
                      <button
                        type="button"
                        className={`seneca-studio-feedback-btn${feedbackSent === "helpful" ? " is-active" : ""}`}
                        onClick={() => void onFeedback("helpful")}
                        aria-label="Helpful"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        className={`seneca-studio-feedback-btn${feedbackSent === "needs_improvement" ? " is-active" : ""}`}
                        onClick={() => void onFeedback("needs_improvement")}
                        aria-label="Needs improvement"
                      >
                        👎
                      </button>
                      {feedbackSent ? <span className="seneca-studio-preview-meta">Thanks for the feedback</span> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="seneca-studio-empty">Generate a preview to see Seneca&apos;s response here.</p>
              )}
            </section>
          </aside>
        </div>
      </div>

      {historyOpen ? (
        <div className="seneca-studio-modal-backdrop" role="presentation" onClick={() => setHistoryOpen(false)}>
          <div
            className="seneca-studio-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seneca-version-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="seneca-studio-modal-head">
              <h2 id="seneca-version-history-title">Version history</h2>
              <button type="button" className="seneca-studio-icon-btn" aria-label="Close" onClick={() => setHistoryOpen(false)}>
                ×
              </button>
            </div>
            <ul className="seneca-studio-version-list">
              {versions.length === 0 ? (
                <li className="seneca-studio-empty">No versions yet.</li>
              ) : (
                versions.map((row) => (
                  <li key={row.id} className="seneca-studio-version-row">
                    <div>
                      <p className="seneca-studio-kb-title">
                        v{row.version}{" "}
                        <StatusBadge source={row.status.toLowerCase()} status={row.status} />
                      </p>
                      <p className="seneca-studio-kb-meta">
                        {new Date(row.updatedAt || row.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        className="enterprise-team-pill-btn"
                        disabled={busy}
                        onClick={() => void onRestore(row.version)}
                      >
                        Restore
                      </button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
