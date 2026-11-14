import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { uploadHomeInsightMedia } from "../../lib/api";
import { fetchDiscoverArticles } from "../../lib/discover-api";
import {
  createHomeInsight,
  deleteHomeInsight,
  fetchHomeInsightAdmin,
  updateHomeInsight,
  type HomeInsightCard,
  type HomeInsightInput,
} from "../../lib/home-insights-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./home-insights-admin.css";

type Draft = {
  title: string;
  body: string;
  actionLabel: string;
  accessibilityLabel: string;
  imageUrl: string;
  surfaceColor: string;
  fade0: string;
  fade1: string;
  fade2: string;
  borderColor: string;
  titleColor: string;
  bodyColor: string;
  button0: string;
  button1: string;
  destinationType: "recognition" | "seneca" | "discover";
  senecaPrompt: string;
  discoverArticleId: string;
  discoverSlug: string;
  discoverTitle: string;
  isActive: boolean;
};

const EMPTY: Draft = {
  title: "",
  body: "",
  actionLabel: "Explore with Seneca",
  accessibilityLabel: "",
  imageUrl: "",
  surfaceColor: "#F7F1FF",
  fade0: "#F7F1FF",
  fade1: "rgba(247,241,255,0.94)",
  fade2: "rgba(247,241,255,0)",
  borderColor: "#E6D8FF",
  titleColor: "#17172B",
  bodyColor: "#69677B",
  button0: "#5B32D6",
  button1: "#7C4DFF",
  destinationType: "seneca",
  senecaPrompt: "",
  discoverArticleId: "",
  discoverSlug: "",
  discoverTitle: "",
  isActive: true,
};

function draftFromCard(card: HomeInsightCard): Draft {
  return {
    title: card.title,
    body: card.body,
    actionLabel: card.actionLabel,
    accessibilityLabel: card.accessibilityLabel,
    imageUrl: card.imageUrl ?? "",
    surfaceColor: card.surfaceColor,
    fade0: card.fadeColors[0],
    fade1: card.fadeColors[1],
    fade2: card.fadeColors[2],
    borderColor: card.borderColor,
    titleColor: card.titleColor,
    bodyColor: card.bodyColor,
    button0: card.buttonColors[0],
    button1: card.buttonColors[1],
    destinationType: card.destination.type,
    senecaPrompt: card.destination.type === "seneca" ? card.destination.prompt : "",
    discoverArticleId: card.destination.type === "discover" ? card.destination.articleId : "",
    discoverSlug: card.destination.type === "discover" ? card.destination.slug : "",
    discoverTitle: card.destination.type === "discover" ? card.destination.slug : "",
    isActive: card.isActive,
  };
}

function toInput(draft: Draft): HomeInsightInput {
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    actionLabel: draft.actionLabel.trim(),
    accessibilityLabel: draft.accessibilityLabel.trim() || draft.actionLabel.trim(),
    imageUrl: draft.imageUrl.trim() || null,
    surfaceColor: draft.surfaceColor.trim(),
    fadeColors: [draft.fade0.trim(), draft.fade1.trim(), draft.fade2.trim()],
    borderColor: draft.borderColor.trim(),
    titleColor: draft.titleColor.trim(),
    bodyColor: draft.bodyColor.trim(),
    buttonColors: [draft.button0.trim(), draft.button1.trim()],
    destinationType: draft.destinationType,
    senecaPrompt: draft.senecaPrompt,
    discoverArticleId: draft.discoverArticleId || null,
    discoverSlug: draft.discoverSlug || null,
    isActive: draft.isActive,
  };
}

export function HomeInsightEditorPage() {
  const { insightId } = useParams<{ insightId: string }>();
  const isNew = !insightId || insightId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canEdit = staffCan(me, "content.edit");
  const canView = staffCan(me, "content.view");

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-home-insight", insightId],
    queryFn: () => fetchHomeInsightAdmin(insightId!),
    enabled: Boolean(me) && canView && !isNew && Boolean(insightId),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [articleQuery, setArticleQuery] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (existing) setDraft(draftFromCard(existing));
  }, [existing]);

  const articles = useQuery({
    queryKey: ["admin-discover-picker", articleQuery],
    queryFn: () =>
      fetchDiscoverArticles({ q: articleQuery || undefined, status: "published", pageSize: 8 }),
    enabled: draft.destinationType === "discover" && canEdit,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = toInput(draft);
      if (isNew) return createHomeInsight(body);
      return updateHomeInsight(insightId!, body);
    },
    onSuccess: async (card) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-home-insights"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-home-insight", card.id] });
      await queryClient.invalidateQueries({ queryKey: ["home-insights"] });
      setError(null);
      setSavedNote(`Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
      if (isNew) navigate(`/admin/home-insights/${card.id}`, { replace: true });
      else {
        queryClient.setQueryData(["admin-home-insight", card.id], card);
        setDraft(draftFromCard(card));
      }
    },
    onError: (err) => {
      setSavedNote(null);
      setError(err instanceof Error ? err.message : "Couldn’t save.");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteHomeInsight(insightId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-home-insights"] });
      navigate("/admin/home-insights");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn’t delete."),
  });

  const previewStyle = useMemo(
    () => ({
      background: draft.surfaceColor,
      borderColor: draft.borderColor,
    }),
    [draft.borderColor, draft.surfaceColor],
  );

  if (me === undefined || (!isNew && isLoading)) {
    return <EnterprisePageLoading label="Loading insight…" />;
  }

  if (!me || !canView) {
    return (
      <div className="dm-page">
        <p className="discover-error" style={{ margin: 24 }}>
          You don’t have access to Content.
        </p>
      </div>
    );
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadHomeInsightMedia(file);
      set("imageUrl", uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="dm-page" data-testid="home-insight-editor">
      <header className="dm-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/admin/home-insights">Home insights</Link>
            <span aria-hidden>›</span>
            <span>{isNew ? "New" : "Edit"}</span>
          </nav>
          <h1>{isNew ? "New insight card" : "Edit insight card"}</h1>
          <p>Card-only — long-form pages stay in Discover.</p>
        </div>
      </header>

      <ContentSectionTabs active="home-insights" />

      {error ? <p className="discover-error">{error}</p> : null}
      {savedNote && !error ? (
        <p className="enterprise-muted" style={{ margin: "8px 32px 0" }} data-testid="hi-saved">
          {savedNote}
        </p>
      ) : null}

      <div className="hi-editor">
        <form
          className="hi-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit || save.isPending || uploading) return;
            setSavedNote(null);
            save.mutate();
          }}
        >
          <div className="hi-field">
            <label htmlFor="hi-title">Title</label>
            <textarea
              id="hi-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={"Who deserves\nrecognition today?"}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hi-body">Body</label>
            <textarea
              id="hi-body"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hi-action">Button label</label>
            <input
              id="hi-action"
              value={draft.actionLabel}
              onChange={(e) => set("actionLabel", e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hi-a11y">Accessibility label</label>
            <input
              id="hi-a11y"
              value={draft.accessibilityLabel}
              onChange={(e) => set("accessibilityLabel", e.target.value)}
              disabled={!canEdit}
              placeholder="Defaults to button label"
            />
          </div>

          <div className="hi-field">
            <label htmlFor="hi-image">Image</label>
            <input
              id="hi-image"
              value={draft.imageUrl}
              onChange={(e) => set("imageUrl", e.target.value)}
              disabled={!canEdit}
              placeholder="https://… or /insight/…"
            />
            {canEdit ? (
              <input
                type="file"
                accept="image/*"
                style={{ marginTop: 8 }}
                disabled={uploading}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            ) : null}
          </div>

          <div className="hi-field">
            <label htmlFor="hi-dest">Button opens</label>
            <select
              id="hi-dest"
              value={draft.destinationType}
              onChange={(e) =>
                set("destinationType", e.target.value as Draft["destinationType"])
              }
              disabled={!canEdit}
            >
              <option value="seneca">Seneca (with prompt)</option>
              <option value="recognition">Recognition</option>
              <option value="discover">Discover article</option>
            </select>
          </div>

          {draft.destinationType === "seneca" ? (
            <div className="hi-field">
              <label htmlFor="hi-prompt">Seneca prompt</label>
              <textarea
                id="hi-prompt"
                value={draft.senecaPrompt}
                onChange={(e) => set("senecaPrompt", e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>
          ) : null}

          {draft.destinationType === "discover" ? (
            <div className="hi-field">
              <label htmlFor="hi-article-q">Discover article</label>
              {draft.discoverSlug ? (
                <p style={{ margin: "0 0 8px", fontSize: 13 }}>
                  Selected: <strong>{draft.discoverTitle || draft.discoverSlug}</strong>
                </p>
              ) : null}
              <input
                id="hi-article-q"
                value={articleQuery}
                onChange={(e) => setArticleQuery(e.target.value)}
                disabled={!canEdit}
                placeholder="Search published articles…"
              />
              <div className="hi-article-results">
                {(articles.data?.items ?? []).map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    aria-pressed={draft.discoverArticleId === article.id}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        discoverArticleId: article.id,
                        discoverSlug: article.slug,
                        discoverTitle: article.title,
                      }))
                    }
                  >
                    {article.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="hi-colors">
            {(
              [
                ["surfaceColor", "Surface"],
                ["borderColor", "Border"],
                ["titleColor", "Title"],
                ["bodyColor", "Body"],
                ["button0", "Button start"],
                ["button1", "Button end"],
                ["fade0", "Fade 1"],
                ["fade1", "Fade 2"],
                ["fade2", "Fade 3"],
              ] as const
            ).map(([key, label]) => (
              <div className="hi-field" key={key}>
                <label htmlFor={`hi-${key}`}>{label}</label>
                <input
                  id={`hi-${key}`}
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            ))}
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              disabled={!canEdit}
            />
            Active in weekly rotation
          </label>

          {canEdit ? (
            <div className="hi-actions">
              <button type="submit" className="dm-new" disabled={save.isPending || uploading}>
                {save.isPending ? "Saving…" : savedNote ? "Saved" : "Save card"}
              </button>
              <button type="button" className="dm-tab" onClick={() => navigate("/admin/home-insights")}>
                Cancel
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="dm-tab"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm("Delete this insight card?")) remove.mutate();
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </form>

        <aside className="hi-preview-wrap" aria-label="Preview">
          <div className="hi-preview" style={previewStyle}>
            {draft.imageUrl ? (
              <img src={draft.imageUrl} alt="" className="hi-preview-photo" />
            ) : null}
            <div
              className="hi-preview-fade"
              style={{
                background: `linear-gradient(90deg, ${draft.fade0} 0%, ${draft.fade1} 45%, ${draft.fade2} 100%)`,
              }}
              aria-hidden
            />
            <div className="hi-preview-copy">
              <div className="hi-preview-label" style={{ color: draft.titleColor }}>
                Insight
              </div>
              <h2 className="hi-preview-title" style={{ color: draft.titleColor }}>
                {draft.title || "Title"}
              </h2>
              <p className="hi-preview-body" style={{ color: draft.bodyColor }}>
                {draft.body || "Supporting line"}
              </p>
              <span
                className="hi-preview-action"
                style={{ background: `linear-gradient(90deg, ${draft.button0}, ${draft.button1})` }}
              >
                {draft.actionLabel || "Action"}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
