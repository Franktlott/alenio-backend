import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAllActivity,
  fetchWebTeam,
  postActivityCelebrate,
  postActivityReaction,
  type ApiActivityItem,
} from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { ActivityFeedItem, CELEBRATION_TYPES } from "./ActivityFeedPrimitives";

const REACTION_HINT_KEY = "alenio_activity_reaction_hint";

type WorkspaceOption = { id: string; name: string };

type Props = {
  teams: WorkspaceOption[];
  currentUserId?: string;
};

export function TeamActivityPanel({ teams, currentUserId }: Props) {
  const queryClient = useQueryClient();
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [showReactionHint, setShowReactionHint] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<1 | 2>(1);
  const [celebrateTeamId, setCelebrateTeamId] = useState<string>("");
  const [celebrateTarget, setCelebrateTarget] = useState<{ id: string; name: string; image: string | null } | null>(
    null,
  );
  const [celebrateType, setCelebrateType] = useState<string>(CELEBRATION_TYPES[0]!.key);
  const [celebrateMessage, setCelebrateMessage] = useState("");
  const [celebrateSaving, setCelebrateSaving] = useState(false);
  const [celebrateErr, setCelebrateErr] = useState<string | null>(null);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<
    { userId: string; user: { id: string; name: string; image: string | null } }[]
  >([]);

  const activityQuery = useQuery({
    queryKey: queryKeys.activityAll,
    queryFn: async () => fetchAllActivity(teams),
    enabled: teams.length > 0,
    refetchOnMount: false,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const allItems = activityQuery.data ?? [];
  const items = useMemo(() => {
    if (workspaceFilter === "all") return allItems;
    return allItems.filter((item) => item.teamId === workspaceFilter);
  }, [allItems, workspaceFilter]);

  const showWorkspaceLabels = workspaceFilter === "all" && teams.length > 1;

  const queryErr =
    activityQuery.error instanceof Error
      ? activityQuery.error.message
      : activityQuery.isError
        ? "Could not load activity."
        : null;
  const displayErr = listErr ?? queryErr;
  const showInitialLoading = activityQuery.isPending && allItems.length === 0;

  const refreshActivity = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.activityAll }),
      queryClient.invalidateQueries({ queryKey: ["recognitions"] }),
    ]);
  }, [queryClient]);

  const resolveCelebrateTeamId = useCallback(() => {
    if (workspaceFilter !== "all") return workspaceFilter;
    return teams[0]?.id ?? "";
  }, [workspaceFilter, teams]);

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
    if (!celebrateOpen || !celebrateTeamId) return;
    let cancelled = false;
    setTeamMembersLoading(true);
    setCelebrateErr(null);
    void (async () => {
      try {
        const team = await fetchWebTeam(celebrateTeamId);
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
        setTeamMembers(rows.filter((r) => r.user.id !== currentUserId));
      } catch (e) {
        if (!cancelled) setCelebrateErr(e instanceof Error ? e.message : "Could not load teammates.");
      } finally {
        if (!cancelled) setTeamMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [celebrateOpen, celebrateTeamId, currentUserId]);

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
    async (item: ApiActivityItem, emoji: string) => {
      const teamId = item.teamId;
      if (!teamId) return;
      try {
        await postActivityReaction(teamId, item.id, emoji);
        await refreshActivity();
        setListErr(null);
      } catch {
        setListErr("Could not update reaction.");
      }
    },
    [refreshActivity],
  );

  const openCelebrate = () => {
    setCelebrateTeamId(resolveCelebrateTeamId());
    setCelebrateStep(1);
    setCelebrateTarget(null);
    setCelebrateType(CELEBRATION_TYPES[0]!.key);
    setCelebrateMessage("");
    setCelebrateErr(null);
    setCelebrateOpen(true);
  };

  const onCelebrateSubmit = async () => {
    if (!celebrateTeamId || !celebrateTarget) return;
    const msg = celebrateMessage.trim();
    if (!msg) return;
    setCelebrateSaving(true);
    setCelebrateErr(null);
    try {
      await postActivityCelebrate(celebrateTeamId, {
        targetUserId: celebrateTarget.id,
        celebrationType: celebrateType,
        message: msg,
      });
      setCelebrateOpen(false);
      setCelebrateStep(1);
      setCelebrateTarget(null);
      setCelebrateType(CELEBRATION_TYPES[0]!.key);
      setCelebrateMessage("");
      await refreshActivity();
    } catch (e) {
      setCelebrateErr(e instanceof Error ? e.message : "Could not post celebration.");
    } finally {
      setCelebrateSaving(false);
    }
  };

  const hintLine = useMemo(
    () => (
      <p className="enterprise-activity-hint chat-activity-rail__hint">
        Long-press an activity to react · Double-click a reaction pill to toggle yours.
      </p>
    ),
    [],
  );

  if (teams.length === 0) return null;

  return (
    <>
      <aside className="chat-activity-rail" aria-label="Activity" data-testid="chat-activity-rail">
        <div className="chat-activity-rail__head">
          <div className="chat-activity-rail__head-copy">
            <h2 className="chat-activity-rail__title">Activity</h2>
            <p className="chat-activity-rail__sub">Team wins and updates</p>
            {teams.length > 1 ? (
              <label className="chat-activity-rail__filter">
                <span className="sr-only">Filter by workspace</span>
                <select
                  value={workspaceFilter}
                  onChange={(e) => setWorkspaceFilter(e.target.value)}
                  aria-label="Filter activity by workspace"
                  data-testid="activity-workspace-filter"
                >
                  <option value="all">All workspaces</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="button"
            className="chat-activity-rail__celebrate"
            onClick={openCelebrate}
            data-testid="celebrate-button"
          >
            <span aria-hidden>🎉</span>
            <span className="chat-activity-rail__celebrate-label">Celebrate</span>
          </button>
        </div>

        <div className="chat-activity-rail__body">
          {displayErr ? <p className="enterprise-banner-warn chat-activity-rail__banner">{displayErr}</p> : null}

          {showInitialLoading ? (
            <p className="enterprise-muted chat-activity-rail__empty">Loading activity…</p>
          ) : items.length === 0 && !displayErr ? (
            <div className="enterprise-activity-empty chat-activity-rail__empty-state">
              <span className="enterprise-activity-empty-icon" aria-hidden>
                ◎
              </span>
              <h3 className="enterprise-activity-empty-title">No activity yet</h3>
              <p className="enterprise-activity-empty-copy">
                Completed tasks, celebrations, and team updates will show up here.
              </p>
            </div>
          ) : (
            <div className="enterprise-activity-feed chat-activity-rail__feed">
              {items.map((item, index) => (
                <div key={item.id} className="enterprise-activity-feed-item-wrap">
                  {showWorkspaceLabels && item.team?.name ? (
                    <span className="chat-activity-rail__workspace-chip">{item.team.name}</span>
                  ) : null}
                  <ActivityFeedItem
                    item={item}
                    currentUserId={currentUserId}
                    showPicker={openPickerId === item.id}
                    onOpenPicker={() => setOpenPickerId(item.id)}
                    onClosePicker={() => setOpenPickerId(null)}
                    onToggleReaction={(emoji) => toggleReaction(item, emoji)}
                  />
                  {index === 0 && showReactionHint ? hintLine : null}
                  {index < items.length - 1 && item.type !== "task_milestone" ? (
                    <hr className="enterprise-activity-sep chat-activity-rail__sep" />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

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
                {teams.length > 1 ? (
                  <label className="enterprise-activity-compose-label">
                    Workspace
                    <select
                      className="enterprise-activity-celebrate-team-select"
                      value={celebrateTeamId}
                      onChange={(e) => {
                        setCelebrateTeamId(e.target.value);
                        setCelebrateTarget(null);
                      }}
                      aria-label="Workspace for celebration"
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                            <img src={m.user.image} alt={m.user.name} className="enterprise-activity-member-av" />
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
    </>
  );
}
