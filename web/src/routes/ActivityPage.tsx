import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  fetchTeamActivity,
  fetchWebTeam,
  postActivityCelebrate,
  postActivityReaction,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";

import { ActivityFeedItem, CELEBRATION_TYPES } from "../components/activity/ActivityFeedPrimitives";

const REACTION_HINT_KEY = "alenio_activity_reaction_hint";

export function ActivityPage() {
  const queryClient = useQueryClient();
  const { me, teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();
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

  const activityQuery = useQuery({
    queryKey: queryKeys.activity(selectedTeamId),
    queryFn: async () => {
      const data = await fetchTeamActivity(selectedTeamId);
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedTeamId,
    refetchInterval: 15_000,
  });

  const items = activityQuery.data ?? [];
  const listErr =
    activityQuery.error instanceof Error ? activityQuery.error.message : activityQuery.isError ? "Could not load activity." : null;
  const showInitialLoading = activityQuery.isPending && items.length === 0;

  const refreshActivity = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.activity(selectedTeamId) });
  }, [queryClient, selectedTeamId]);

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
        await refreshActivity();
      } catch {
        setListErr("Could not update reaction.");
      }
    },
    [selectedTeamId, refreshActivity],
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
      await refreshActivity();
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

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-tab-shell enterprise-activity-page" data-testid="activity-screen">
        <section className="enterprise-card enterprise-activity-card enterprise-tab-fill-card">
          <div className="enterprise-card-head enterprise-card-head-row">
            <p className="enterprise-muted" style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.45 }}>
              Team wins, celebrations, and updates from the last 7 days.
            </p>
            <div className="enterprise-tab-card-head-actions">
              <button
                type="button"
                className="enterprise-activity-celebrate-btn enterprise-activity-celebrate-btn-inline"
                onClick={() => setCelebrateOpen(true)}
                data-testid="celebrate-button"
              >
                <span aria-hidden>🎉</span> Celebrate
              </button>
            </div>
          </div>

          <div className="enterprise-tab-fill-card-body">
            {listErr ? <p className="enterprise-banner-warn">{listErr}</p> : null}

            {showInitialLoading ? (
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
          </div>
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
