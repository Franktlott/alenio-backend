import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createAdminFeedPost,
  deleteAdminFeedPost,
  fetchAdminFeedPosts,
} from "../../lib/admin-feed-posts-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./admin-feed-posts.css";

const QUERY_KEY = ["admin-feed-posts"] as const;

function postBody(metadata: Record<string, unknown> | null): string {
  const body = metadata?.body;
  return typeof body === "string" ? body.trim() : "";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminFeedPostsPage() {
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canView = staffCan(me, "content.view");
  const canEdit = staffCan(me, "content.edit");

  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaved, setFormSaved] = useState<string | null>(null);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAdminFeedPosts,
    enabled: Boolean(me) && canView,
  });

  const publish = useMutation({
    mutationFn: () =>
      createAdminFeedPost({
        body: draft.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      }),
    onSuccess: async () => {
      setDraft("");
      setImageUrl("");
      setFormError(null);
      setFormSaved(
        `Published ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
      );
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => {
      setFormSaved(null);
      setFormError(err instanceof Error ? err.message : "Couldn’t publish this post.");
    },
  });

  const remove = useMutation({
    mutationFn: deleteAdminFeedPost,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (me === undefined || (canView && isLoading)) {
    return <EnterprisePageLoading label="Loading Alenio feed posts…" />;
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

  const canPublish = canEdit && (draft.trim().length > 0 || imageUrl.trim().length > 0);

  return (
    <div className="dm-page" data-testid="admin-feed-posts-page">
      <header className="dm-header">
        <div>
          <p className="dm-kicker">Content</p>
          <h1>Alenio feed</h1>
          <p className="dm-sub">
            Publish a post that appears in every member’s personal Feed as Alenio.
          </p>
        </div>
      </header>

      <ContentSectionTabs active="feed-posts" />

      {canEdit ? (
        <section className="afp-composer" aria-label="Compose Alenio post">
          <div className="afp-composer-title">
            <Megaphone size={16} strokeWidth={2.2} />
            <span>New post to all members</span>
          </div>
          <label className="afp-label" htmlFor="afp-body">
            Message
          </label>
          <textarea
            id="afp-body"
            className="afp-textarea"
            rows={5}
            maxLength={2000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Share an update with everyone on Alenio…"
            data-testid="admin-feed-post-body"
          />
          <label className="afp-label" htmlFor="afp-image">
            Image URL <span className="afp-optional">(optional)</span>
          </label>
          <input
            id="afp-image"
            className="afp-input"
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://"
            data-testid="admin-feed-post-image"
          />
          {formError ? <p className="discover-error">{formError}</p> : null}
          {formSaved ? <p className="afp-saved">{formSaved}</p> : null}
          <div className="afp-actions">
            <button
              type="button"
              className="dm-primary"
              disabled={!canPublish || publish.isPending}
              onClick={() => publish.mutate()}
              data-testid="admin-feed-post-publish"
            >
              {publish.isPending ? "Publishing…" : "Publish to Feed"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="afp-list" aria-label="Published Alenio posts">
        <h2 className="afp-list-title">Published</h2>
        {error ? (
          <p className="discover-error">
            {error instanceof Error ? error.message : "Couldn’t load posts."}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="afp-empty">No Alenio feed posts yet.</p>
        ) : (
          <ul className="afp-items">
            {items.map((item) => {
              const body = postBody(item.metadata);
              const image =
                typeof item.metadata?.imageUrl === "string"
                  ? item.metadata.imageUrl
                  : null;
              return (
                <li key={item.id} className="afp-item" data-testid={`admin-feed-post-${item.id}`}>
                  <div className="afp-item-copy">
                    <p className="afp-item-when">{formatWhen(item.createdAt)}</p>
                    {body ? <p className="afp-item-body">{body}</p> : null}
                    {image ? (
                      <a className="afp-item-image" href={image} target="_blank" rel="noreferrer">
                        {image}
                      </a>
                    ) : null}
                    <p className="afp-item-meta">
                      {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="afp-delete"
                      aria-label="Delete post"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Remove this Alenio post from everyone’s Feed?")) {
                          remove.mutate(item.id);
                        }
                      }}
                      data-testid={`admin-feed-post-delete-${item.id}`}
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default AdminFeedPostsPage;
