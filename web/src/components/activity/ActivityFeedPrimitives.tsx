import { useRef, useState } from "react";
import type { ActivityReactionBucket, ApiActivityItem } from "../lib/api";

const EMOJI_OPTIONS = ["😊", "❤️", "😂", "😮", "🔥", "🎉"];

export const CELEBRATION_TYPES = [
  { key: "shoutout", label: "Shoutout", tag: "Recognition", color: "#D97706", bg: "#FFFBEB", gradient: "linear-gradient(135deg, #92400E 0%, #B45309 100%)", icon: "⭐" },
  { key: "mvp", label: "MVP", tag: "Most Valuable", color: "#7C3AED", bg: "#EEF2FF", gradient: "linear-gradient(135deg, #4C1D95 0%, #6D28D9 100%)", icon: "🏆" },
  { key: "beyond", label: "Above & Beyond", tag: "Top Performer", color: "#059669", bg: "#ECFDF5", gradient: "linear-gradient(135deg, #064E3B 0%, #047857 100%)", icon: "🥇" },
  { key: "rockstar", label: "Rockstar", tag: "High Impact", color: "#EA580C", bg: "#FFF7ED", gradient: "linear-gradient(135deg, #7C2D12 0%, #C2410C 100%)", icon: "⚡" },
  { key: "clutch", label: "Clutch", tag: "Clutch Play", color: "#DC2626", bg: "#FEF2F2", gradient: "linear-gradient(135deg, #7F1D1D 0%, #B91C1C 100%)", icon: "🎯" },
  { key: "teamplayer", label: "Team Player", tag: "Team Impact", color: "#1D4ED8", bg: "#EFF6FF", gradient: "linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)", icon: "👥" },
  { key: "bigbrain", label: "Big Brain", tag: "Problem Solver", color: "#0891B2", bg: "#ECFEFF", gradient: "linear-gradient(135deg, #164E63 0%, #0E7490 100%)", icon: "💡" },
  { key: "onfire", label: "On Fire", tag: "On a Roll", color: "#4338CA", bg: "#EEF2FF", gradient: "linear-gradient(135deg, #312E81 0%, #3730A3 100%)", icon: "🔥" },
  { key: "milestone", label: "Milestone", tag: "Milestone Hit", color: "#7C3AED", bg: "#F5F3FF", gradient: "linear-gradient(135deg, #4C1D95 0%, #5B21B6 100%)", icon: "🚩" },
  { key: "grateful", label: "Grateful", tag: "Team Spirit", color: "#E11D48", bg: "#FDF2F8", gradient: "linear-gradient(135deg, #881337 0%, #BE123C 100%)", icon: "❤️" },
] as const;

const EVENT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; icon: string; getMessage: (e: ApiActivityItem) => string }
> = {
  task_completed: {
    label: "Task Done",
    color: "#10B981",
    bg: "#ECFDF5",
    icon: "✓",
    getMessage: (e) =>
      e.metadata?.taskTitle
        ? `${e.user?.name ?? "Someone"} completed “${e.metadata.taskTitle}”`
        : `${e.user?.name ?? "Someone"} completed a task`,
  },
  member_joined: {
    label: "Joined",
    color: "#4361EE",
    bg: "#EEF2FF",
    icon: "+",
    getMessage: (e) => `${e.user?.name ?? e.metadata?.userName ?? "Someone"} joined the team`,
  },
  member_removed: {
    label: "Left",
    color: "#F59E0B",
    bg: "#FFFBEB",
    icon: "−",
    getMessage: (e) => `${e.user?.name ?? e.metadata?.userName ?? "Someone"} left the team`,
  },
  calendar_event_added: {
    label: "Event Added",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    icon: "📅",
    getMessage: (e) => {
      const count = e.metadata?.eventCount ?? 1;
      if (count > 1) return `${e.user?.name ?? "Someone"} added ${count} events to the calendar`;
      const title = e.metadata?.eventTitles?.[0] ?? e.metadata?.eventTitle;
      return title
        ? `${e.user?.name ?? "Someone"} added “${title}” to the calendar`
        : `${e.user?.name ?? "Someone"} added an event to the calendar`;
    },
  },
  task_assigned: {
    label: "Assigned",
    color: "#4361EE",
    bg: "#EEF2FF",
    icon: "✓",
    getMessage: (e) => {
      const count = e.metadata?.taskCount ?? 1;
      if (count > 1) return `${e.user?.name ?? "Someone"} was assigned ${count} tasks`;
      const title = e.metadata?.taskTitles?.[0] ?? e.metadata?.taskTitle;
      return title
        ? `${e.user?.name ?? "Someone"} was assigned “${title}”`
        : `${e.user?.name ?? "Someone"} was assigned a task`;
    },
  },
  task_milestone: {
    label: "Milestone",
    color: "#F59E0B",
    bg: "#FFFBEB",
    icon: "🏆",
    getMessage: (e) => `${e.user?.name ?? "Someone"} completed ${e.metadata?.count ?? 10} tasks on time!`,
  },
  personal_best: {
    label: "Personal Best",
    color: "#F59E0B",
    bg: "#FFFBEB",
    icon: "🏆",
    getMessage: (e) =>
      `${e.user?.name ?? "Someone"} hit a new personal best of ${e.metadata?.count ?? 0} on-time tasks!`,
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function variantFromId(id: string, mod: number): number {
  return parseInt(id.replace(/\D/g, "").slice(0, 6) || "0", 10) % mod;
}

function useLongPress(onLongPress: () => void, ms = 550) {
  const timerRef = useRef<number | null>(null);
  const clear = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  return {
    onPointerDown: () => {
      clear();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
  };
}

function ReactionRow({
  activityId,
  reactions,
  currentUserId,
  onToggleReaction,
  showPicker,
  onClosePicker,
}: {
  activityId: string;
  reactions: Record<string, ActivityReactionBucket>;
  currentUserId: string | undefined;
  onToggleReaction: (emoji: string) => void;
  showPicker: boolean;
  onClosePicker: () => void;
}) {
  const existingReactions = Object.entries(reactions ?? {});
  const myReaction = currentUserId
    ? existingReactions.find(([, { userIds }]) => userIds.includes(currentUserId))?.[0]
    : undefined;
  const [whoReacted, setWhoReacted] = useState<{ emoji: string; users: { id: string; name: string | null }[] } | null>(
    null,
  );

  return (
    <div className="enterprise-activity-reactions">
      {whoReacted ? (
        <div
          className="enterprise-activity-who-backdrop"
          role="presentation"
          onClick={() => setWhoReacted(null)}
        >
          <div className="enterprise-activity-who-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-activity-who-emoji">{whoReacted.emoji}</div>
            <p className="enterprise-activity-who-count">
              {whoReacted.users.length} {whoReacted.users.length === 1 ? "person" : "people"} reacted
            </p>
            <ul className="enterprise-activity-who-list">
              {whoReacted.users.map((u) => (
                <li key={u.id} className="enterprise-activity-who-row">
                  <span className="enterprise-activity-who-av">{((u.name ?? "?")[0] ?? "?").toUpperCase()}</span>
                  <span className="enterprise-activity-who-name">{u.name ?? "Member"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {showPicker ? (
        <div className="enterprise-activity-emoji-picker" data-testid={`emoji-picker-${activityId}`}>
          {EMOJI_OPTIONS.map((emoji) => {
            const isMine = emoji === myReaction;
            return (
              <button
                key={emoji}
                type="button"
                data-testid={`pick-emoji-${activityId}-${emoji}`}
                className={`enterprise-activity-emoji-btn ${isMine ? "enterprise-activity-emoji-btn-on" : ""}`}
                onClick={() => {
                  onToggleReaction(emoji);
                  onClosePicker();
                }}
              >
                {emoji}
              </button>
            );
          })}
          {myReaction ? (
            <button
              type="button"
              className="enterprise-activity-emoji-remove"
              onClick={() => {
                onToggleReaction(myReaction);
                onClosePicker();
              }}
            >
              Remove
            </button>
          ) : (
            <button type="button" className="enterprise-activity-emoji-close" onClick={onClosePicker} aria-label="Close">
              ✕
            </button>
          )}
        </div>
      ) : null}

      <div className="enterprise-activity-reaction-pills">
        {existingReactions.map(([emoji, { count, userIds, users = [] }]) => {
          const isActive = !!currentUserId && userIds.includes(currentUserId);
          return (
            <button
              key={emoji}
              type="button"
              className={`enterprise-activity-pill ${isActive ? "enterprise-activity-pill-on" : ""}`}
              onClick={() => setWhoReacted({ emoji, users })}
              onDoubleClick={(e) => {
                e.preventDefault();
                onToggleReaction(emoji);
              }}
              title="Click to see who reacted · double-click to toggle yours"
            >
              <span>{emoji}</span>
              <span className="enterprise-activity-pill-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CelebrationMilestoneCard({
  item,
  currentUserId,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
}: {
  item: ApiActivityItem;
  currentUserId: string | undefined;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => Promise<void>;
}) {
  const count = item.metadata?.count ?? 10;
  const name = item.user?.name ?? "Someone";
  const longPress = useLongPress(onOpenPicker);
  const v = variantFromId(item.id, 4);
  const themes = [
    { ring: "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)", flair: "New record!" },
    { ring: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)", flair: "Top performer streak!" },
    { ring: "linear-gradient(135deg, #10b981 0%, #059669 100%)", flair: "Consistency is power 🌿" },
    { ring: "linear-gradient(135deg, #f43f5e 0%, #ea580c 100%)", flair: "On fire, no breaks! 💥" },
  ];
  const t = themes[v] ?? themes[0]!;

  return (
    <article
      className="enterprise-activity-milestone-card"
      data-testid={`milestone-card-${item.id}`}
      {...longPress}
    >
      <div className="enterprise-activity-milestone-ring" style={{ background: t.ring }}>
        <div className="enterprise-activity-milestone-inner">
          <div className="enterprise-activity-milestone-row">
            <div className="enterprise-activity-milestone-trophy" aria-hidden>
              🏆
            </div>
            <div className="enterprise-activity-milestone-copy">
              <span className="enterprise-activity-milestone-kicker">Milestone reached!</span>
              <div className="enterprise-activity-milestone-count-row">
                <span className="enterprise-activity-milestone-num">{count}</span>
                <span className="enterprise-activity-milestone-unit">tasks on time</span>
              </div>
              <p className="enterprise-activity-milestone-name">{name} · Keep it up 🔥</p>
            </div>
            <img src="/alenio-logo.png" alt="Alenio" className="enterprise-activity-milestone-logo" width={28} height={28} />
          </div>
          <div className="enterprise-activity-milestone-foot">
            <div className="enterprise-activity-milestone-user">
              {item.user?.image ? (
                <img src={item.user.image} alt={`${name} profile photo`} className="enterprise-activity-milestone-av" />
              ) : (
                <span className="enterprise-activity-milestone-av-ph">{name[0]?.toUpperCase() ?? "?"}</span>
              )}
              <span>{name}</span>
            </div>
            <span className="enterprise-activity-milestone-time">{timeAgo(item.createdAt)}</span>
          </div>
          <p className="enterprise-activity-milestone-flair">{t.flair}</p>
          <ReactionRow
            activityId={item.id}
            reactions={item.reactions ?? {}}
            currentUserId={currentUserId}
            onToggleReaction={(em) => void onToggleReaction(em)}
            showPicker={showPicker}
            onClosePicker={onClosePicker}
          />
        </div>
      </div>
    </article>
  );
}

function PersonalBestCard({
  item,
  currentUserId,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
}: {
  item: ApiActivityItem;
  currentUserId: string | undefined;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => Promise<void>;
}) {
  const count = item.metadata?.count ?? 0;
  const name = item.user?.name ?? "Someone";
  const longPress = useLongPress(onOpenPicker);
  const v = variantFromId(item.id, 3);
  const themes = [
    {
      gradient: "linear-gradient(135deg, #FB923C 0%, #F97316 45%, #EA580C 100%)",
      emoji: "🔥",
      headline: `${name} is BACK and better than ever! 💪🔥`,
      sub: "Personal best streak matched! 🏆",
    },
    {
      gradient: "linear-gradient(135deg, #60A5FA 0%, #3B82F6 45%, #2563EB 100%)",
      emoji: "❄️",
      headline: `${name} is BACK in ice cold form! ❄️💙`,
      sub: "Personal best streak matched! 🏆",
    },
    {
      gradient: "linear-gradient(135deg, #F472B6 0%, #EC4899 45%, #DB2777 100%)",
      emoji: "💫",
      headline: `${name} just made a STUNNING comeback! 💫💖`,
      sub: "Personal best streak matched! 🏆",
    },
  ];
  const t = themes[v] ?? themes[0]!;

  return (
    <article
      className="enterprise-activity-pb-card"
      style={{ background: t.gradient }}
      data-testid={`personal-best-card-${item.id}`}
      {...longPress}
    >
      <img src="/alenio-logo-white.png" alt="Alenio" className="enterprise-activity-pb-watermark" width={28} height={28} />
      <div className="enterprise-activity-pb-sparkles" aria-hidden />
      <div className="enterprise-activity-pb-body">
        <div className="enterprise-activity-pb-badge-wrap">
          <div className="enterprise-activity-pb-badge">
            <span className="enterprise-activity-pb-badge-emoji">{t.emoji}</span>
            <span className="enterprise-activity-pb-badge-num">{count}</span>
          </div>
        </div>
        <p className="enterprise-activity-pb-muted">tasks in a row</p>
        <p className="enterprise-activity-pb-headline">{t.headline}</p>
        <p className="enterprise-activity-pb-sub">{t.sub}</p>
        <div className="enterprise-activity-pb-foot">
          <div className="enterprise-activity-pb-user">
            {item.user?.image ? (
              <img src={item.user.image} alt={`${name} profile photo`} className="enterprise-activity-pb-av" />
            ) : (
              <span className="enterprise-activity-pb-av-ph">{name[0]?.toUpperCase() ?? "?"}</span>
            )}
            <span>{name}</span>
          </div>
          <span className="enterprise-activity-pb-time">{timeAgo(item.createdAt)}</span>
        </div>
        <ReactionRow
          activityId={item.id}
          reactions={item.reactions ?? {}}
          currentUserId={currentUserId}
          onToggleReaction={(em) => void onToggleReaction(em)}
          showPicker={showPicker}
          onClosePicker={onClosePicker}
        />
      </div>
    </article>
  );
}

function CelebrationPostCard({
  item,
  currentUserId,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
}: {
  item: ApiActivityItem;
  currentUserId: string | undefined;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => Promise<void>;
}) {
  const meta = item.metadata;
  const celebType = CELEBRATION_TYPES.find((t) => t.key === meta?.celebrationType) ?? CELEBRATION_TYPES[0]!;
  const fromName = item.user?.name ?? "Someone";
  const toName = meta?.targetName ?? "a teammate";
  const longPress = useLongPress(onOpenPicker);

  return (
    <article
      className="enterprise-activity-celeb-card"
      style={{ background: celebType.gradient }}
      data-testid={`celebration-post-card-${item.id}`}
      {...longPress}
    >
      <span className="enterprise-activity-celeb-watermark" aria-hidden>
        {celebType.icon}
      </span>
      <div className="enterprise-activity-celeb-body">
        <div className="enterprise-activity-celeb-top">
          <span className="enterprise-activity-celeb-chip">
            <span>{celebType.icon}</span>
            <span>{celebType.label}</span>
          </span>
          <span className="enterprise-activity-celeb-time">{timeAgo(item.createdAt)}</span>
        </div>
        <div className="enterprise-activity-celeb-main">
          <div className="enterprise-activity-celeb-target-av">
            {meta?.targetUserImage ? (
              <img src={meta.targetUserImage} alt={`${toName} profile photo`} />
            ) : (
              <span className="enterprise-activity-celeb-target-icon" style={{ color: celebType.color }}>
                {celebType.icon}
              </span>
            )}
          </div>
          <div className="enterprise-activity-celeb-text">
            <h3 className="enterprise-activity-celeb-to">{toName}</h3>
            <p className="enterprise-activity-celeb-from">Recognized by {fromName}</p>
          </div>
          <span className="enterprise-activity-celeb-tag">{celebType.tag.toUpperCase()}</span>
        </div>
        {meta?.message ? (
          <blockquote className="enterprise-activity-celeb-quote">“{meta.message}”</blockquote>
        ) : null}
        <ReactionRow
          activityId={item.id}
          reactions={item.reactions ?? {}}
          currentUserId={currentUserId}
          onToggleReaction={(em) => void onToggleReaction(em)}
          showPicker={showPicker}
          onClosePicker={onClosePicker}
        />
      </div>
    </article>
  );
}

function StandardActivityItem({
  item,
  currentUserId,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
}: {
  item: ApiActivityItem;
  currentUserId: string | undefined;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => Promise<void>;
}) {
  const config =
    EVENT_CONFIG[item.type] ??
    ({
      label: item.type,
      color: "#64748B",
      bg: "#F1F5F9",
      icon: "·",
      getMessage: () => "Activity update",
    } as (typeof EVENT_CONFIG)[string]);
  const longPress = useLongPress(onOpenPicker);
  const assignees = item.metadata?.assignees;

  return (
    <article className="enterprise-activity-standard" data-testid={`activity-item-${item.id}`} {...longPress}>
      <div className="enterprise-activity-standard-row">
        <div className="enterprise-activity-avatar-wrap">
          {item.user?.image ? (
            <img src={item.user.image} alt={item.user?.name ?? "User profile"} className="enterprise-activity-avatar" />
          ) : (
            <div className="enterprise-activity-avatar enterprise-activity-avatar-placeholder" aria-hidden>
              {(item.user?.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
        <div className="enterprise-activity-standard-main">
          <div className="enterprise-activity-standard-badges">
            <span className="enterprise-activity-type-badge" style={{ background: config.bg, color: config.color }}>
              <span aria-hidden>{config.icon}</span>
              {config.label}
            </span>
            <span className="enterprise-activity-when">{timeAgo(item.createdAt)}</span>
          </div>
          <p className="enterprise-activity-msg">{config.getMessage(item)}</p>

          {item.type === "task_completed" && assignees && assignees.length > 0 ? (
            <div className="enterprise-activity-assignees">
              <div className="enterprise-activity-assignee-stack">
                {assignees.slice(0, 3).map((a) => (
                  <span key={a.id} className="enterprise-activity-assignee-av" title={a.name}>
                    {a.image ? <img src={a.image} alt={a.name ?? "Assignee"} /> : (a.name[0] ?? "?").toUpperCase()}
                  </span>
                ))}
                {assignees.length > 3 ? (
                  <span className="enterprise-activity-assignee-more">+{assignees.length - 3}</span>
                ) : null}
              </div>
              <span className="enterprise-activity-assignee-names">
                {assignees.length <= 2
                  ? assignees.map((a) => a.name ?? "Member").join(" & ")
                  : assignees.length === 3
                    ? `${assignees[0]!.name ?? "Member"}, ${assignees[1]!.name ?? "Member"} & ${assignees[2]!.name ?? "Member"}`
                    : `${assignees[0]!.name ?? "Member"}, ${assignees[1]!.name ?? "Member"} & ${assignees.length - 2} others`}
              </span>
            </div>
          ) : null}

          {item.type === "calendar_event_added" && item.metadata?.startDate ? (
            <div className="enterprise-activity-event-meta">
              <span className="enterprise-activity-event-date">
                📅{" "}
                {new Date(item.metadata.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {!item.metadata.allDay
                  ? ` · ${new Date(item.metadata.startDate).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}`
                  : ""}
              </span>
              {item.metadata.isVideoMeeting ? (
                <span className="enterprise-activity-event-video">🎥 Video</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="enterprise-activity-standard-reactions">
        <ReactionRow
          activityId={item.id}
          reactions={item.reactions ?? {}}
          currentUserId={currentUserId}
          onToggleReaction={(em) => void onToggleReaction(em)}
          showPicker={showPicker}
          onClosePicker={onClosePicker}
        />
      </div>
    </article>
  );
}

export function ActivityFeedItem({
  item,
  currentUserId,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onToggleReaction,
}: {
  item: ApiActivityItem;
  currentUserId: string | undefined;
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onToggleReaction: (emoji: string) => Promise<void>;
}) {
  if (item.type === "task_milestone") {
    return (
      <CelebrationMilestoneCard
        item={item}
        currentUserId={currentUserId}
        showPicker={showPicker}
        onOpenPicker={onOpenPicker}
        onClosePicker={onClosePicker}
        onToggleReaction={onToggleReaction}
      />
    );
  }
  if (item.type === "personal_best") {
    return (
      <PersonalBestCard
        item={item}
        currentUserId={currentUserId}
        showPicker={showPicker}
        onOpenPicker={onOpenPicker}
        onClosePicker={onClosePicker}
        onToggleReaction={onToggleReaction}
      />
    );
  }
  if (item.type === "celebration") {
    return (
      <CelebrationPostCard
        item={item}
        currentUserId={currentUserId}
        showPicker={showPicker}
        onOpenPicker={onOpenPicker}
        onClosePicker={onClosePicker}
        onToggleReaction={onToggleReaction}
      />
    );
  }
  return (
    <StandardActivityItem
      item={item}
      currentUserId={currentUserId}
      showPicker={showPicker}
      onOpenPicker={onOpenPicker}
      onClosePicker={onClosePicker}
      onToggleReaction={onToggleReaction}
    />
  );
}
