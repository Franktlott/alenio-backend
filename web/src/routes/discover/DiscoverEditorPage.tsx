import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Crop,
  Eye,
  ImagePlus,
  Monitor,
  PenLine,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { uploadChatMedia } from "../../lib/api";
import { staffCan } from "../../lib/staff-access";
import {
  createDiscoverArticle,
  discardDiscoverDraft,
  fetchDiscoverArticle,
  fetchDiscoverCategories,
  publishDiscoverDraft,
  saveDiscoverDraft,
  updateDiscoverArticle,
  type DiscoverAdminArticle,
  type DiscoverArticleInput,
  type DiscoverCategory,
  type DiscoverDoc,
  type DiscoverStatus,
} from "../../lib/discover-api";
import { DiscoverArticleView } from "./DiscoverArticleView";
import { DiscoverCoverCrop } from "./DiscoverCoverCrop";
import { DiscoverRichText } from "./DiscoverRichText";
import "./discover.css";
import "./discover-builder.css";

const EMPTY_DOC: DiscoverDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const EXCERPT_TARGET = 160;

const STATUS_LABEL: Record<DiscoverStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  unpublished: "Unpublished",
  archived: "Archived",
};

type CropSource = { src: string; crossOrigin: boolean; note: string | null };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "article";
}

function wordCount(doc: DiscoverDoc): number {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    const record = value as { type?: unknown; text?: unknown; content?: unknown; attrs?: Record<string, unknown> };
    if (typeof record.text === "string") texts.push(record.text);
    if (typeof record.type === "string" && record.type.startsWith("discover") && record.attrs) {
      const { title, items, cards } = record.attrs;
      for (const part of [title, record.attrs.text, ...(Array.isArray(items) ? items : [])]) {
        if (typeof part === "string") texts.push(part);
      }
      if (Array.isArray(cards)) {
        for (const card of cards as { title?: unknown; text?: unknown }[]) {
          if (typeof card.title === "string") texts.push(card.title);
          if (typeof card.text === "string") texts.push(card.text);
        }
      }
    }
    walk(record.content);
  };
  walk(doc.content);
  return texts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

function readingMinutes(words: number): number {
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / 200));
}

/** Saved covers can only be recropped when storage lets the browser read them back. */
function probeCrossOrigin(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        canvas.getContext("2d")?.drawImage(image, 0, 0, 1, 1);
        canvas.toDataURL();
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

const STEPS = [
  { id: "basics", label: "Basics", hint: "Title, cover, summary" },
  { id: "write", label: "Write", hint: "The article" },
  { id: "details", label: "Details", hint: "Placement, author, Seneca" },
  { id: "share", label: "Link & SEO", hint: "Web address and card" },
  { id: "review", label: "Review & publish", hint: "Check and go live" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function isStepId(value: string | null): value is StepId {
  return STEPS.some((step) => step.id === value);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="dcb-section">
      <header>
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="dcb-switch">
      <span className="dcb-switch-copy">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="dcb-switch-track" aria-hidden />
    </label>
  );
}

export function DiscoverEditorPage() {
  const { articleId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { me } = useEnterpriseShell();
  const isNew = !articleId || articleId === "new";
  const [step, setStepState] = useState<StepId>(() => {
    const requested = searchParams.get("step");
    return isStepId(requested) ? requested : isNew ? "basics" : "write";
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const mayEdit = staffCan(me, "content.edit");
  const [preview, setPreview] = useState(searchParams.get("preview") === "1" || !mayEdit);
  const [frame, setFrame] = useState<390 | 768 | 1120>(1120);
  const [categories, setCategories] = useState<DiscoverCategory[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState<DiscoverDoc>(EMPTY_DOC);
  const [categoryId, setCategoryId] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverImageAlt, setCoverImageAlt] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverDragOver, setCoverDragOver] = useState(false);
  /** The uncropped photo from this session, so it can be recropped from the full frame. */
  const [coverOriginal, setCoverOriginal] = useState<string | null>(null);
  const [coverRecroppable, setCoverRecroppable] = useState(false);
  const [crop, setCrop] = useState<CropSource | null>(null);
  const [status, setStatus] = useState<DiscoverStatus>("draft");
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [publishedLocal, setPublishedLocal] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredInCategory, setFeaturedInCategory] = useState(false);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [senecaEnabled, setSenecaEnabled] = useState(false);
  const [senecaPrompt, setSenecaPrompt] = useState("");
  const [senecaContext, setSenecaContext] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [lastPublishedBy, setLastPublishedBy] = useState<string | null>(null);
  /** Live articles are never edited in place; edits wait as draft changes until published. */
  const [live, setLive] = useState(false);
  const [draftAt, setDraftAt] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const pendingOriginal = useRef<string | null>(null);

  useEffect(() => {
    if (me && !staffCan(me, "content.view")) navigate("/settings", { replace: true });
    else if (me && isNew && !mayEdit) navigate("/admin/discover", { replace: true });
  }, [me, navigate, isNew, mayEdit]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    void fetchDiscoverCategories()
      .then((rows) => {
        if (!cancelled) setCategories(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load categories.");
      });
    if (isNew)
      return () => {
        cancelled = true;
      };
    setLoading(true);
    void fetchDiscoverArticle(articleId)
      .then((article) => {
        if (cancelled) return;
        applyArticle(article, true);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not open this article.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId, isNew]);

  useEffect(() => {
    if (!coverImageUrl || coverOriginal) {
      setCoverRecroppable(false);
      return;
    }
    let cancelled = false;
    void probeCrossOrigin(coverImageUrl).then((ok) => {
      if (!cancelled) setCoverRecroppable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [coverImageUrl, coverOriginal]);

  useEffect(
    () => () => {
      if (coverOriginal) URL.revokeObjectURL(coverOriginal);
    },
    [coverOriginal],
  );

  useLayoutEffect(() => {
    const node = titleRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [title, preview, loading]);

  function applyArticle(article: DiscoverAdminArticle, useDraft: boolean) {
    const draft = useDraft ? (article.pendingDraft ?? null) : null;
    const pick = <K extends keyof DiscoverArticleInput>(key: K, fallback: DiscoverArticleInput[K]) =>
      draft && draft[key] !== undefined ? draft[key] : fallback;
    const nextContent = pick("content", article.content) as DiscoverDoc | undefined;
    setTitle(pick("title", article.title) ?? "");
    setSlug(pick("slug", article.slug) ?? "");
    setSlugEdited(true);
    setExcerpt(pick("excerpt", article.excerpt) ?? "");
    setContent(nextContent?.type === "doc" ? nextContent : EMPTY_DOC);
    setCategoryId(pick("categoryId", article.categoryId) ?? "");
    setCoverImageUrl(pick("coverImageUrl", article.coverImageUrl) ?? "");
    setCoverImageAlt(pick("coverImageAlt", article.coverImageAlt) ?? "");
    setStatus(article.status);
    setScheduleLocal(toLocalInput(article.scheduledAt));
    setPublishedLocal(toLocalInput(article.publishedAt));
    setIsFeatured(pick("isFeatured", article.isFeatured) ?? false);
    setFeaturedInCategory(pick("featuredInCategory", article.featuredInCategory) ?? false);
    setDisplayOrder(pick("displayOrder", article.displayOrder) ?? 0);
    setSenecaEnabled(pick("senecaEnabled", article.senecaEnabled) ?? false);
    setSenecaPrompt(pick("senecaPrompt", article.senecaPrompt) ?? "");
    setSenecaContext(pick("senecaContext", article.senecaContext) ?? "");
    setAuthorName(pick("authorName", article.authorName ?? "") ?? "");
    setLastPublishedAt(article.lastPublishedAt ?? article.publishedAt);
    setLastPublishedBy(article.lastPublishedBy ? article.lastPublishedBy.name?.trim() || article.lastPublishedBy.email : null);
    setLive(Boolean(article.isLive));
    setDraftAt(article.pendingDraft ? (article.pendingDraftAt ?? null) : null);
    setEditorKey((key) => key + 1);
    setDirty(false);
  }

  const words = useMemo(() => wordCount(content), [content]);
  const minutes = readingMinutes(words);
  const categoryName = categories.find((category) => category.id === categoryId)?.name ?? null;
  const touch = () => setDirty(true);

  const payload = (nextStatus: DiscoverStatus): DiscoverArticleInput => ({
    title: title.trim(),
    slug: slug.trim() || slugify(title),
    excerpt,
    content,
    categoryId: categoryId || null,
    coverImageUrl: coverImageUrl || null,
    coverImageAlt: coverImageAlt || null,
    status: nextStatus,
    isFeatured,
    featuredInCategory,
    displayOrder,
    senecaEnabled,
    senecaPrompt,
    senecaContext,
    authorName: authorName.trim(),
    publishedAt: nextStatus === "published" ? fromLocalInput(publishedLocal) : null,
    scheduledAt: nextStatus === "scheduled" ? fromLocalInput(scheduleLocal) : null,
  });

  const save = async (nextStatus: DiscoverStatus) => {
    if (saving || !mayEdit) return;
    if (!title.trim()) {
      setError("Add a title before saving.");
      return;
    }
    if (nextStatus === "scheduled" && !scheduleLocal) {
      setError("Choose a date and time to schedule this article.");
      return;
    }
    setSaving(true);
    setError(null);
    if (live && !isNew) {
      try {
        const savedArticle = await saveDiscoverDraft(articleId, payload(status));
        setDirty(false);
        setDraftAt(savedArticle.pendingDraftAt ?? new Date().toISOString());
        setSavedAt(new Date());
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Save failed.");
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const savedArticle = isNew
        ? await createDiscoverArticle(payload(nextStatus))
        : await updateDiscoverArticle(articleId, payload(nextStatus));
      setDirty(false);
      setStatus(savedArticle.status);
      setSavedAt(new Date());
      if (isNew) navigate(`/admin/discover/${savedArticle.id}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const publishChanges = async () => {
    if (saving || !mayEdit || isNew) return;
    if (!title.trim()) {
      setError("Add a title before publishing.");
      return;
    }
    if (!window.confirm("Publish these changes? Readers will see them right away.")) return;
    setSaving(true);
    setError(null);
    try {
      if (dirty || !draftAt) await saveDiscoverDraft(articleId, payload(status));
      const published = await publishDiscoverDraft(articleId);
      applyArticle(published, false);
      setSavedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Publish failed.");
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = async () => {
    if (saving || !mayEdit || isNew) return;
    if (!window.confirm("Discard your draft changes? The live article stays as it is.")) return;
    setSaving(true);
    setError(null);
    try {
      const restored = draftAt ? await discardDiscoverDraft(articleId) : await fetchDiscoverArticle(articleId);
      applyArticle(restored, false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not discard changes.");
    } finally {
      setSaving(false);
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current(statusRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goBack = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    navigate("/admin/discover");
  };

  const pickCover = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the cover.");
      return;
    }
    setError(null);
    const src = URL.createObjectURL(file);
    pendingOriginal.current = src;
    setCrop({ src, crossOrigin: false, note: null });
  }, []);

  const closeCrop = () => {
    if (pendingOriginal.current && pendingOriginal.current !== coverOriginal) {
      URL.revokeObjectURL(pendingOriginal.current);
    }
    pendingOriginal.current = null;
    setCrop(null);
  };

  const applyCrop = async (file: File) => {
    const original = pendingOriginal.current;
    pendingOriginal.current = null;
    setCrop(null);
    setCoverBusy(true);
    setError(null);
    try {
      const uploaded = await uploadChatMedia(file);
      setCoverImageUrl(uploaded.url);
      if (original && original !== coverOriginal) setCoverOriginal(original);
      touch();
    } catch (reason) {
      if (original && original !== coverOriginal) URL.revokeObjectURL(original);
      setError(reason instanceof Error ? reason.message : "Cover upload failed.");
    } finally {
      setCoverBusy(false);
    }
  };

  const adjustCrop = () => {
    if (coverOriginal) {
      pendingOriginal.current = coverOriginal;
      setCrop({ src: coverOriginal, crossOrigin: false, note: null });
      return;
    }
    setCrop({
      src: coverImageUrl,
      crossOrigin: true,
      note: "Only the cropped cover is saved, so you can zoom in or shift it. To widen the shot, use Replace with the original photo.",
    });
  };

  const removeCover = () => {
    setCoverImageUrl("");
    setCoverOriginal(null);
    touch();
  };

  const hasChanges = dirty || Boolean(draftAt);
  const saveState = !mayEdit
    ? "View only"
    : saving
      ? "Saving…"
      : dirty
        ? "Unsaved changes"
        : live && draftAt
          ? "Changes saved, not live"
          : savedAt
            ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : isNew
              ? "Not saved yet"
              : "All changes saved";
  const primaryLabel =
    status === "published"
      ? "Update"
      : status === "scheduled"
        ? "Schedule"
        : status === "archived"
          ? "Archive"
          : "Publish";
  const publicPath = `/discover/${slug.trim() || slugify(title)}`;

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const goToStep = (next: StepId) => {
    setStepState(next);
    setPreview(false);
    const params = new URLSearchParams(window.location.search);
    params.set("step", next);
    params.delete("preview");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
    document.querySelector('[data-testid="dcb-scroll"]')?.scrollTo(0, 0);
  };
  const checks: { label: string; ok: boolean; optional?: boolean; step: StepId }[] = [
    { label: "Title", ok: Boolean(title.trim()), step: "basics" },
    { label: "Cover photo", ok: Boolean(coverImageUrl), step: "basics" },
    { label: "Image description", ok: Boolean(coverImageAlt.trim()), optional: true, step: "basics" },
    { label: "Short description", ok: Boolean(excerpt.trim()), step: "basics" },
    { label: "Category", ok: Boolean(categoryId), step: "basics" },
    { label: words > 0 ? `Article · ${words.toLocaleString()} words` : "Article text", ok: words > 0, step: "write" },
    { label: "Web address", ok: Boolean(slug.trim() || title.trim()), step: "share" },
  ];
  const stepDone = (id: StepId) =>
    id === "review"
      ? false
      : id === "details"
        ? stepIndex > 2
        : checks.filter((item) => item.step === id && !item.optional).every((item) => item.ok);
  const missing = checks.filter((item) => !item.ok && !item.optional);
  const publishAction = !mayEdit ? null : live ? (
    <button
      type="button"
      className="dcb-btn dcb-btn--primary dcb-btn--lg"
      disabled={saving || !hasChanges}
      onClick={() => void publishChanges()}
    >
      {hasChanges ? "Publish changes" : "No changes to publish"}
    </button>
  ) : (
    <button
      type="button"
      className="dcb-btn dcb-btn--primary dcb-btn--lg"
      disabled={saving}
      onClick={() => void save(status === "draft" || status === "unpublished" ? "published" : status)}
      data-testid="dcb-review-publish"
    >
      {primaryLabel === "Publish" ? "Publish article" : primaryLabel}
    </button>
  );

  if (loading) return <EnterprisePageLoading label="Loading article" />;

  return (
    <div className="dcb-page" data-testid="discover-builder">
      <header className="dcb-top">
        <div className="dcb-top-left">
          <button type="button" className="dcb-btn" onClick={goBack}>
            <ArrowLeft size={16} />
            Back
          </button>
          <nav className="dcb-crumbs" aria-label="Breadcrumb">
            <button type="button" onClick={goBack}>
              Content
            </button>
            <span aria-hidden>/</span>
            <strong title={title}>{title.trim() || "Untitled article"}</strong>
          </nav>
          <span className={`dcb-status dcb-status--${status}`}>{STATUS_LABEL[status]}</span>
          <span className={`dcb-save-state${dirty ? " is-dirty" : ""}`} aria-live="polite">
            {saveState}
          </span>
        </div>
        <div className="dcb-top-right">
          <div className="dcb-seg" role="group" aria-label="Mode">
            <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
              <PenLine size={15} />
              Edit
            </button>
            <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
              <Eye size={15} />
              Preview
            </button>
          </div>
          {mayEdit && live ? (
            <>
              {hasChanges ? (
                <button
                  type="button"
                  className="dcb-btn dcb-btn--ghost"
                  disabled={saving}
                  onClick={() => void discardChanges()}
                  data-testid="dcb-discard"
                >
                  Discard changes
                </button>
              ) : null}
              <button
                type="button"
                className="dcb-btn"
                disabled={saving || !dirty}
                onClick={() => void save(status)}
                data-testid="dcb-save-changes"
              >
                Save changes
              </button>
              <button
                type="button"
                className="dcb-btn dcb-btn--primary"
                disabled={saving || !hasChanges}
                onClick={() => void publishChanges()}
                data-testid="dcb-publish-changes"
              >
                Publish changes
              </button>
            </>
          ) : mayEdit ? (
            <>
              <button type="button" className="dcb-btn" disabled={saving} onClick={() => void save("draft")}>
                Save draft
              </button>
              <button
                type="button"
                className="dcb-btn dcb-btn--primary"
                disabled={saving}
                onClick={() => void save(status === "draft" || status === "unpublished" ? "published" : status)}
              >
                {primaryLabel}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {live && mayEdit ? (
        <div className="dcb-live-bar" role="status" data-testid="dcb-live-note">
          <span className="dcb-live-badge">
            <span className="dcb-live-dot" aria-hidden />
            Live
          </span>
          {draftAt ? (
            <span className="dcb-live-badge dcb-live-badge--draft">
              Unpublished changes · saved {new Date(draftAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          ) : null}
          <span className="dcb-live-copy">
            {draftAt
              ? "Readers see the published version until these changes are published."
              : "Edits are kept in a separate draft. Readers see the published version until you publish."}
          </span>
          {lastPublishedAt ? (
            <span className="dcb-live-meta">
              Last published {new Date(lastPublishedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              {lastPublishedBy ? ` by ${lastPublishedBy}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="dcb-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {mayEdit ? (
        <nav className="dcb-steps" aria-label="Article steps" data-testid="dcb-steps">
          {STEPS.map((item, index) => {
            const done = stepDone(item.id);
            const current = !preview && item.id === step;
            return (
              <button
                key={item.id}
                type="button"
                className={`dcb-step${current ? " is-current" : ""}${done ? " is-done" : ""}`}
                aria-current={current ? "step" : undefined}
                onClick={() => goToStep(item.id)}
              >
                <span className="dcb-step-dot">{done && !current ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
                <span className="dcb-step-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {preview ? (
        <div className="dcb-scroll dcb-preview" data-testid="dcb-scroll">
          <div className="dcb-seg dcb-seg--center" role="group" aria-label="Preview width">
            <button type="button" aria-pressed={frame === 1120} onClick={() => setFrame(1120)}>
              <Monitor size={15} />
              Desktop
            </button>
            <button type="button" aria-pressed={frame === 768} onClick={() => setFrame(768)}>
              <Tablet size={15} />
              Tablet
            </button>
            <button type="button" aria-pressed={frame === 390} onClick={() => setFrame(390)}>
              <Smartphone size={15} />
              Phone
            </button>
          </div>
          <div className="dcb-preview-frame" style={{ maxWidth: frame }}>
            <DiscoverArticleView
              category={categoryName}
              title={title}
              excerpt={excerpt}
              coverImageUrl={coverImageUrl}
              coverImageAlt={coverImageAlt}
              readingTimeMinutes={minutes}
              content={content}
              senecaEnabled={senecaEnabled}
              senecaPrompt={senecaPrompt}
              authorName={authorName}
              publishedAt={lastPublishedAt ?? new Date().toISOString()}
            />
          </div>
        </div>
      ) : (
        <main className="dcb-scroll dcb-steps-scroll" data-testid="dcb-scroll">
          <div className={`dcb-canvas dcb-canvas--${step}`}>
            {step === "basics" ? (
              <>
                  <textarea
                    ref={titleRef}
                    className="dcb-title"
                    value={title}
                    rows={1}
                    placeholder="Article title"
                    aria-label="Title"
                    onChange={(event) => {
                      const next = event.target.value.replace(/\n/g, " ");
                      setTitle(next);
                      if (!slugEdited) setSlug(slugify(next));
                      touch();
                    }}
                  />

                <div className="dcb-basics">
                  <div className="dcb-basics-cover">
                    <div className="dcb-cover-block">
                      {coverImageUrl ? (
                        <figure className={`dcb-cover${coverBusy ? " is-busy" : ""}`}>
                          <img src={coverImageUrl} alt={coverImageAlt || ""} />
                          <div className="dcb-cover-actions">
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={coverBusy}>
                              <RefreshCw size={14} />
                              Replace
                            </button>
                            {coverOriginal || coverRecroppable ? (
                              <button type="button" onClick={adjustCrop} disabled={coverBusy}>
                                <Crop size={14} />
                                Adjust crop
                              </button>
                            ) : null}
                            <button type="button" onClick={removeCover} disabled={coverBusy}>
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </div>
                          {coverBusy ? <span className="dcb-cover-busy">Uploading cover…</span> : null}
                        </figure>
                      ) : (
                        <button
                          type="button"
                          className={`dcb-drop${coverDragOver ? " is-over" : ""}`}
                          disabled={coverBusy}
                          onClick={() => fileRef.current?.click()}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setCoverDragOver(true);
                          }}
                          onDragLeave={() => setCoverDragOver(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setCoverDragOver(false);
                            pickCover(event.dataTransfer.files?.[0]);
                          }}
                        >
                          <span className="dcb-drop-icon">
                            <ImagePlus size={22} />
                          </span>
                          <strong>{coverBusy ? "Uploading cover…" : "Add a cover photo"}</strong>
                          <span>Drop an image here or click to browse. You'll choose the 16:9 crop next.</span>
                        </button>
                      )}
                      <p className="dcb-cover-caption">
                        Saved as 16:9 · 1200×675. Choose a quiet editorial photo that fits the other articles.
                      </p>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        hidden
                        aria-label="Cover image"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          pickCover(file);
                        }}
                      />
                    </div>

                    <label className="dcb-field">
                      <span>Image description</span>
                      <input
                        value={coverImageAlt}
                        placeholder="Describe the cover for people who can't see it"
                        aria-label="Cover image description"
                        onChange={(event) => {
                          setCoverImageAlt(event.target.value);
                          touch();
                        }}
                      />
                    </label>

                  </div>
                  <div className="dcb-basics-fields">
                    <label className="dcb-field">
                      <span className="dcb-field-row">
                        Short description
                        <small className={excerpt.length > EXCERPT_TARGET ? "is-over" : undefined}>
                          {excerpt.length} / {EXCERPT_TARGET}
                        </small>
                      </span>
                      <textarea
                        value={excerpt}
                        rows={2}
                        placeholder="One or two sentences shown on the article card"
                        aria-label="Short description"
                        onChange={(event) => {
                          setExcerpt(event.target.value);
                          touch();
                        }}
                      />
                    </label>

                    <label className="dcb-field">
                      <span>Category</span>
                      <select
                        value={categoryId}
                        aria-label="Category"
                        onChange={(event) => {
                          setCategoryId(event.target.value);
                          touch();
                        }}
                      >
                        <option value="">None</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                            {category.isActive === false ? " (inactive)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </>
            ) : null}

            {step === "write" ? (
              <>
                <p className="dcb-step-title">{title.trim() || "Untitled article"}</p>
                  <DiscoverRichText
                    key={editorKey}
                    value={content}
                    onChange={(json) => {
                      setContent(json as DiscoverDoc);
                      touch();
                    }}
                  />

                  <footer className="dcb-canvas-foot">
                    <span>
                      {words.toLocaleString()} {words === 1 ? "word" : "words"}
                    </span>
                    <span>{minutes > 0 ? `${minutes} min read` : "Reading time appears as you write"}</span>
                    <span className="dcb-kbd-hint">
                      <kbd>⌘</kbd>
                      <kbd>S</kbd> to save
                    </span>
                  </footer>
                          </>
            ) : null}

            {step === "details" ? (
              <>
                <Section
                  title="Placement"
                  hint="Homepage feature is global. Category feature is exclusive — only one article per category."
                >
                  <Switch
                    label="Featured on homepage"
                    checked={isFeatured}
                    onChange={(next) => {
                      setIsFeatured(next);
                      touch();
                    }}
                  />
                  <Switch
                    label="Featured in this category"
                    checked={featuredInCategory}
                    onChange={(next) => {
                      setFeaturedInCategory(next);
                      touch();
                    }}
                  />
                  <label className="dcb-field dcb-field--inline">
                    <span>Display order</span>
                    <input
                      type="number"
                      min={0}
                      value={displayOrder}
                      onChange={(event) => {
                        setDisplayOrder(Number(event.target.value) || 0);
                        touch();
                      }}
                    />
                  </label>
                </Section>
                <Section title="Author">
                  <label className="dcb-field">
                    <span>Author (optional)</span>
                    <input
                      value={authorName}
                      maxLength={80}
                      placeholder="the Alenio Team"
                      aria-label="Author"
                      data-testid="dcb-author"
                      onChange={(event) => {
                        setAuthorName(event.target.value);
                        touch();
                      }}
                    />
                  </label>
                  <p className="dcb-hint">Shown as “By …”. Blank credits the Alenio Team.</p>
                </Section>
                <Section title="Reflect with Seneca" hint="Let readers think the article through with Seneca.">
                  <Switch
                    label="Enable reflection"
                    hint="Readers can reflect on this article with Seneca."
                    checked={senecaEnabled}
                    onChange={(next) => {
                      setSenecaEnabled(next);
                      touch();
                    }}
                  />
                  {senecaEnabled ? (
                    <>
                      <label className="dcb-field">
                        <span>Suggested reflection prompt</span>
                        <textarea
                          value={senecaPrompt}
                          rows={2}
                          onChange={(event) => {
                            setSenecaPrompt(event.target.value);
                            touch();
                          }}
                        />
                      </label>
                      <label className="dcb-field">
                        <span>Context for Seneca</span>
                        <textarea
                          value={senecaContext}
                          rows={3}
                          onChange={(event) => {
                            setSenecaContext(event.target.value);
                            touch();
                          }}
                        />
                      </label>
                    </>
                  ) : null}
                </Section>
              </>
            ) : null}

            {step === "share" ? (
              <Section title="Link & SEO" hint="The web address and the card people see when the article is shared.">
                <label className="dcb-field">
                  <span className="dcb-field-row">
                    URL slug
                    {slugEdited && title.trim() && slug !== slugify(title) ? (
                      <button
                        type="button"
                        className="dcb-link"
                        onClick={() => {
                          setSlug(slugify(title));
                          setSlugEdited(false);
                          touch();
                        }}
                      >
                        Reset from title
                      </button>
                    ) : null}
                  </span>
                  <input
                    value={slug}
                    aria-label="URL slug"
                    onChange={(event) => {
                      setSlugEdited(true);
                      setSlug(event.target.value);
                      touch();
                    }}
                  />
                </label>
                <p className="dcb-url" title={publicPath}>
                  alenio.com{publicPath}
                </p>
                <div className="dcb-mini-card">
                  {coverImageUrl ? <img src={coverImageUrl} alt="" /> : <span className="dcb-mini-card-blank" />}
                  <div>
                    <strong>{title.trim() || "Untitled article"}</strong>
                    <p>{excerpt.trim() || "Add a short description to show here."}</p>
                    <small>alenio.com</small>
                  </div>
                </div>
              </Section>
            ) : null}

            {step === "review" ? (
              <>
                <Section
                  title="Ready to publish?"
                  hint={missing.length ? "A few things still need attention." : "Everything looks good."}
                >
                  <ul className="dcb-checks" data-testid="dcb-checks">
                    {checks.map((item) => (
                      <li key={item.label} className={item.ok ? "is-ok" : item.optional ? "is-optional" : "is-missing"}>
                        {item.ok ? <Check size={15} strokeWidth={3} /> : <CircleAlert size={15} />}
                        <span>
                          {item.label}
                          {!item.ok && item.optional ? <small> · optional</small> : null}
                        </span>
                        {!item.ok ? (
                          <button type="button" className="dcb-link" onClick={() => goToStep(item.step)}>
                            Add
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Section>
                <Section title="Publishing">
                  <label className="dcb-field">
                    <span>Status</span>
                    <select
                      value={status}
                      disabled={live}
                      aria-label="Publication status"
                      onChange={(event) => {
                        setStatus(event.target.value as DiscoverStatus);
                        touch();
                      }}
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="unpublished">Unpublished</option>
                      <option value="archived">Archived</option>
                    </select>
                  </label>
                  {status === "scheduled" ? (
                    <label className="dcb-field">
                      <span>Publish date and time</span>
                      <input
                        type="datetime-local"
                        value={scheduleLocal}
                        disabled={live}
                        onChange={(event) => {
                          setScheduleLocal(event.target.value);
                          touch();
                        }}
                      />
                    </label>
                  ) : null}
                  {status === "published" ? (
                    <label className="dcb-field">
                      <span>Published date</span>
                      <input
                        type="datetime-local"
                        value={publishedLocal}
                        disabled={live}
                        onChange={(event) => {
                          setPublishedLocal(event.target.value);
                          touch();
                        }}
                      />
                    </label>
                  ) : null}
                  {status === "archived" ? <p className="dcb-hint">Archived articles are hidden from Discover.</p> : null}
                  {status === "unpublished" ? (
                    <p className="dcb-hint">Taken down from Discover. Edit freely, then publish it again.</p>
                  ) : null}
                  {live ? (
                    <p className="dcb-hint">To take this article down, use Unpublish on the Content page.</p>
                  ) : null}
                </Section>
                <div className="dcb-review-actions">
                  <button type="button" className="dcb-btn" onClick={() => setPreview(true)}>
                    <Eye size={15} />
                    Preview the article
                  </button>
                  {publishAction}
                </div>
              </>
            ) : null}
          </div>

          <div className="dcb-step-nav">
            {stepIndex > 0 ? (
              <button type="button" className="dcb-btn" onClick={() => goToStep(STEPS[stepIndex - 1].id)}>
                <ArrowLeft size={15} />
                {STEPS[stepIndex - 1].label}
              </button>
            ) : (
              <span />
            )}
            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                className="dcb-btn dcb-btn--primary"
                onClick={() => goToStep(STEPS[stepIndex + 1].id)}
                data-testid="dcb-next"
              >
                Next: {STEPS[stepIndex + 1].label}
                <ArrowRight size={15} />
              </button>
            ) : null}
          </div>
        </main>
      )}

      {crop ? (
        <DiscoverCoverCrop
          src={crop.src}
          crossOrigin={crop.crossOrigin}
          note={crop.note}
          title={title}
          category={categoryName}
          minutes={minutes}
          onCancel={closeCrop}
          onApply={(file) => void applyCrop(file)}
        />
      ) : null}
    </div>
  );
}
