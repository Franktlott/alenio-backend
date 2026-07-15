import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  COACHING_STYLE_OPTIONS,
  DEFAULT_STUDIO_DATA,
  createPlatformSenecaKnowledge,
  createSenecaKnowledge,
  deletePlatformSenecaKnowledge,
  deletePlatformSenecaStudioDraft,
  deleteSenecaKnowledge,
  deleteSenecaStudioDraft,
  fetchPlatformSenecaKnowledge,
  fetchPlatformSenecaPromptTemplates,
  fetchPlatformSenecaStudio,
  fetchPlatformSenecaStudioVersions,
  fetchSenecaKnowledge,
  fetchSenecaPromptTemplates,
  fetchSenecaStudio,
  fetchSenecaStudioVersions,
  previewPlatformSenecaStudio,
  previewSenecaStudio,
  publishPlatformSenecaStudio,
  publishSenecaStudio,
  restorePlatformSenecaStudioVersion,
  restoreSenecaStudioVersion,
  savePlatformSenecaStudioDraft,
  saveSenecaStudioDraft,
  senecaStudioAccess,
  submitPlatformSenecaGenerationFeedback,
  submitSenecaGenerationFeedback,
  updatePlatformSenecaPromptTemplate,
  updateSenecaPromptTemplate,
  type SenecaCoachingStyle,
  type SenecaConfigVersionRow,
  type SenecaFeedbackRating,
  type SenecaKnowledgeRow,
  type SenecaPreviewResponse,
  type SenecaPromptTemplateRow,
  type SenecaResponseLength,
  type SenecaStudioApiScope,
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
    <section className="seneca-studio-card seneca-studio-card--dense">
      <h3 className="seneca-studio-card-title">{title}</h3>
      {subtitle ? <p className="seneca-studio-card-subtitle">{subtitle}</p> : null}
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
    <section className="seneca-studio-card seneca-studio-card--dense">
      <h3 className="seneca-studio-card-title">{title}</h3>
      {subtitle ? <p className="seneca-studio-card-subtitle">{subtitle}</p> : null}
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

export function SenecaStudioPage({
  scope = "workspace",
  embedded = false,
}: {
  scope?: SenecaStudioApiScope;
  embedded?: boolean;
} = {}) {
  const isPlatform = scope === "platform";
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const teamId = selectedTeamId || teams?.[0]?.id || "";
  const team = teams?.find((t) => t.id === teamId);
  const workspaceAccess = senecaStudioAccess(team?.role);
  const canEdit = isPlatform ? me?.isAdmin === true : workspaceAccess.canEdit;
  const canView = isPlatform ? me?.isAdmin === true : workspaceAccess.canView;

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
  const [publishedByName, setPublishedByName] = useState<string | null>(null);
  const [versionNotes, setVersionNotes] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<"save" | "publish" | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [panel, setPanel] = useState<"studio" | "terms" | "knowledge" | "templates" | "preview">(
    "studio",
  );

  const patchStudio = useCallback((partial: Partial<SenecaStudioData>) => {
    setStudio((prev) => ({ ...prev, ...partial }));
    setDirty(true);
    setNotice(null);
  }, []);

  const applyStudioMeta = useCallback((res: {
    studio?: SenecaStudioData;
    source: string;
    status: string | null;
    version: number | null;
    publishedAt: string | null;
    publishedByName?: string | null;
    notes?: string | null;
  }) => {
    if (res.studio) setStudio(res.studio);
    setSource(res.source);
    setStatus(res.status);
    setVersion(res.version);
    setPublishedAt(res.publishedAt);
    setPublishedByName(res.publishedByName ?? null);
    setVersionNotes(res.notes ?? null);
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    if (!isPlatform && !teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [studioRes, knowledgeRes, templateRes] = await Promise.all([
        isPlatform ? fetchPlatformSenecaStudio() : fetchSenecaStudio(teamId),
        (isPlatform ? fetchPlatformSenecaKnowledge() : fetchSenecaKnowledge(teamId)).catch(
          () => [] as SenecaKnowledgeRow[],
        ),
        (isPlatform
          ? fetchPlatformSenecaPromptTemplates()
          : fetchSenecaPromptTemplates(teamId)
        ).catch(() => [] as SenecaPromptTemplateRow[]),
      ]);
      setStudio(studioRes.studio ?? DEFAULT_STUDIO_DATA);
      setSource(studioRes.source);
      setStatus(studioRes.status);
      setVersion(studioRes.version);
      setPublishedAt(studioRes.publishedAt);
      setPublishedByName(studioRes.publishedByName ?? null);
      setVersionNotes(studioRes.notes ?? null);
      setKnowledge(knowledgeRes);
      setTemplates(templateRes);
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Seneca Studio.");
      setStudio(DEFAULT_STUDIO_DATA);
    } finally {
      setLoading(false);
    }
  }, [isPlatform, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const versionLabel = useMemo(() => {
    if (version == null) return "Using defaults";
    if (status === "PUBLISHED" || source === "published") {
      const date = publishedAt
        ? new Date(publishedAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        : null;
      const by = publishedByName ? ` by ${publishedByName}` : "";
      return date ? `v${version} · Published ${date}${by}` : `v${version}`;
    }
    return `v${version}${versionNotes ? ` · ${versionNotes}` : ""}`;
  }, [version, publishedAt, publishedByName, status, source, versionNotes]);

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

  function openNoteModal(kind: "save" | "publish") {
    if (!canEdit) return;
    if (!isPlatform && !teamId) return;
    setNoteDraft(versionNotes ?? "");
    setNoteModal(kind);
  }

  async function confirmNoteModal() {
    if (!noteModal) return;
    const note = noteDraft.trim() || null;
    const kind = noteModal;
    setNoteModal(null);
    if (kind === "save") {
      const res = await withBusy(
        () =>
          isPlatform
            ? savePlatformSenecaStudioDraft(studio, note)
            : saveSenecaStudioDraft(teamId, studio, note),
        "Draft saved.",
      );
      if (!res) return;
      applyStudioMeta(res);
      return;
    }
    if (dirty) {
      const saved = await withBusy(() =>
        isPlatform
          ? savePlatformSenecaStudioDraft(studio, note)
          : saveSenecaStudioDraft(teamId, studio, note),
      );
      if (!saved) return;
    }
    const res = await withBusy(
      () =>
        isPlatform ? publishPlatformSenecaStudio(note) : publishSenecaStudio(teamId, note),
      "Published.",
    );
    if (!res) return;
    applyStudioMeta(res);
  }

  async function onOpenHistory() {
    if (!isPlatform && !teamId) return;
    setHistoryOpen(true);
    try {
      setVersions(
        isPlatform ? await fetchPlatformSenecaStudioVersions() : await fetchSenecaStudioVersions(teamId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load version history.");
    }
  }

  async function onRestore(v: number) {
    if (!canEdit) return;
    if (!isPlatform && !teamId) return;
    const res = await withBusy(
      () =>
        isPlatform
          ? restorePlatformSenecaStudioVersion(v)
          : restoreSenecaStudioVersion(teamId, v),
      `Restored v${v} as draft.`,
    );
    if (!res) return;
    applyStudioMeta(res);
    setHistoryOpen(false);
  }

  async function onDeleteDraft(v: number) {
    if (!canEdit) return;
    if (!isPlatform && !teamId) return;
    const ok = window.confirm(`Delete draft v${v}? This cannot be undone.`);
    if (!ok) return;
    const res = await withBusy(
      () =>
        isPlatform ? deletePlatformSenecaStudioDraft(v) : deleteSenecaStudioDraft(teamId, v),
      `Draft v${v} deleted.`,
    );
    if (!res) return;
    setVersions((prev) => prev.filter((row) => row.version !== v));
    await load();
  }

  async function onAddKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || !kbTitle.trim()) return;
    if (!isPlatform && !teamId) return;
    const row = await withBusy(
      () =>
        isPlatform
          ? createPlatformSenecaKnowledge({
              title: kbTitle.trim(),
              category: kbCategory.trim() || "general",
              contentText: kbContent.trim(),
            })
          : createSenecaKnowledge(teamId, {
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
    if (!canEdit) return;
    if (!isPlatform && !teamId) return;
    await withBusy(
      () =>
        isPlatform ? deletePlatformSenecaKnowledge(id) : deleteSenecaKnowledge(teamId, id),
      "Knowledge removed.",
    );
    setKnowledge((prev) => prev.filter((k) => k.id !== id));
  }

  async function onSaveTemplate(templateKey: string, instructions: string) {
    if (!canEdit) return;
    if (!isPlatform && !teamId) return;
    const row = await withBusy(
      () =>
        isPlatform
          ? updatePlatformSenecaPromptTemplate(templateKey, instructions)
          : updateSenecaPromptTemplate(teamId, templateKey, instructions),
      "Template saved.",
    );
    if (!row) return;
    setTemplates((prev) => prev.map((t) => (t.templateKey === templateKey ? row : t)));
  }

  async function onGeneratePreview() {
    if (!previewQuestion.trim()) return;
    if (!isPlatform && !teamId) return;
    setPreviewBusy(true);
    setError(null);
    setFeedbackSent(null);
    try {
      if (canEdit && dirty) {
        if (isPlatform) await savePlatformSenecaStudioDraft(studio);
        else await saveSenecaStudioDraft(teamId, studio);
        setDirty(false);
      }
      const res = isPlatform
        ? await previewPlatformSenecaStudio({ question: previewQuestion.trim() })
        : await previewSenecaStudio(teamId, { question: previewQuestion.trim() });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function onFeedback(rating: SenecaFeedbackRating) {
    if (!preview?.generationId) return;
    if (!isPlatform && !teamId) return;
    try {
      if (isPlatform) {
        await submitPlatformSenecaGenerationFeedback(preview.generationId, { rating });
      } else {
        await submitSenecaGenerationFeedback(teamId, preview.generationId, { rating });
      }
      setFeedbackSent(rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save feedback.");
    }
  }

  if (me === undefined || (!isPlatform && teams === null)) {
    return <EnterprisePageLoading label="Loading Seneca Studio" />;
  }

  if (!canView) {
    return <Navigate to={isPlatform ? "/dashboard" : "/settings"} replace />;
  }

  if (loading) {
    return <EnterprisePageLoading label="Loading Seneca Studio" />;
  }


  return (
    <div
      className={`seneca-studio-page seneca-studio-page--compact${embedded ? " seneca-studio-page--embedded" : " enterprise-tab-shell enterprise-tab-shell-scroll"}`}
      data-testid={isPlatform ? "admin-seneca-studio" : "seneca-studio-page"}
    >
      <div className="seneca-studio-page-inner">
        {!embedded ? (
          <nav className="seneca-studio-breadcrumb" aria-label="Breadcrumb">
            {isPlatform ? (
              <>
                <Link to="/admin">Admin</Link>
                <span aria-hidden>›</span>
                <span>Seneca Studio</span>
              </>
            ) : (
              <>
                <Link to="/settings">Settings</Link>
                <span aria-hidden>›</span>
                <Link to="/settings/ai">AI</Link>
                <span aria-hidden>›</span>
                <span>Seneca Studio</span>
              </>
            )}
          </nav>
        ) : null}

        <header className="seneca-studio-toolbar">
          <div className="seneca-studio-toolbar-left">
            <div className="seneca-studio-toolbar-title-row">
              <h1 className="seneca-studio-title">Seneca Studio</h1>
              <StatusBadge source={source} status={status} />
              {dirty ? <span className="seneca-studio-badge seneca-studio-badge--dirty">Unsaved</span> : null}
            </div>
            <p className="seneca-studio-toolbar-meta">
              {versionLabel}
              {versionNotes && (status === "DRAFT" || source === "draft") ? ` · Note: ${versionNotes}` : ""}
              {" · "}
              <button type="button" className="seneca-studio-link-btn" onClick={() => void onOpenHistory()}>
                Version history
              </button>
            </p>
          </div>
          <div className="seneca-studio-toolbar-actions">
            {canEdit ? (
              <>
                <button
                  type="button"
                  className="enterprise-team-pill-btn"
                  disabled={busy || !dirty}
                  onClick={() => openNoteModal("save")}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="seneca-studio-publish-btn"
                  disabled={busy}
                  onClick={() => openNoteModal("publish")}
                >
                  Publish
                </button>
              </>
            ) : (
              <span className="seneca-studio-badge seneca-studio-badge--readonly">View only</span>
            )}
          </div>
        </header>

        <div className="seneca-studio-panel-tabs" role="tablist" aria-label="Studio sections">
          {(
            [
              { id: "studio", label: "Studio" },
              { id: "terms", label: "Terminology" },
              { id: "knowledge", label: "Knowledge" },
              { id: "templates", label: "Templates" },
              { id: "preview", label: "Preview" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={panel === tab.id}
              className={`seneca-studio-panel-tab${panel === tab.id ? " is-active" : ""}`}
              onClick={() => setPanel(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="enterprise-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="seneca-studio-notice">{notice}</p> : null}

        {panel === "studio" ? (
          <div className="seneca-studio-board">
            <section className="seneca-studio-card seneca-studio-card--dense">
              <h3 className="seneca-studio-card-title">Coaching behavior</h3>
              <div className="seneca-studio-behavior-grid">
                <div>
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
                </div>
                <div>
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
                </div>
                <div>
                  <label className="seneca-studio-field-label" htmlFor="seneca-coaching-style">
                    Coaching approach
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
                </div>
                <div className="seneca-studio-toggle-row seneca-studio-toggle-row--compact">
                  <p className="seneca-studio-toggle-label">Ask follow-up questions</p>
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
              </div>
            </section>

            <section className="seneca-studio-card seneca-studio-card--dense">
              <h3 className="seneca-studio-card-title">Global coaching instructions</h3>
              <textarea
                className="auth-input seneca-studio-textarea seneca-studio-textarea--board"
                rows={7}
                disabled={!canEdit}
                value={studio.leadershipPhilosophy}
                onChange={(e) => patchStudio({ leadershipPhilosophy: e.target.value })}
                placeholder="Describe leadership style, coaching expectations, and values…"
              />
              <p className="seneca-studio-char-count">Characters: {studio.leadershipPhilosophy.length}</p>
            </section>

            <EditableChecklist
              title="Always do"
              subtitle=""
              items={studio.alwaysDo}
              variant="always"
              canEdit={canEdit}
              onChange={(alwaysDo) => patchStudio({ alwaysDo })}
            />
            <EditableChecklist
              title="Never do"
              subtitle=""
              items={studio.neverDo}
              variant="never"
              canEdit={canEdit}
              onChange={(neverDo) => patchStudio({ neverDo })}
            />
          </div>
        ) : null}

        {panel === "terms" ? (
          <div className="seneca-studio-board seneca-studio-board--two">
            <TermPills
              title="Approved terminology"
              subtitle="Words Seneca should prefer."
              terms={studio.approvedTerms}
              variant="approved"
              canEdit={canEdit}
              onChange={(approvedTerms) => patchStudio({ approvedTerms })}
            />
            <TermPills
              title="Avoid terminology"
              subtitle="Words Seneca should avoid."
              terms={studio.avoidedTerms}
              variant="avoided"
              canEdit={canEdit}
              onChange={(avoidedTerms) => patchStudio({ avoidedTerms })}
            />
          </div>
        ) : null}

        {panel === "knowledge" ? (
          <section className="seneca-studio-card seneca-studio-card--panel">
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
        ) : null}

        {panel === "templates" ? (
          <section className="seneca-studio-card seneca-studio-card--panel">
            <h3 className="seneca-studio-card-title">Prompt templates</h3>
            <p className="seneca-studio-card-subtitle">
              {isPlatform
                ? "Platform instructions appended to Seneca's global coaching prompt."
                : "Workspace instructions appended to Seneca's global coaching prompt."}
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
        ) : null}

        {panel === "preview" ? (
          <section className="seneca-studio-card seneca-studio-preview-card seneca-studio-card--panel">
            <div className="seneca-studio-card-head-row">
              <h3 className="seneca-studio-card-title">Live preview</h3>
              <button
                type="button"
                className="seneca-studio-link-btn"
                onClick={() =>
                  setPreviewQuestion("Vera has missed two check-ins in a row. How should I address it?")
                }
              >
                Change scenario
              </button>
            </div>
            <div className="seneca-studio-preview-layout">
              <div>
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
                  className="seneca-studio-publish-btn seneca-studio-preview-run"
                  disabled={previewBusy || !previewQuestion.trim()}
                  onClick={() => void onGeneratePreview()}
                >
                  {previewBusy ? "Generating…" : "Generate preview"}
                </button>
              </div>
              <div className="seneca-studio-preview-result-pane">
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
                        {feedbackSent ? (
                          <span className="seneca-studio-preview-meta">Thanks for the feedback</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="seneca-studio-empty">Generate a preview to see Seneca&apos;s response here.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {noteModal ? (
        <div
          className="seneca-studio-modal-backdrop"
          role="presentation"
          onClick={() => setNoteModal(null)}
        >
          <div
            className="seneca-studio-modal seneca-studio-modal--note"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seneca-note-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="seneca-studio-modal-head">
              <h2 id="seneca-note-modal-title">
                {noteModal === "publish" ? "Publish changes" : "Save draft"}
              </h2>
              <button
                type="button"
                className="seneca-studio-icon-btn"
                aria-label="Close"
                onClick={() => setNoteModal(null)}
              >
                ×
              </button>
            </div>
            <p className="seneca-studio-card-subtitle">
              Add an optional note for version history so your team knows what changed.
            </p>
            <textarea
              className="auth-input seneca-studio-textarea"
              rows={4}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. Tightened never-do rules for HR topics"
              maxLength={2000}
            />
            <div className="seneca-studio-modal-actions">
              <button type="button" className="enterprise-team-pill-btn" onClick={() => setNoteModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="seneca-studio-publish-btn"
                disabled={busy}
                onClick={() => void confirmNoteModal()}
              >
                {noteModal === "publish" ? "Publish" : "Save draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                    <div className="seneca-studio-version-row-main">
                      <p className="seneca-studio-kb-title">
                        v{row.version}{" "}
                        <StatusBadge source={row.status.toLowerCase()} status={row.status} />
                      </p>
                      <p className="seneca-studio-kb-meta">
                        {new Date(row.updatedAt || row.createdAt).toLocaleString()}
                        {row.authorName ? ` · ${row.authorName}` : ""}
                      </p>
                      {row.notes ? (
                        <p className="seneca-studio-version-row-note">{row.notes}</p>
                      ) : (
                        <p className="seneca-studio-version-row-note seneca-studio-version-row-note--empty">
                          No note
                        </p>
                      )}
                    </div>
                    <div className="seneca-studio-version-row-actions">
                      {canEdit && row.status === "DRAFT" ? (
                        <button
                          type="button"
                          className="seneca-studio-delete-btn"
                          disabled={busy}
                          onClick={() => void onDeleteDraft(row.version)}
                        >
                          Delete
                        </button>
                      ) : null}
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
                    </div>
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
