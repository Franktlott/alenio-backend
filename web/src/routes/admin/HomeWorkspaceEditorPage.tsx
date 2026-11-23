import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { uploadHomeInsightMedia } from "../../lib/api";
import {
  createHomeWorkspaceCard,
  deleteHomeWorkspaceCard,
  fetchHomeWorkspaceAdminCard,
  updateHomeWorkspaceCard,
  type HomeWorkspaceCard,
  type HomeWorkspaceInput,
} from "../../lib/home-workspace-api";
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
  destinationType: "create" | "join";
  isActive: boolean;
};

const EMPTY: Draft = {
  title: "",
  body: "",
  actionLabel: "Create a workspace",
  accessibilityLabel: "",
  imageUrl: "",
  surfaceColor: "#1A0B3A",
  fade0: "rgba(20,9,56,0.96)",
  fade1: "rgba(26,11,69,0.86)",
  fade2: "rgba(42,15,99,0.05)",
  borderColor: "#2A0F63",
  titleColor: "#FFFFFF",
  bodyColor: "rgba(255,255,255,0.72)",
  button0: "#5B32D6",
  button1: "#7C4DFF",
  destinationType: "create",
  isActive: true,
};

function draftFromCard(card: HomeWorkspaceCard): Draft {
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
    isActive: card.isActive,
  };
}

function toInput(draft: Draft): HomeWorkspaceInput {
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
    isActive: draft.isActive,
  };
}

export function HomeWorkspaceEditorPage() {
  const { cardId } = useParams<{ cardId: string }>();
  const isNew = !cardId || cardId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canEdit = staffCan(me, "content.edit");
  const canView = staffCan(me, "content.view");

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-home-workspace-card", cardId],
    queryFn: () => fetchHomeWorkspaceAdminCard(cardId!),
    enabled: Boolean(me) && canView && !isNew && Boolean(cardId),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (existing) setDraft(draftFromCard(existing));
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const body = toInput(draft);
      if (isNew) return createHomeWorkspaceCard(body);
      return updateHomeWorkspaceCard(cardId!, body);
    },
    onSuccess: async (card) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-home-workspace"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-home-workspace-card", card.id] });
      await queryClient.invalidateQueries({ queryKey: ["home-workspace"] });
      setError(null);
      setSavedNote(
        `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      );
      if (isNew) navigate(`/admin/home-workspace/${card.id}`, { replace: true });
      else {
        queryClient.setQueryData(["admin-home-workspace-card", card.id], card);
        setDraft(draftFromCard(card));
      }
    },
    onError: (err) => {
      setSavedNote(null);
      setError(err instanceof Error ? err.message : "Couldn’t save.");
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteHomeWorkspaceCard(cardId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-home-workspace"] });
      navigate("/admin/home-workspace");
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
    return <EnterprisePageLoading label="Loading workspace card…" />;
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
    <div className="dm-page" data-testid="home-workspace-editor">
      <header className="dm-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy">
          <nav className="dm-crumbs" aria-label="Breadcrumb">
            <Link to="/admin/home-workspace">Alenio Workspace Card</Link>
            <span aria-hidden>›</span>
            <span>{isNew ? "New" : "Edit"}</span>
          </nav>
          <h1>{isNew ? "New workspace card" : "Edit workspace card"}</h1>
          <p>Shown on Home when the member has no workspace yet.</p>
        </div>
      </header>

      <ContentSectionTabs active="home-workspace" />

      {error ? <p className="discover-error">{error}</p> : null}
      {savedNote && !error ? (
        <p className="enterprise-muted" style={{ margin: "8px 32px 0" }}>
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
            <label htmlFor="hw-title">Title</label>
            <textarea
              id="hw-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hw-body">Body</label>
            <textarea
              id="hw-body"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hw-action">Button label</label>
            <input
              id="hw-action"
              value={draft.actionLabel}
              onChange={(e) => set("actionLabel", e.target.value)}
              disabled={!canEdit}
              required
            />
          </div>
          <div className="hi-field">
            <label htmlFor="hw-dest">Button opens</label>
            <select
              id="hw-dest"
              value={draft.destinationType}
              onChange={(e) =>
                set("destinationType", e.target.value as "create" | "join")
              }
              disabled={!canEdit}
            >
              <option value="create">Create a workspace</option>
              <option value="join">Join with a code</option>
            </select>
          </div>
          <div className="hi-field">
            <label htmlFor="hw-image">Image</label>
            <input
              id="hw-image"
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
          <label className="hi-check">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set("isActive", e.target.checked)}
              disabled={!canEdit}
            />
            Active in the deck
          </label>

          <div className="hi-actions">
            {canEdit ? (
              <button type="submit" className="dm-new" disabled={save.isPending || uploading}>
                {save.isPending ? "Saving…" : "Save card"}
              </button>
            ) : null}
            {!isNew && canEdit ? (
              <button
                type="button"
                className="dm-ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Delete this workspace card?")) remove.mutate();
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>

        <aside className="hi-preview" style={previewStyle}>
          {draft.imageUrl ? (
            <img src={draft.imageUrl} alt="" className="hi-preview-photo" />
          ) : null}
          <div
            className="hi-preview-fade"
            style={{
              background: `linear-gradient(90deg, ${draft.fade0}, ${draft.fade1}, ${draft.fade2})`,
            }}
          />
          <div className="hi-preview-copy">
            <p className="hi-preview-kicker" style={{ color: draft.titleColor }}>
              WORKSPACE
            </p>
            <h2 style={{ color: draft.titleColor, whiteSpace: "pre-line" }}>
              {draft.title || "Title"}
            </h2>
            <p style={{ color: draft.bodyColor }}>{draft.body || "Body"}</p>
            <span
              className="hi-preview-cta"
              style={{
                background: `linear-gradient(90deg, ${draft.button0}, ${draft.button1})`,
              }}
            >
              {draft.actionLabel || "Action"}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
