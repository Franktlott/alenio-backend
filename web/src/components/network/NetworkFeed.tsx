import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, MessageCircle, MoreHorizontal, Rss, Send, ThumbsUp, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  addNetworkPostComment,
  createNetworkPost,
  deleteNetworkPost,
  fetchNetworkFeed,
  fetchNetworkPostComments,
  hideNetworkPost,
  LIKE_EMOJI,
  reactToNetworkPost,
  timeAgo,
  type NetworkUpdate,
} from "../../lib/network-api";
import { resolveUserImageUrl } from "../../lib/user-avatar";
import { RowMenu } from "../admin/RowMenu";
import { UserAvatar } from "../UserAvatar";

const FEED_KEY = ["network", "feed"] as const;

type Page = { items: NetworkUpdate[]; nextCursor: string | null };

/** Posts from your connections, with a composer on top. */
export function NetworkFeed({
  me,
  onOpenPerson,
  compact = false,
}: {
  me: { id: string; name: string | null; email: string | null; image: string | null };
  onOpenPerson: (userId: string) => void;
  /** Hide the composer header copy on narrow layouts. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const post = useMutation({
    mutationFn: (body: string) => createNetworkPost(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });

  return (
    <section className="dm-card nw-feed" aria-label="Network feed">
      <div className="nw-feed-head">
        <h2>
          <Rss size={17} strokeWidth={2.2} />
          Network Feed
        </h2>
      </div>

      <Composer me={me} busy={post.isPending} compact={compact} onSubmit={(body) => post.mutate(body)} />
      {post.isError ? <p className="nw-error">Couldn't share that. Try again.</p> : null}

      <PostList
        meId={me.id}
        onOpenPerson={onOpenPerson}
        empty={{
          title: "Nothing here yet",
          body: "Posts from people you're connected with show up here. Share something to get it going.",
        }}
      />
    </section>
  );
}

/**
 * Paged list of posts: the whole network feed, or one person's posts when
 * `authorId` is set. Owns the per-post menu (delete / hide).
 */
export function PostList({
  meId,
  authorId,
  onOpenPerson,
  empty,
}: {
  meId: string;
  authorId?: string;
  onOpenPerson: (userId: string) => void;
  empty: { title: string; body: string };
}) {
  const queryClient = useQueryClient();
  const [pages, setPages] = useState<Page[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const key = authorId ? ([...FEED_KEY, authorId] as const) : FEED_KEY;
  const first = useQuery({
    queryKey: key,
    queryFn: () => fetchNetworkFeed(null, 12, authorId),
    staleTime: 20_000,
  });

  const items = [...(first.data?.items ?? []), ...pages.flatMap((p) => p.items)];
  const nextCursor = cursor === undefined ? first.data?.nextCursor ?? null : cursor;

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchNetworkFeed(nextCursor, 12, authorId);
      setPages((prev) => [...prev, page]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = () => {
    setPages([]);
    setCursor(undefined);
    return queryClient.invalidateQueries({ queryKey: FEED_KEY });
  };
  const remove = useMutation({ mutationFn: deleteNetworkPost, onSuccess: () => void refresh() });
  const hide = useMutation({ mutationFn: hideNetworkPost, onSuccess: () => void refresh() });

  const menuItem = menu ? items.find((p) => p.id === menu.id) ?? null : null;

  return (
    <>
      {first.isLoading ? <p className="nw-muted nw-feed-state">Loading…</p> : null}
      {first.isError ? <p className="nw-error nw-feed-state">Couldn't load posts.</p> : null}

      {!first.isLoading && !first.isError && items.length === 0 ? (
        <div className="dm-empty nw-feed-empty">
          <Rss size={22} strokeWidth={2} />
          <h3>{empty.title}</h3>
          <p>{empty.body}</p>
        </div>
      ) : null}

      <ul className="nw-posts">
        {items.map((item) => (
          <PostCard
            key={item.id}
            item={item}
            meId={meId}
            onOpenPerson={onOpenPerson}
            onMenu={(anchor) => setMenu((cur) => (cur?.id === item.id ? null : { id: item.id, anchor }))}
            menuOpen={menu?.id === item.id}
          />
        ))}
      </ul>

      {nextCursor ? (
        <button type="button" className="nw-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Show more"}
        </button>
      ) : null}

      {menu && menuItem ? (
        <RowMenu anchor={menu.anchor} onClose={() => setMenu(null)}>
          {menuItem.canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="dm-menu-danger"
              onClick={() => {
                setMenu(null);
                remove.mutate(menuItem.id);
              }}
            >
              <Trash2 size={15} strokeWidth={2} />
              Delete post
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                hide.mutate(menuItem.id);
              }}
            >
              <EyeOff size={15} strokeWidth={2} />
              Hide this post
            </button>
          )}
        </RowMenu>
      ) : null}
    </>
  );
}

function Composer({
  me,
  busy,
  compact,
  onSubmit,
}: {
  me: { name: string | null; email: string | null; image: string | null };
  busy: boolean;
  compact: boolean;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSubmit(text);
    setBody("");
  };
  return (
    <form className="nw-composer" onSubmit={submit} data-testid="nw-composer">
      <UserAvatar user={me} className="nw-avatar" imgClassName="nw-avatar-img" alt="" />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={compact ? "Share an update…" : "Share an update with your network…"}
        rows={body.length > 80 ? 3 : 1}
        maxLength={2000}
        aria-label="New post"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(event);
        }}
      />
      <button type="submit" className="nw-composer-send" disabled={busy || !body.trim()} aria-label="Post">
        <Send size={16} strokeWidth={2.2} />
      </button>
    </form>
  );
}

function PostCard({
  item,
  meId,
  onOpenPerson,
  onMenu,
  menuOpen,
}: {
  item: NetworkUpdate;
  meId: string;
  onOpenPerson: (userId: string) => void;
  onMenu: (anchor: HTMLElement) => void;
  menuOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const like = item.reactions[LIKE_EMOJI];
  const liked = Boolean(like?.userIds.includes(meId));
  const likeCount = Object.values(item.reactions).reduce((sum, r) => sum + r.count, 0);

  const react = useMutation({
    mutationFn: () => reactToNetworkPost(item.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });

  const author = item.user;
  const image = item.metadata?.imageUrl ? resolveUserImageUrl(item.metadata.imageUrl) : null;

  return (
    <li className="nw-post" data-testid={`nw-post-${item.id}`}>
      <div className="nw-post-head">
        <button type="button" className="nw-post-author" onClick={() => author && onOpenPerson(author.id)}>
          <UserAvatar user={author ?? { name: "Someone" }} className="nw-avatar" imgClassName="nw-avatar-img" alt="" />
          <span className="nw-person-copy">
            <span className="nw-person-name">{author?.name ?? "Someone"}</span>
            <span className="nw-person-sub">
              {timeAgo(item.createdAt)} · Alenio Network
            </span>
          </span>
        </button>
        <button
          type="button"
          className="dm-more"
          aria-label="Post options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => onMenu(event.currentTarget)}
        >
          <MoreHorizontal size={16} strokeWidth={2.2} />
        </button>
      </div>

      {item.metadata?.body ? <p className="nw-post-body">{item.metadata.body}</p> : null}
      {image ? (
        item.metadata?.mediaType === "video" ? (
          <video className="nw-post-media" src={image} controls preload="metadata" />
        ) : (
          <img className="nw-post-media" src={image} alt="" loading="lazy" />
        )
      ) : null}

      <div className="nw-post-actions">
        <button
          type="button"
          className={`nw-post-action${liked ? " nw-post-action--on" : ""}`}
          onClick={() => react.mutate()}
          disabled={react.isPending}
          aria-pressed={liked}
        >
          <ThumbsUp size={15} strokeWidth={2.2} />
          {likeCount}
        </button>
        <button
          type="button"
          className={`nw-post-action${showComments ? " nw-post-action--on" : ""}`}
          onClick={() => setShowComments((v) => !v)}
          aria-expanded={showComments}
        >
          <MessageCircle size={15} strokeWidth={2.2} />
          {item.commentCount}
        </button>
      </div>

      {showComments ? <Comments postId={item.id} onOpenPerson={onOpenPerson} /> : null}
    </li>
  );
}

function Comments({ postId, onOpenPerson }: { postId: string; onOpenPerson: (id: string) => void }) {
  const queryClient = useQueryClient();
  const key = ["network", "comments", postId] as const;
  const comments = useQuery({ queryKey: key, queryFn: () => fetchNetworkPostComments(postId) });
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: (text: string) => addNetworkPostComment(postId, text),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
  });

  return (
    <div className="nw-comments">
      {comments.isLoading ? <p className="nw-muted">Loading comments…</p> : null}
      {comments.data?.map((c) => (
        <div key={c.id} className={`nw-comment${c.parentId ? " nw-comment--reply" : ""}`}>
          <button type="button" className="nw-comment-avatar" onClick={() => onOpenPerson(c.author.id)} aria-label={`Open ${c.author.name}`}>
            <UserAvatar user={c.author} className="nw-avatar nw-avatar--sm" imgClassName="nw-avatar-img" alt="" />
          </button>
          <div className="nw-comment-bubble">
            <span className="nw-comment-meta">
              <strong>{c.author.name}</strong> · {timeAgo(c.createdAt)}
            </span>
            <p>{c.body}</p>
          </div>
        </div>
      ))}
      <form
        className="nw-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) add.mutate(body.trim());
        }}
      >
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a comment…"
          maxLength={1000}
          aria-label="New comment"
        />
        <button type="submit" disabled={add.isPending || !body.trim()}>
          Reply
        </button>
      </form>
    </div>
  );
}
