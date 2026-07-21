import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteActivityCelebration,
  fetchTeamRecognitions,
  fetchWebTeam,
  postActivityCelebrate,
  type RecognitionItem,
  type RecognitionRange,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import {
  RECOGNITION_TYPES,
  formatPctChange,
  formatRecognitionDate,
  recognitionTypeMeta,
  type RecognitionTypeKey,
} from "../lib/recognition-types";
import { EnterprisePageLoading } from "./EnterprisePageLoading";
import { UserAvatar } from "./UserAvatar";

type TabId = "feed" | "recognize" | "leaderboard";

type Props = {
  teamId: string;
  currentUserId: string | undefined;
  memberUserId: string;
  isSelf: boolean;
  canDelete: boolean;
  ownerEmail?: string | null;
};

function initials(name: string | null | undefined): string {
  const parts = (name ?? "?").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function DonutChart({
  slices,
}: {
  slices: Array<{ key: string; label: string; count: number; color: string }>;
}) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return (
      <div className="enterprise-recognition-donut enterprise-recognition-donut--empty" aria-hidden>
        <span>0</span>
      </div>
    );
  }
  let offset = 0;
  const gradientParts = slices
    .filter((s) => s.count > 0)
    .map((s) => {
      const start = offset;
      const pct = (s.count / total) * 100;
      offset += pct;
      return `${s.color} ${start}% ${offset}%`;
    });

  return (
    <div
      className="enterprise-recognition-donut"
      style={{ background: `conic-gradient(${gradientParts.join(", ")})` }}
      aria-label={`Recognition breakdown totaling ${total}`}
    >
      <span>{total}</span>
    </div>
  );
}

function FeedCard({
  item,
  currentUserId,
  canDelete,
  onDelete,
}: {
  item: RecognitionItem;
  currentUserId: string | undefined;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const type = recognitionTypeMeta(item.celebrationType);
  const targetName = item.target.name ?? "Someone";
  const giverIsSelf = item.giver?.id === currentUserId;
  const giverLabel = giverIsSelf ? "you" : item.giver?.name ?? "someone";
  const showDelete = canDelete || item.giver?.id === currentUserId;

  return (
    <article className="enterprise-recognition-feed-card" data-testid={`recognition-item-${item.id}`}>
      <div className="enterprise-recognition-feed-card-top">
        <div className="enterprise-recognition-feed-avatar" aria-hidden>
          {item.target.image ? (
            <img src={item.target.image} alt="" />
          ) : (
            <span>{initials(targetName)}</span>
          )}
        </div>
        <div className="enterprise-recognition-feed-copy">
          <p className="enterprise-recognition-feed-headline">
            <strong>{targetName}</strong> was recognized by <strong>{giverLabel}</strong>
          </p>
          <div className="enterprise-recognition-feed-meta">
            <span>{formatRecognitionDate(item.createdAt)}</span>
            <span className="enterprise-recognition-public">
              <span aria-hidden>🌐</span> Public
            </span>
            {showDelete ? (
              <button
                type="button"
                className="enterprise-recognition-more"
                aria-label="Delete recognition"
                title="Delete recognition"
                onClick={() => {
                  if (window.confirm("Delete this recognition?")) onDelete(item.id);
                }}
              >
                ···
              </button>
            ) : null}
          </div>
          <span
            className="enterprise-recognition-type-chip"
            style={{ background: type.bg, color: type.color }}
          >
            <span aria-hidden>{type.icon}</span> {type.label}
          </span>
          {item.message ? <p className="enterprise-recognition-feed-message">{item.message}</p> : null}
        </div>
      </div>
    </article>
  );
}

export function RecognitionTab({
  teamId,
  currentUserId,
  memberUserId,
  isSelf,
  canDelete,
  ownerEmail: _ownerEmail,
}: Props) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("feed");
  const [range, setRange] = useState<RecognitionRange>("month");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [extraItems, setExtraItems] = useState<RecognitionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [targetId, setTargetId] = useState<string>("");
  const [celebrateType, setCelebrateType] = useState<RecognitionTypeKey>(RECOGNITION_TYPES[0]!.key);
  const [message, setMessage] = useState("");
  const [composeErr, setComposeErr] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: queryKeys.recognitions(teamId, range, typeFilter),
    queryFn: () => fetchTeamRecognitions(teamId, { range, type: typeFilter, limit: 20 }),
  });

  const teamQuery = useQuery({
    queryKey: queryKeys.teamDetail(teamId),
    queryFn: () => fetchWebTeam(teamId),
  });

  useEffect(() => {
    setExtraItems([]);
    setNextCursor(summaryQuery.data?.nextCursor ?? null);
  }, [summaryQuery.data?.nextCursor, range, typeFilter, teamId]);

  useEffect(() => {
    if (tab !== "recognize") return;
    if (!isSelf && memberUserId) {
      setTargetId(memberUserId);
    }
  }, [tab, isSelf, memberUserId]);

  const members = useMemo(
    () => (teamQuery.data?.members ?? []).filter((m) => m.userId !== currentUserId),
    [teamQuery.data?.members, currentUserId],
  );

  const items = useMemo(() => {
    const base = summaryQuery.data?.items ?? [];
    const seen = new Set(base.map((i) => i.id));
    return [...base, ...extraItems.filter((i) => !seen.has(i.id))];
  }, [summaryQuery.data?.items, extraItems]);

  const kpis = summaryQuery.data?.kpis;
  const breakdown = summaryQuery.data?.breakdown ?? [];
  const topRecognizers = summaryQuery.data?.topRecognizers ?? [];

  const donutSlices = useMemo(() => {
    return breakdown
      .filter((b) => b.key !== "other" || b.count > 0)
      .map((b) => {
        const meta = recognitionTypeMeta(b.key);
        return { key: b.key, label: meta.label, count: b.count, color: meta.color };
      });
  }, [breakdown]);

  const primaryBreakdown = useMemo(
    () => breakdown.filter((b) => b.key !== "other"),
    [breakdown],
  );
  const breakdownTotal = primaryBreakdown.reduce((sum, b) => sum + b.count, 0);

  const celebrateMutation = useMutation({
    mutationFn: () =>
      postActivityCelebrate(teamId, {
        targetUserId: targetId,
        celebrationType: celebrateType,
        message: message.trim(),
      }),
    onSuccess: async () => {
      setMessage("");
      setComposeErr(null);
      setTab("feed");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recognitions", teamId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activityAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(teamId) }),
      ]);
    },
    onError: (e) => {
      setComposeErr(e instanceof Error ? e.message : "Could not send recognition.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (activityId: string) => deleteActivityCelebration(teamId, activityId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["recognitions", teamId] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activityAll }),
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(teamId) }),
      ]);
    },
  });

  const loadMore = async () => {
    const cursor = nextCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchTeamRecognitions(teamId, {
        range,
        type: typeFilter,
        limit: 20,
        cursor,
      });
      setExtraItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  if (summaryQuery.isLoading) {
    return <EnterprisePageLoading label="Loading recognition" />;
  }

  if (summaryQuery.isError) {
    return (
      <div className="enterprise-recognition-page">
        <p className="auth-error">
          {summaryQuery.error instanceof Error
            ? summaryQuery.error.message
            : "Could not load recognition."}
        </p>
      </div>
    );
  }

  const givenChange = formatPctChange(kpis?.recognitionsGivenChangePct);
  const totalChange = formatPctChange(kpis?.totalChangePct);

  return (
    <div className="enterprise-recognition-page" data-testid="recognition-tab">
      <div className="enterprise-recognition-kpis">
        <div className="enterprise-recognition-kpi">
          <p className="enterprise-recognition-kpi-label">Recognitions given</p>
          <p className="enterprise-recognition-kpi-value">{kpis?.recognitionsGivenThisMonth ?? 0}</p>
          <p className="enterprise-recognition-kpi-meta">This month</p>
          {givenChange ? (
            <p
              className={`enterprise-recognition-kpi-trend${
                (kpis?.recognitionsGivenChangePct ?? 0) >= 0 ? " is-up" : " is-down"
              }`}
            >
              {givenChange} vs last month
            </p>
          ) : null}
        </div>
        <div className="enterprise-recognition-kpi">
          <p className="enterprise-recognition-kpi-label">Team members recognized</p>
          <p className="enterprise-recognition-kpi-value">
            {kpis?.teamMembersRecognizedThisMonth ?? 0}
          </p>
          <p className="enterprise-recognition-kpi-meta">This month</p>
        </div>
        <div className="enterprise-recognition-kpi">
          <p className="enterprise-recognition-kpi-label">Total recognitions</p>
          <p className="enterprise-recognition-kpi-value">{kpis?.totalLast30Days ?? 0}</p>
          <p className="enterprise-recognition-kpi-meta">Last 30 days</p>
          {totalChange ? (
            <p
              className={`enterprise-recognition-kpi-trend${
                (kpis?.totalChangePct ?? 0) >= 0 ? " is-up" : " is-down"
              }`}
            >
              {totalChange} vs prior 30 days
            </p>
          ) : null}
        </div>
        <div className="enterprise-recognition-kpi">
          <p className="enterprise-recognition-kpi-label">Top recognizer</p>
          <p className="enterprise-recognition-kpi-value">{kpis?.topRecognizer?.count ?? 0}</p>
          <p className="enterprise-recognition-kpi-meta">
            {kpis?.topRecognizer
              ? kpis.topRecognizer.isCurrentUser
                ? "You"
                : kpis.topRecognizer.name ?? "Member"
              : "—"}
          </p>
          <p className="enterprise-recognition-kpi-hint">Most this month</p>
        </div>
      </div>

      <div className="enterprise-recognition-layout">
        <div className="enterprise-recognition-main">
          <div className="enterprise-recognition-tabs-row">
            <div className="enterprise-recognition-tabs" role="tablist" aria-label="Recognition views">
              {(
                [
                  ["feed", "Feed"],
                  ["leaderboard", "Leaderboard"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  className={`enterprise-recognition-tab${tab === id ? " is-active" : ""}`}
                  onClick={() => setTab(id)}
                  data-testid={`recognition-tab-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`enterprise-recognition-give-btn${tab === "recognize" ? " is-active" : ""}`}
              onClick={() => setTab("recognize")}
              data-testid="recognition-tab-recognize"
            >
              Recognize someone
            </button>
          </div>

          {tab === "feed" ? (
            <>
              <div className="enterprise-recognition-filters">
                <label>
                  <span className="sr-only">Filter by type</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    aria-label="Filter by recognition type"
                  >
                    <option value="all">All types</option>
                    {RECOGNITION_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  <span className="sr-only">Filter by time</span>
                  <select
                    value={range}
                    onChange={(e) => setRange(e.target.value as RecognitionRange)}
                    aria-label="Filter by time range"
                  >
                    <option value="month">This month</option>
                    <option value="30d">Last 30 days</option>
                    <option value="all">All time</option>
                  </select>
                </label>
              </div>

              <div className="enterprise-recognition-feed">
                {items.length === 0 ? (
                  <div className="enterprise-recognition-empty">
                    <h3>No recognitions yet</h3>
                    <p>Recognize a teammate to see activity here.</p>
                    <button type="button" className="enterprise-recognition-empty-cta" onClick={() => setTab("recognize")}>
                      Recognize someone
                    </button>
                  </div>
                ) : (
                  items.map((item) => (
                    <FeedCard
                      key={item.id}
                      item={item}
                      currentUserId={currentUserId}
                      canDelete={canDelete}
                      onDelete={(id) => deleteMutation.mutate(id)}
                    />
                  ))
                )}
              </div>

              {nextCursor ? (
                <button
                  type="button"
                  className="enterprise-recognition-load-more"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : null}

              {items.length > 0 ? (
                <div className="enterprise-recognition-main-actions">
                  <button
                    type="button"
                    className="enterprise-checkins-new-btn"
                    onClick={() => setTab("recognize")}
                  >
                    + Recognition
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "recognize" ? (
            <div className="enterprise-recognition-compose" data-testid="recognition-compose">
              <h3 className="enterprise-recognition-compose-title">Recognize someone</h3>
              <p className="enterprise-recognition-compose-sub">
                Recognition posts to Activity and shows up in this feed.
              </p>

              <label className="enterprise-recognition-compose-label">
                Teammate
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  aria-label="Select teammate to recognize"
                >
                  <option value="">Select a teammate</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name ?? m.user.email ?? "Member"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="enterprise-recognition-compose-types" role="listbox" aria-label="Recognition type">
                {RECOGNITION_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="option"
                    aria-selected={celebrateType === t.key}
                    className={`enterprise-recognition-compose-type${
                      celebrateType === t.key ? " is-selected" : ""
                    }`}
                    style={{ borderColor: celebrateType === t.key ? t.color : undefined }}
                    onClick={() => setCelebrateType(t.key)}
                  >
                    <span aria-hidden>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              <label className="enterprise-recognition-compose-label">
                Message
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 300))}
                  rows={4}
                  placeholder="Share why this recognition matters…"
                  maxLength={300}
                />
              </label>
              <p className="enterprise-recognition-compose-count">{message.trim().length}/300</p>

              {composeErr ? <p className="auth-error">{composeErr}</p> : null}

              <button
                type="button"
                className="enterprise-recognition-compose-submit"
                disabled={!targetId || !message.trim() || celebrateMutation.isPending}
                onClick={() => celebrateMutation.mutate()}
                data-testid="recognition-submit"
              >
                {celebrateMutation.isPending ? "Sending…" : "Send recognition"}
              </button>
            </div>
          ) : null}

          {tab === "leaderboard" ? (
            <div className="enterprise-recognition-leaderboard-full">
              <h3 className="enterprise-recognition-compose-title">Leaderboard</h3>
              <p className="enterprise-recognition-compose-sub">Top recognizers for the selected period.</p>
              {topRecognizers.length === 0 ? (
                <p className="enterprise-muted">No recognitions in this period yet.</p>
              ) : (
                <ol className="enterprise-recognition-leader-list">
                  {topRecognizers.map((row) => (
                    <li key={row.userId} className="enterprise-recognition-leader-row">
                      <span className="enterprise-recognition-leader-rank">{row.rank}</span>
                      <UserAvatar
                        user={{ name: row.name, image: row.image }}
                        className="enterprise-recognition-leader-avatar"
                        alt={row.name ?? "Member"}
                      />
                      <span className="enterprise-recognition-leader-name">
                        {row.isCurrentUser ? "You" : row.name ?? "Member"}
                      </span>
                      <span className="enterprise-recognition-leader-count">★ {row.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </div>

        <aside className="enterprise-recognition-rail" aria-label="Recognition analytics">
          <section className="enterprise-recognition-rail-card">
            <h3 className="enterprise-recognition-rail-title">Recognition breakdown</h3>
            <div className="enterprise-recognition-breakdown">
              <DonutChart slices={donutSlices.filter((s) => s.key !== "other" || s.count > 0)} />
              <ul className="enterprise-recognition-legend">
                {primaryBreakdown.map((b) => {
                  const meta = recognitionTypeMeta(b.key);
                  const pct = breakdownTotal > 0 ? Math.round((b.count / breakdownTotal) * 100) : 0;
                  return (
                    <li key={b.key}>
                      <span className="enterprise-recognition-legend-dot" style={{ background: meta.color }} />
                      <span className="enterprise-recognition-legend-label">{meta.label}</span>
                      <span className="enterprise-recognition-legend-count">
                        {b.count} · {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="enterprise-recognition-rail-card">
            <h3 className="enterprise-recognition-rail-title">Top recognizers</h3>
            <p className="enterprise-recognition-rail-sub">This month</p>
            {topRecognizers.length === 0 ? (
              <p className="enterprise-muted">No data yet</p>
            ) : (
              <ol className="enterprise-recognition-leader-list">
                {topRecognizers.slice(0, 5).map((row) => (
                  <li key={row.userId} className="enterprise-recognition-leader-row">
                    <span className="enterprise-recognition-leader-rank">{row.rank}</span>
                    <UserAvatar
                      user={{ name: row.name, image: row.image }}
                      className="enterprise-recognition-leader-avatar"
                      alt={row.name ?? "Member"}
                    />
                    <span className="enterprise-recognition-leader-name">
                      {row.isCurrentUser ? "You" : row.name ?? "Member"}
                    </span>
                    <span className="enterprise-recognition-leader-count">★ {row.count}</span>
                  </li>
                ))}
              </ol>
            )}
            <button
              type="button"
              className="enterprise-recognition-view-leaderboard"
              onClick={() => setTab("leaderboard")}
            >
              View full leaderboard
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
