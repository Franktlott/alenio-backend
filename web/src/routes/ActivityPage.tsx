import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import {
  fetchTeamActivity,
  fetchWebMe,
  fetchWebTeam,
  fetchWebTeams,
  postActivityCelebrate,
  postActivityReaction,
  type ActivityReactionBucket,
  type ApiActivityItem,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";

const REACTION_HINT_KEY = "alenio_activity_reaction_hint";
const EMOJI_OPTIONS = ["😊", "❤️", "😂", "😮", "🔥", "🎉"];

const CELEBRATION_TYPES = [
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
        : `${e.user?.name ?? "Someone"} completed an incognito task 🕵️`,
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
            <img src="/alenio-logo.png" alt="" className="enterprise-activity-milestone-logo" width={28} height={28} />
          </div>
          <div className="enterprise-activity-milestone-foot">
            <div className="enterprise-activity-milestone-user">
              {item.user?.image ? (
                <img src={item.user.image} alt="" className="enterprise-activity-milestone-av" />
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
      <img src="/alenio-logo-white.png" alt="" className="enterprise-activity-pb-watermark" width={28} height={28} />
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
              <img src={item.user.image} alt="" className="enterprise-activity-pb-av" />
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
              <img src={meta.targetUserImage} alt="" />
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
            <img src={item.user.image} alt="" className="enterprise-activity-avatar" />
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
                    {a.image ? <img src={a.image} alt="" /> : (a.name[0] ?? "?").toUpperCase()}
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

function ActivityFeedItem({
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

export function ActivityPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [items, setItems] = useState<ApiActivityItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [showReactionHint, setShowReactionHint] = useState(false);
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTarget, setCelebrateTarget] = useState<{ id: string; name: string; image: string | null } | null>(
    null,
  );
  const [celebrateType, setCelebrateType] = useState<string>(CELEBRATION_TYPES[0]!.key);
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const [celebrateSaving, setCelebrateSaving] = useState(false);
  const [celebrateErr, setCelebrateErr] = useState<string | null>(null);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<{ userId: string; user: { id: string; name: string; image: string | null } }[]>(
    [],
  );

  const loadActivity = useCallback(async () => {
    if (!selectedTeamId) return;
    setLoading(true);
    try {
      const data = await fetchTeamActivity(selectedTeamId);
      setItems(Array.isArray(data) ? data : []);
      setListErr(null);
    } catch (e) {
      setItems([]);
      setListErr(e instanceof Error ? e.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Could not load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teams?.length) return;
    setSelectedTeamId((prev) => {
      if (prev && teams.some((t) => t.id === prev)) return prev;
      return teams[0]!.id;
    });
  }, [teams]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    const id = window.setInterval(() => void loadActivity(), 15000);
    return () => window.clearInterval(id);
  }, [loadActivity]);

  useEffect(() => {
    if (sessionStorage.getItem(REACTION_HINT_KEY) !== "1") setShowReactionHint(true);
  }, []);

  useEffect(() => {
    if (!showReactionHint) return;
    const t = window.setTimeout(() => {
      setShowReactionHint(false);
      sessionStorage.setItem(REACTION_HINT_KEY, "1");
    }, 4000);
    return () => window.clearTimeout(t);
  }, [showReactionHint]);

  useEffect(() => {
    if (!openPickerId) return;
    const t = window.setTimeout(() => setOpenPickerId(null), 10000);
    return () => window.clearTimeout(t);
  }, [openPickerId]);

  useEffect(() => {
    if (!celebrateOpen || !selectedTeamId) return;
    let cancelled = false;
    setTeamMembersLoading(true);
    setCelebrateErr(null);
    (async () => {
      try {
        const team = await fetchWebTeam(selectedTeamId);
        if (cancelled) return;
        const rows =
          team.members?.map((m) => ({
            userId: m.userId,
            user: {
              id: m.user.id,
              name: m.user.name ?? m.user.email ?? "Member",
              image: m.user.image,
            },
          })) ?? [];
        setTeamMembers(rows.filter((r) => r.user.id !== me?.id));
      } catch (e) {
        if (!cancelled) setCelebrateErr(e instanceof Error ? e.message : "Could not load teammates.");
      } finally {
        if (!cancelled) setTeamMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [celebrateOpen, selectedTeamId, me?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCelebrateOpen(false);
        setOpenPickerId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleReaction = useCallback(
    async (activityId: string, emoji: string) => {
      if (!selectedTeamId) return;
      try {
        await postActivityReaction(selectedTeamId, activityId, emoji);
        await loadActivity();
      } catch {
        setListErr("Could not update reaction.");
      }
    },
    [selectedTeamId, loadActivity],
  );

  const onCelebrateSubmit = async () => {
    if (!selectedTeamId || !celebrateTarget) return;
    const msg = celebrateMessage.trim();
    if (!msg) return;
    setCelebrateSaving(true);
    setCelebrateErr(null);
    try {
      await postActivityCelebrate(selectedTeamId, {
        targetUserId: celebrateTarget.id,
        celebrationType: celebrateType,
        message: msg,
      });
      setCelebrateOpen(false);
      setCelebrateStep(1);
      setCelebrateTarget(null);
      setCelebrateType(CELEBRATION_TYPES[0]!.key);
      setCelebrateMessage("");
      await loadActivity();
    } catch (e) {
      setCelebrateErr(e instanceof Error ? e.message : "Could not post celebration.");
    } finally {
      setCelebrateSaving(false);
    }
  };

  const hintLine = useMemo(
    () => (
      <p className="enterprise-activity-hint">
        Long-press an activity to react · Double-click a reaction pill to toggle yours.
      </p>
    ),
    [],
  );

  if (err) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-dashboard-inner">
          <p className="auth-error">{err}</p>
        </main>
      </div>
    );
  }

  if (me === undefined && !err) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-dashboard-inner">
          <p className="enterprise-muted">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <EnterpriseLayout
      activeNav="activity"
      teams={teams ?? []}
      selectedTeamId={selectedTeamId}
      onTeamChange={setSelectedTeamId}
      user={me ?? null}
      onSignOutNavigate={(path) => navigate(path)}
      topBar={<DashboardTopBar user={me ?? null} />}
    >
      <div className="enterprise-dashboard-inner enterprise-activity-page" data-testid="activity-screen">
        <header className="enterprise-activity-header">
          <div className="enterprise-activity-header-inner">
            <div className="enterprise-activity-header-titles">
              <h1 className="enterprise-activity-h1">Activity</h1>
              <p className="enterprise-activity-sub">Team wins, celebrations, and updates from the last 7 days.</p>
            </div>
            <div className="enterprise-activity-header-actions">
              <img src="/alenio-logo-white.png" alt="Alenio" className="enterprise-activity-header-logo" />
              <button type="button" className="enterprise-activity-celebrate-btn" onClick={() => setCelebrateOpen(true)} data-testid="celebrate-button">
                <span aria-hidden>🎉</span> Celebrate
              </button>
            </div>
          </div>
        </header>

        <section className="enterprise-card enterprise-activity-card">
          {listErr ? <p className="enterprise-banner-warn">{listErr}</p> : null}

          {loading && items.length === 0 ? (
            <p className="enterprise-muted">Loading activity…</p>
          ) : items.length === 0 && !listErr ? (
            <div className="enterprise-activity-empty">
              <span className="enterprise-activity-empty-icon" aria-hidden>
                ◎
              </span>
              <h2 className="enterprise-activity-empty-title">No activity yet</h2>
              <p className="enterprise-activity-empty-copy">
                Completed tasks, new members, calendar events, and celebrations will show up here.
              </p>
            </div>
          ) : (
            <div className="enterprise-activity-feed">
              {items.map((item, index) => (
                <div key={item.id} className="enterprise-activity-feed-item-wrap">
                  <ActivityFeedItem
                    item={item}
                    currentUserId={me?.id}
                    showPicker={openPickerId === item.id}
                    onOpenPicker={() => setOpenPickerId(item.id)}
                    onClosePicker={() => setOpenPickerId(null)}
                    onToggleReaction={(emoji) => toggleReaction(item.id, emoji)}
                  />
                  {index === 0 && showReactionHint ? hintLine : null}
                  {index < items.length - 1 && item.type !== "task_milestone" ? (
                    <hr className="enterprise-activity-sep" />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {celebrateOpen ? (
        <div
          className="enterprise-activity-modal-backdrop"
          role="presentation"
          onClick={() => {
            setCelebrateOpen(false);
            setCelebrateStep(1);
          }}
        >
          <div className="enterprise-activity-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-activity-modal-head">
              <button
                type="button"
                className="enterprise-activity-modal-back"
                onClick={() => (celebrateStep === 2 ? setCelebrateStep(1) : setCelebrateOpen(false))}
              >
                {celebrateStep === 2 ? "← Back" : "Cancel"}
              </button>
              <h2 className="enterprise-activity-modal-title">
                {celebrateStep === 1 ? "Who to celebrate? 🎉" : `Celebrate ${celebrateTarget?.name ?? ""}`}
              </h2>
              <button type="button" className="enterprise-activity-modal-x" onClick={() => setCelebrateOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            {celebrateErr ? <p className="auth-error enterprise-activity-modal-err">{celebrateErr}</p> : null}
            {celebrateStep === 1 ? (
              <div className="enterprise-activity-modal-body">
                {teamMembersLoading ? (
                  <p className="enterprise-muted">Loading teammates…</p>
                ) : teamMembers.length === 0 ? (
                  <div className="enterprise-activity-celebrate-empty">
                    <span className="enterprise-activity-celebrate-empty-emoji">🎉</span>
                    <p className="enterprise-activity-celebrate-empty-title">No teammates to celebrate yet</p>
                    <p className="enterprise-muted">Invite more people to this workspace, then come back to post a celebration.</p>
                  </div>
                ) : (
                  <ul className="enterprise-activity-member-list">
                    {teamMembers.map((m) => (
                      <li key={m.userId}>
                        <button
                          type="button"
                          className="enterprise-activity-member-row"
                          data-testid={`celebrate-member-${m.userId}`}
                          onClick={() => {
                            setCelebrateTarget(m.user);
                            setCelebrateStep(2);
                          }}
                        >
                          {m.user.image ? (
                            <img src={m.user.image} alt="" className="enterprise-activity-member-av" />
                          ) : (
                            <span className="enterprise-activity-member-av-ph">{(m.user.name[0] ?? "?").toUpperCase()}</span>
                          )}
                          <span className="enterprise-activity-member-name">{m.user.name}</span>
                          <span className="enterprise-activity-member-chev">→</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="enterprise-activity-modal-body enterprise-activity-modal-compose">
                <p className="enterprise-activity-compose-label">Choose a celebration</p>
                <div className="enterprise-activity-type-grid">
                  {CELEBRATION_TYPES.map((ct) => {
                    const on = celebrateType === ct.key;
                    return (
                      <button
                        key={ct.key}
                        type="button"
                        data-testid={`celebrate-type-${ct.key}`}
                        className={`enterprise-activity-type-chip ${on ? "enterprise-activity-type-chip-on" : ""}`}
                        style={
                          on
                            ? { background: ct.color, borderColor: ct.color, color: "#fff" }
                            : { borderColor: "transparent" }
                        }
                        onClick={() => setCelebrateType(ct.key)}
                      >
                        <span>{ct.icon}</span> {ct.label}
                      </button>
                    );
                  })}
                </div>
                <label className="enterprise-activity-compose-label">
                  Message <span className="enterprise-activity-required">*</span>
                </label>
                <textarea
                  className="enterprise-activity-compose-input"
                  rows={4}
                  maxLength={300}
                  data-testid="celebrate-message-input"
                  value={celebrateMessage}
                  onChange={(e) => setCelebrateMessage(e.target.value)}
                  placeholder={`Say something nice about ${celebrateTarget?.name ?? "them"}…`}
                />
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary enterprise-activity-post-btn"
                  data-testid="celebrate-submit"
                  disabled={celebrateSaving || !celebrateMessage.trim()}
                  onClick={() => void onCelebrateSubmit()}
                >
                  {celebrateSaving ? "Posting…" : "🎉 Post celebration"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </EnterpriseLayout>
  );
}
