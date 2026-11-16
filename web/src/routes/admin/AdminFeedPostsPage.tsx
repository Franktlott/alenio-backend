import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus,
  Lock,
  LockOpen,
  Megaphone,
  MessageCircle,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { ContentSectionTabs } from "../../components/admin/ContentSectionTabs";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { UserAvatar } from "../../components/UserAvatar";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createAdminFeedPostComment,
  createAdminFeedPost,
  deleteAdminFeedPostComment,
  deleteAdminFeedPost,
  fetchAdminFeedPostComments,
  fetchAdminFeedPosts,
  reactToAdminFeedPostComment,
  type AdminFeedComment,
  type AdminFeedPost,
  updateAdminFeedPostComments,
} from "../../lib/admin-feed-posts-api";
import { uploadFeedPostMedia } from "../../lib/api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-manage.css";
import "./admin-feed-posts.css";

const QUERY_KEY = ["admin-feed-posts"] as const;
const COMMENT_REACTIONS = ["👍", "❤️", "🎉"] as const;

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

function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function AdminFeedPostComments({
  item,
  canEdit,
  currentUserId,
}: {
  item: AdminFeedPost;
  canEdit: boolean;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const commentsKey = [...QUERY_KEY, item.id, "comments"] as const;
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<AdminFeedComment | null>(null);

  const comments = useQuery({
    queryKey: commentsKey,
    queryFn: () => fetchAdminFeedPostComments(item.id),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: commentsKey }),
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    ]);
  };

  const add = useMutation({
    mutationFn: ({
      body,
      parentId,
    }: {
      body: string;
      parentId?: string;
    }) => createAdminFeedPostComment(item.id, body, parentId),
    onSuccess: async () => {
      setDraft("");
      setReplyTo(null);
      await refresh();
    },
  });

  const react = useMutation({
    mutationFn: ({
      commentId,
      emoji,
    }: {
      commentId: string;
      emoji: string;
    }) => reactToAdminFeedPostComment(item.id, commentId, emoji),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commentsKey });
    },
  });

  const removeComment = useMutation({
    mutationFn: (commentId: string) =>
      deleteAdminFeedPostComment(item.id, commentId),
    onSuccess: refresh,
  });

  const onSend = () => {
    const body = draft.trim();
    if (!body || add.isPending || item.commentsLocked) return;
    add.mutate({ body, parentId: replyTo?.id });
  };

  const rows = comments.data ?? [];
  const actionError = add.error ?? react.error ?? removeComment.error;

  return (
    <div className="afp-comments" data-testid={`admin-feed-post-comments-panel-${item.id}`}>
      {comments.isLoading ? <p className="afp-comments-state">Loading comments…</p> : null}
      {comments.error ? (
        <p className="discover-error">
          {comments.error instanceof Error ? comments.error.message : "Couldn’t load comments."}
        </p>
      ) : null}
      {!comments.isLoading && !comments.error && rows.length === 0 ? (
        <p className="afp-comments-state">No comments yet.</p>
      ) : null}

      {rows.length > 0 ? (
        <div className="afp-comment-list">
          {rows.map((comment) => (
            <article
              key={comment.id}
              className={`afp-comment${comment.parentId ? " afp-comment--reply" : ""}`}
            >
              {comment.author.id === "alenio" ? (
                <span className="afp-comment-avatar" aria-label="Alenio">
                  <img
                    src="/icon.png"
                    alt=""
                    className="afp-comment-avatar-img"
                  />
                </span>
              ) : (
                <UserAvatar
                  user={comment.author}
                  className="afp-comment-avatar"
                  imgClassName="afp-comment-avatar-img"
                  alt=""
                />
              )}
              <div className="afp-comment-main">
                <div className="afp-comment-bubble">
                  <div className="afp-comment-head">
                    <strong>{comment.author.name || "Member"}</strong>
                    <span>{formatWhen(comment.createdAt)}</span>
                  </div>
                  <p>{comment.body}</p>
                </div>
                {canEdit ? (
                  <div className="afp-comment-actions">
                    {COMMENT_REACTIONS.map((emoji) => {
                      const summary = comment.reactions[emoji];
                      const active = summary?.userIds.includes(currentUserId) ?? false;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          className={active ? "is-active" : ""}
                          aria-label={`React ${emoji}`}
                          disabled={react.isPending}
                          onClick={() => react.mutate({ commentId: comment.id, emoji })}
                        >
                          {emoji}
                          {summary?.count ? <span>{summary.count}</span> : null}
                        </button>
                      );
                    })}
                    {!item.commentsLocked ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(comment);
                          setDraft("");
                        }}
                      >
                        <Reply size={13} />
                        Reply
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="is-destructive"
                      disabled={removeComment.isPending}
                      onClick={() => {
                        if (window.confirm("Remove this comment and its replies?")) {
                          removeComment.mutate(comment.id);
                        }
                      }}
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {actionError ? (
        <p className="discover-error">
          {actionError instanceof Error ? actionError.message : "Couldn’t update comments."}
        </p>
      ) : null}

      {item.commentsLocked ? (
        <div className="afp-comments-locked">
          <Lock size={15} />
          Comments are locked. Existing comments can still be reviewed, reacted to, or removed.
        </div>
      ) : canEdit ? (
        <div className="afp-comment-composer">
          {replyTo ? (
            <div className="afp-replying">
              <span>Replying to {replyTo.author.name || "Member"}</span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
                <X size={13} />
              </button>
            </div>
          ) : null}
          <div className="afp-comment-compose-row">
            <textarea
              rows={2}
              maxLength={1000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={replyTo ? "Write a reply…" : "Join the conversation…"}
              data-testid={`admin-feed-post-comment-input-${item.id}`}
            />
            <button
              type="button"
              disabled={!draft.trim() || add.isPending}
              onClick={onSend}
              aria-label={replyTo ? "Post reply" : "Post comment"}
              data-testid={`admin-feed-post-comment-send-${item.id}`}
            >
              <Send size={15} />
              {add.isPending ? "Posting…" : replyTo ? "Reply" : "Comment"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminFeedPostsPage() {
  const queryClient = useQueryClient();
  const { me } = useEnterpriseShell();
  const canView = staffCan(me, "content.view");
  const canEdit = staffCan(me, "content.edit");
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageWidth, setImageWidth] = useState<number | null>(null);
  const [imageHeight, setImageHeight] = useState<number | null>(null);
  const [draftCommentsLocked, setDraftCommentsLocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaved, setFormSaved] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAdminFeedPosts,
    enabled: Boolean(me) && canView,
  });

  const clearPhoto = () => {
    setImageUrl("");
    setImageWidth(null);
    setImageHeight(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Choose an image file (JPG, PNG, or WebP).");
      return;
    }
    setUploading(true);
    setFormError(null);
    setFormSaved(null);
    try {
      const [uploaded, size] = await Promise.all([
        uploadFeedPostMedia(file),
        readImageSize(file),
      ]);
      setImageUrl(uploaded.url);
      setImageWidth(size?.width ?? null);
      setImageHeight(size?.height ?? null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publish = useMutation({
    mutationFn: () =>
      createAdminFeedPost({
        body: draft.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        imageWidth: imageWidth ?? undefined,
        imageHeight: imageHeight ?? undefined,
        mediaType: imageUrl.trim() ? "image" : undefined,
        commentsLocked: draftCommentsLocked,
      }),
    onSuccess: async () => {
      setDraft("");
      setDraftCommentsLocked(false);
      clearPhoto();
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

  const updateComments = useMutation({
    mutationFn: ({
      activityId,
      commentsLocked,
    }: {
      activityId: string;
      commentsLocked: boolean;
    }) => updateAdminFeedPostComments(activityId, commentsLocked),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (me === undefined || (canView && isLoading)) {
    return <EnterprisePageLoading label="Loading Alenio feed posts…" />;
  }

  if (!me || !canView) {
    return (
      <div className="dm-page afp-page">
        <p className="discover-error" style={{ margin: 24 }}>
          You don’t have access to Content.
        </p>
      </div>
    );
  }

  const canPublish =
    canEdit &&
    !uploading &&
    (draft.trim().length > 0 || imageUrl.trim().length > 0);

  return (
    <div className="dm-page afp-page" data-testid="admin-feed-posts-page">
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

          <label className="afp-lock-option">
            <input
              type="checkbox"
              checked={draftCommentsLocked}
              onChange={(event) => setDraftCommentsLocked(event.target.checked)}
              disabled={publish.isPending}
              data-testid="admin-feed-post-comments-locked"
            />
            <span>
              <strong>Lock comments</strong>
              <small>Members can read existing comments but cannot add new ones.</small>
            </span>
          </label>

          <span className="afp-label">
            Photo <span className="afp-optional">(optional)</span>
          </span>
          <p className="afp-photo-hint">
            Best results: landscape JPG or PNG,{" "}
            <strong>1600×900</strong> (16:9) or <strong>1200×900</strong> (4:3).
            Keep faces and text away from the edges — corners are rounded in the
            Feed.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="afp-file-input"
            disabled={uploading || publish.isPending}
            onChange={(event) => void onUpload(event.target.files?.[0] ?? null)}
            data-testid="admin-feed-post-image-file"
          />
          {imageUrl ? (
            <div className="afp-photo-preview">
              <img src={imageUrl} alt="Upload preview" />
              {imageWidth && imageHeight ? (
                <p className="afp-photo-meta">
                  {imageWidth}×{imageHeight}
                  {imageWidth >= imageHeight ? " · landscape" : " · portrait"}
                </p>
              ) : null}
              <button
                type="button"
                className="afp-photo-remove"
                aria-label="Remove photo"
                disabled={uploading || publish.isPending}
                onClick={clearPhoto}
                data-testid="admin-feed-post-image-clear"
              >
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="afp-photo-pick"
              disabled={uploading || publish.isPending}
              onClick={() => fileRef.current?.click()}
              data-testid="admin-feed-post-image"
            >
              <ImagePlus size={16} strokeWidth={2.2} />
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
          )}

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
                      <img className="afp-item-thumb" src={image} alt="" />
                    ) : null}
                    <p className="afp-item-meta">
                      {item.commentCount} comment{item.commentCount === 1 ? "" : "s"}
                      {" · "}
                      {item.commentsLocked ? "Comments locked" : "Comments open"}
                    </p>
                    <button
                      type="button"
                      className="afp-review-comments"
                      aria-expanded={reviewingId === item.id}
                      onClick={() =>
                        setReviewingId((current) => (current === item.id ? null : item.id))
                      }
                      data-testid={`admin-feed-post-review-comments-${item.id}`}
                    >
                      <MessageCircle size={14} strokeWidth={2.2} />
                      {reviewingId === item.id
                        ? "Close conversation"
                        : item.commentCount > 0
                          ? `Review ${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}`
                          : "Open conversation"}
                    </button>
                  </div>
                  {canEdit ? (
                    <div className="afp-item-actions">
                      <button
                        type="button"
                        className={`afp-lock-toggle${item.commentsLocked ? " is-locked" : ""}`}
                        aria-label={item.commentsLocked ? "Unlock comments" : "Lock comments"}
                        disabled={updateComments.isPending}
                        onClick={() =>
                          updateComments.mutate({
                            activityId: item.id,
                            commentsLocked: !item.commentsLocked,
                          })
                        }
                        data-testid={`admin-feed-post-comments-${item.id}`}
                      >
                        {item.commentsLocked ? (
                          <Lock size={15} strokeWidth={2.2} />
                        ) : (
                          <LockOpen size={15} strokeWidth={2.2} />
                        )}
                        {item.commentsLocked ? "Unlock" : "Lock"}
                      </button>
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
                    </div>
                  ) : null}
                  {reviewingId === item.id ? (
                    <AdminFeedPostComments
                      item={item}
                      canEdit={canEdit}
                      currentUserId={me.id}
                    />
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
