import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Rss,
  Send,
  ThumbsUp,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { LIKE_EMOJI, timeAgo } from "../../lib/network-api";
import { resolveUserImageUrl } from "../../lib/user-avatar";
import {
  activityActorName,
  activityHeadline,
  addWorkspaceActivityComment,
  celebrationLabel,
  createWorkspacePost,
  deleteWorkspaceActivity,
  fetchWorkspaceActivityComments,
  fetchWorkspaceFeed,
  firstName,
  isWorkspaceFeedType,
  reactToWorkspaceActivity,
  WORKSPACE_FEED_FILTERS,
  type WorkspaceActivity,
  type WorkspaceFeedFilter,
  type WorkspaceFeedPage,
} from "../../lib/workspace-feed-api";
import { RowMenu } from "../admin/RowMenu";
import { UserAvatar } from "../UserAvatar";

const feedKey = (teamId: string) => ["workspace", "feed", teamId] as const;

type Me = { id: string; name: string | null; email: string | null; image: string | null };

/**
 * One workspace's feed: composer on top, then posts, recognition, new
 * members and milestones, newest first. Reactions are a single 👍 toggle.
 */
export function WorkspaceFeed({
  teamId,
  teamName,
  me,
  canModerate,
  onOpenPerson,
}: {
  teamId: string;
  teamName: string;
  me: Me;
  /** Owners and team leaders can remove anyone's post or recognition. */
  canModerate: boolean;
  onOpenPerson: (userId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<WorkspaceFeedFilter>("all");
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [pages, setPages] = useState<WorkspaceFeedPage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  const first = useQuery({
    queryKey: feedKey(teamId),
    queryFn: () => fetchWorkspaceFeed(teamId, null, 12),
    staleTime: 20_000,
  });

  const refresh = () => {
    setPages([]);
    setCursor(undefined);
    return queryClient.invalidateQueries({ queryKey: feedKey(teamId) });
  };

  const post = useMutation({
    mutationFn: (body: string) => createWorkspacePost(teamId, body),
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWorkspaceActivity(teamId, id),
    onSuccess: () => void refresh(),
  });

  const all = [...(first.data?.items ?? []), ...pages.flatMap((p) => p.items)].filter((item) =>
    isWorkspaceFeedType(item.type),
  );
  const items = filter === "all" ? all : all.filter((item) => item.type === filter);
  const nextCursor = cursor === undefined ? first.data?.nextCursor ?? null : cursor;

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchWorkspaceFeed(teamId, nextCursor, 12);
      setPages((prev) => [...prev, page]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  // A page can be all task completions (hidden here). Keep paging a few times
  // before calling the feed empty, so "quiet" means quiet.
  const autoFill = !first.isLoading && !first.isError && items.length === 0 && Boolean(nextCursor) && pages.length < 4;
  useEffect(() => {
    if (autoFill && !loadingMore) void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFill, loadingMore]);

  const menuItem = menu ? all.find((p) => p.id === menu.id) ?? null : null;
  const canDelete = (item: WorkspaceActivity) =>
    (item.type === "post" || item.type === "celebration") && (item.user?.id === me.id || canModerate);
  const filterLabel = WORKSPACE_FEED_FILTERS.find((f) => f.id === filter)?.label ?? "All activity";

  return (
    <section className="dm-card nw-feed ws-feed" aria-label="Workspace feed" data-testid="ws-feed">
      <div className="nw-feed-head">
        <h2>
          <Rss size={17} strokeWidth={2.2} />
          Workspace Feed
        </h2>
        <button
          type="button"
          className="ws-filter"
          aria-haspopup="menu"
          aria-expanded={Boolean(filterAnchor)}
          onClick={(event) => setFilterAnchor((cur) => (cur ? null : event.currentTarget))}
          data-testid="ws-feed-filter"
        >
          {filterLabel}
          <ChevronDown size={14} strokeWidth={2.4} />
        </button>
      </div>

      <Composer
        me={me}
        teamName={teamName}
        busy={post.isPending}
        onSubmit={(body) => post.mutate(body)}
      />
      {post.isError ? <p className="nw-error">Couldn't share that. Try again.</p> : null}

      {first.isLoading ? <p className="nw-muted nw-feed-state">Loading…</p> : null}
      {first.isError ? <p className="nw-error nw-feed-state">Couldn't load the feed.</p> : null}

      <div className="ws-feed-scroll">
      {autoFill || (loadingMore && items.length === 0) ? <p className="nw-muted nw-feed-state">Loading…</p> : null}
      {!first.isLoading && !first.isError && !autoFill && !loadingMore && items.length === 0 ? (
        <div className="dm-empty nw-feed-empty">
          <Rss size={22} strokeWidth={2} />
          <h3>{filter === "all" ? "Quiet in here" : `No ${filterLabel.toLowerCase()} yet`}</h3>
          <p>
            {filter === "all"
              ? "Posts, recognition and new members from this workspace show up here. Share the first update."
              : "Try a different filter, or share something new."}
          </p>
        </div>
      ) : null}

      <ul className="nw-posts ws-posts">
        {items.map((item) => (
          <ActivityCard
            key={item.id}
            item={item}
            teamId={teamId}
            meId={me.id}
            onOpenPerson={onOpenPerson}
            menuOpen={menu?.id === item.id}
            onMenu={
              canDelete(item)
                ? (anchor) => setMenu((cur) => (cur?.id === item.id ? null : { id: item.id, anchor }))
                : undefined
            }
          />
        ))}
      </ul>

      {nextCursor && items.length > 0 ? (
        <button
          type="button"
          className="ws-more"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          data-testid="ws-feed-more"
        >
          {loadingMore ? "Loading…" : "View more activity"}
          <ArrowRight size={15} strokeWidth={2.4} />
        </button>
      ) : null}
      </div>

      {filterAnchor ? (
        <RowMenu anchor={filterAnchor} onClose={() => setFilterAnchor(null)}>
          {WORKSPACE_FEED_FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={filter === option.id}
              onClick={() => {
                setFilter(option.id);
                setFilterAnchor(null);
              }}
            >
              {filter === option.id ? <Check size={15} strokeWidth={2.4} /> : <span className="ws-menu-gap" />}
              {option.label}
            </button>
          ))}
        </RowMenu>
      ) : null}

      {menu && menuItem ? (
        <RowMenu anchor={menu.anchor} onClose={() => setMenu(null)}>
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
            {menuItem.type === "celebration" ? "Delete recognition" : "Delete post"}
          </button>
        </RowMenu>
      ) : null}
    </section>
  );
}

function Composer({
  me,
  teamName,
  busy,
  onSubmit,
}: {
  me: Me;
  teamName: string;
  busy: boolean;
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
    <form className="nw-composer" onSubmit={submit} data-testid="ws-composer">
      <UserAvatar user={me} className="nw-avatar" imgClassName="nw-avatar-img" alt="" />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Share an update…"
        title={`Share an update with ${teamName}`}
        rows={body.length > 80 ? 3 : 1}
        maxLength={2000}
        aria-label="New workspace post"
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

function ActivityCard({
  item,
  teamId,
  meId,
  onOpenPerson,
  onMenu,
  menuOpen,
}: {
  item: WorkspaceActivity;
  teamId: string;
  meId: string;
  onOpenPerson: (userId: string) => void;
  onMenu?: (anchor: HTMLElement) => void;
  menuOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const liked = Object.values(item.reactions).some((r) => r.userIds.includes(meId));
  const likeCount = Object.values(item.reactions).reduce((sum, r) => sum + r.count, 0);

  const react = useMutation({
    mutationFn: () => reactToWorkspaceActivity(teamId, item.id, LIKE_EMOJI),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: feedKey(teamId) }),
  });

  const actor = item.user;
  const name = activityActorName(item);
  const meta = item.metadata ?? {};
  const image = meta.imageUrl ? resolveUserImageUrl(meta.imageUrl) : null;

  return (
    <li className={`nw-post ws-item ws-item--${item.type}`} data-testid={`ws-item-${item.id}`}>
      <div className="nw-post-head">
        <button
          type="button"
          className="nw-post-author"
          onClick={() => actor && onOpenPerson(actor.id)}
          disabled={!actor}
        >
          <UserAvatar user={actor ?? { name }} className="nw-avatar" imgClassName="nw-avatar-img" alt="" />
          <span className="nw-person-copy">
            <span className="ws-headline">
              <strong>{name}</strong> {activityHeadline(item)}
            </span>
            <span className="nw-person-sub">{timeAgo(item.createdAt)}</span>
          </span>
        </button>
        {onMenu ? (
          <button
            type="button"
            className="dm-more"
            aria-label="Options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(event) => onMenu(event.currentTarget)}
          >
            <MoreHorizontal size={16} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>

      <ActivityBody item={item} name={name} image={image} onOpenPerson={onOpenPerson} />

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

      {showComments ? <Comments teamId={teamId} activityId={item.id} onOpenPerson={onOpenPerson} /> : null}
    </li>
  );
}

/** Type-specific middle of the card. */
function ActivityBody({
  item,
  name,
  image,
  onOpenPerson,
}: {
  item: WorkspaceActivity;
  name: string;
  image: string | null;
  onOpenPerson: (userId: string) => void;
}) {
  const meta = item.metadata ?? {};

  if (item.type === "member_joined") {
    const first = firstName(meta.userName ?? name);
    return (
      <div className="ws-body">
        <span className="dm-pill ws-pill ws-pill--member">
          <UserPlus size={12} strokeWidth={2.4} />
          New member
        </span>
        <p className="ws-title">Welcome to the team, {first}! 👋</p>
        <p className="ws-sub">Say hello and help {first} get started.</p>
      </div>
    );
  }

  if (item.type === "celebration") {
    const kind = celebrationLabel(meta.celebrationType);
    const target = meta.targetName?.trim() || "A teammate";
    return (
      <div className="ws-body">
        <span className="dm-pill ws-pill ws-pill--kudos">
          <span aria-hidden>{kind.emoji}</span>
          {kind.label}
        </span>
        <div className="ws-kudos">
          <button
            type="button"
            className="ws-kudos-person"
            onClick={() => meta.targetUserId && onOpenPerson(meta.targetUserId)}
            disabled={!meta.targetUserId}
          >
            <UserAvatar
              user={{ name: target, image: meta.targetUserImage ?? null }}
              className="nw-avatar"
              imgClassName="nw-avatar-img"
              alt=""
            />
            <span className="nw-person-copy">
              <span className="nw-person-name">{target}</span>
              <span className="nw-person-sub">Recognized by {name}</span>
            </span>
          </button>
          {meta.message?.trim() ? <p className="ws-kudos-quote">“{meta.message.trim()}”</p> : null}
        </div>
      </div>
    );
  }

  if (item.type === "task_milestone") {
    const count = typeof meta.count === "number" && meta.count > 0 ? Math.floor(meta.count) : 0;
    return (
      <div className="ws-body">
        <span className="dm-pill ws-pill ws-pill--milestone">
          <Flag size={12} strokeWidth={2.4} />
          Milestone
        </span>
        <p className="ws-title">
          {count > 0 ? `${count} tasks completed on time, in a row` : "An on-time streak in progress"}
        </p>
        <p className="ws-sub">Great work keeping the workspace moving.</p>
      </div>
    );
  }

  // Posts and anything else with a body.
  return (
    <>
      {meta.body ? <p className="nw-post-body">{meta.body}</p> : null}
      {image ? (
        meta.mediaType === "video" ? (
          <video className="nw-post-media" src={image} controls preload="metadata" />
        ) : (
          <img className="nw-post-media" src={image} alt="" loading="lazy" />
        )
      ) : null}
    </>
  );
}

function Comments({
  teamId,
  activityId,
  onOpenPerson,
}: {
  teamId: string;
  activityId: string;
  onOpenPerson: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const key = ["workspace", "comments", teamId, activityId] as const;
  const comments = useQuery({ queryKey: key, queryFn: () => fetchWorkspaceActivityComments(teamId, activityId) });
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: (text: string) => addWorkspaceActivityComment(teamId, activityId, text),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: feedKey(teamId) });
    },
  });

  return (
    <div className="nw-comments">
      {comments.isLoading ? <p className="nw-muted">Loading comments…</p> : null}
      {comments.data?.map((c) => (
        <div key={c.id} className={`nw-comment${c.parentId ? " nw-comment--reply" : ""}`}>
          <button
            type="button"
            className="nw-comment-avatar"
            onClick={() => onOpenPerson(c.author.id)}
            aria-label={`Open ${c.author.name}`}
          >
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
