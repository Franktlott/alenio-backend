import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteChecklistLocation,
  fetchChecklistLocations,
  workspaceChecklistHubUrl,
  type ChecklistLocationRow,
} from "../../lib/api";
import {
  checklistCardMeta,
  formatGoDate,
  formatGoTime,
  storeCompletionPercent,
  todaySubmissions,
  userInitials,
} from "../../lib/go-dashboard-utils";
import { queryKeys } from "../../lib/query-keys";

type Props = {
  teamId: string;
  myRole: string;
  teamName?: string;
  teamImage?: string | null;
};

function canManage(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

function IconClipboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const CHECKLIST_MENU_WIDTH = 132;
const CHECKLIST_MENU_HEIGHT = 120;

type MenuCoords = {
  top: number;
  left: number;
  openUp: boolean;
};

export function LocationChecklistsSection({ teamId, myRole, teamName, teamImage }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const manager = canManage(myRole);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [menuChecklistId, setMenuChecklistId] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.checklistLocations(teamId),
    queryFn: () => fetchChecklistLocations(teamId),
    enabled: !!teamId,
    refetchInterval: 8000,
  });

  const planRequired = listQuery.data?.planRequired ?? false;
  const hubToken = listQuery.data?.hubToken ?? null;
  const locations = listQuery.data?.locations ?? [];
  const recentSubmissions = listQuery.data?.recentSubmissions ?? [];
  const activeChecklists = useMemo(() => locations.filter((l) => l.isActive), [locations]);

  const todayActivity = useMemo(() => todaySubmissions(recentSubmissions), [recentSubmissions]);
  const completionPct = storeCompletionPercent(recentSubmissions, activeChecklists.length);
  const completedToday = todayActivity.filter((s) => s.isComplete);
  const needsAttention = todayActivity.filter((s) => !s.isComplete);

  useEffect(() => {
    if (!menuChecklistId) return;
    const close = () => setMenuChecklistId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuChecklistId]);

  const menuChecklist = useMemo(
    () => activeChecklists.find((cl) => cl.id === menuChecklistId) ?? null,
    [activeChecklists, menuChecklistId],
  );
  const menuPreviewUrl =
    menuChecklist && hubToken ? `${workspaceChecklistHubUrl(hubToken)}/${menuChecklist.id}` : null;

  useLayoutEffect(() => {
    if (!menuChecklistId) {
      setMenuCoords(null);
      return;
    }

    const update = () => {
      const anchor = menuAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < CHECKLIST_MENU_HEIGHT && rect.top > CHECKLIST_MENU_HEIGHT;
      setMenuCoords({
        top: openUp ? rect.top - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - CHECKLIST_MENU_WIDTH),
        openUp,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuChecklistId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.checklistLocations(teamId) });
  };

  const onDeactivate = async (checklist: ChecklistLocationRow) => {
    setActionErr(null);
    if (!window.confirm(`Remove "${checklist.name}"?`)) return;
    try {
      await deleteChecklistLocation(teamId, checklist.id);
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not remove checklist.");
    }
  };

  const openBuilder = (checklistId?: string) => {
    const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    if (checklistId) {
      navigate(`/go/checklists/${checklistId}/edit${qs}`);
      return;
    }
    navigate(`/go/checklists/new${qs}`);
  };

  const scrollCarousel = (dir: 1 | -1) => {
    carouselRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  if (listQuery.isLoading) {
    return (
      <div className="go-dashboard">
        <p className="enterprise-muted">Loading Alenio Go…</p>
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="go-dashboard">
        <p className="enterprise-form-error" role="alert">
          {listQuery.error instanceof Error ? listQuery.error.message : "Could not load checklists."}
        </p>
      </div>
    );
  }

  if (planRequired) {
    return (
      <div className="go-dashboard">
        <div className="go-dashboard__upgrade">
          <h2 className="go-dashboard__upgrade-title">Alenio Go checklists</h2>
          <p className="enterprise-muted">Checklists are available on Team and Pro plans.</p>
          <Link to="/billing" className="go-btn go-btn--primary">
            View billing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="go-dashboard" data-testid="go-dashboard">
        {actionErr ? (
          <p className="enterprise-form-error" role="alert">
            {actionErr}
          </p>
        ) : null}

        {manager ? (
          <div className="go-dashboard__hero">
            <div className="go-dashboard__toolbar">
              <button type="button" className="go-btn go-btn--primary" onClick={() => openBuilder()}>
                + Create Checklist
              </button>
            </div>
          </div>
        ) : null}

        <div className="go-dashboard__body">
        <section className="go-dashboard__section go-dashboard__section--checklists" aria-labelledby="go-checklists-heading">
          <div className="go-dashboard__section-head">
            <h2 id="go-checklists-heading" className="go-dashboard__section-title">
              <IconClipboard />
              Checklists
            </h2>
            {activeChecklists.length === 0 ? (
              <span className="go-dashboard__section-meta">{activeChecklists.length} active</span>
            ) : null}
          </div>

          {activeChecklists.length === 0 ? (
            <div className="go-checklist-empty" data-testid="go-checklists-empty">
              <div className="go-checklist-empty__icon" aria-hidden>
                <IconClipboard />
              </div>
              <h3 className="go-checklist-empty__title">No checklists yet</h3>
              <p className="go-checklist-empty__sub">
                {manager
                  ? "Create your first checklist for shift tasks, opening routines, and more."
                  : "Checklists from your manager will show up here."}
              </p>
              {manager ? (
                <button type="button" className="go-btn go-btn--primary go-btn--sm" onClick={() => openBuilder()}>
                  + New checklist
                </button>
              ) : null}
            </div>
          ) : (
            <div className="go-checklist-carousel-wrap">
              <div className="go-checklist-carousel" ref={carouselRef}>
                {activeChecklists.map((cl) => {
                  const meta = checklistCardMeta(cl);
                  const previewUrl = hubToken ? `${workspaceChecklistHubUrl(hubToken)}/${cl.id}` : null;
                  return (
                    <article key={cl.id} className="go-checklist-card">
                      {manager ? (
                        <button
                          type="button"
                          className="go-checklist-card__menu-btn"
                          aria-label={`Actions for ${cl.name}`}
                          aria-expanded={menuChecklistId === cl.id}
                          aria-haspopup="menu"
                          ref={menuChecklistId === cl.id ? menuAnchorRef : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            menuAnchorRef.current = e.currentTarget;
                            setMenuChecklistId((current) => (current === cl.id ? null : cl.id));
                          }}
                        >
                          ⋮
                        </button>
                      ) : null}

                      <div className="go-checklist-card__top">
                        <div className="go-checklist-card__icon" style={{ background: meta.iconBg }} aria-hidden>
                          {meta.icon}
                        </div>
                        <div className="go-checklist-card__info">
                          <h3 className="go-checklist-card__title">{cl.name}</h3>
                          <ul className="go-checklist-card__meta">
                            <li>
                              <span>Area:</span> <span className="go-checklist-card__meta-value">{meta.area}</span>
                            </li>
                            <li>
                              <span>Frequency:</span> <span className="go-checklist-card__meta-value">{meta.frequency}</span>
                            </li>
                            <li>
                              <span>Tasks:</span> <span className="go-checklist-card__meta-value">{cl.items.length}</span>
                            </li>
                            <li>
                              <span>Locations:</span> <span className="go-checklist-card__meta-value">1</span>
                            </li>
                          </ul>
                        </div>
                      </div>

                      <div className="go-checklist-card__divider" aria-hidden />

                      <p className="go-checklist-card__updated">Last updated: {formatGoDate(cl.updatedAt)}</p>

                      <div className="go-checklist-card__actions">
                        {manager ? (
                          <button type="button" className="go-checklist-card__btn go-checklist-card__btn--edit" onClick={() => openBuilder(cl.id)}>
                            Edit
                          </button>
                        ) : null}
                        {previewUrl ? (
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="go-checklist-card__btn go-checklist-card__btn--preview"
                          >
                            <IconEye />
                            Preview
                          </a>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              {activeChecklists.length > 2 ? (
                <button type="button" className="go-checklist-carousel__next" aria-label="Next checklists" onClick={() => scrollCarousel(1)}>
                  ›
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="go-dashboard__section go-dashboard__section--activity" aria-labelledby="go-activity-heading">
            <div className="go-dashboard__section-head">
              <h2 id="go-activity-heading" className="go-dashboard__section-title">
                <IconActivity />
                Today&apos;s Activity
              </h2>
              <button
                type="button"
                className="go-dashboard__section-link"
                onClick={() => document.getElementById("go-activity-list")?.scrollIntoView({ behavior: "smooth" })}
              >
                View all activity →
              </button>
            </div>

            <div className="go-activity-panel go-activity-panel--compact">
              <div className="go-activity-completion">
                <div className="go-activity-completion__head">
                  <span>Store Completion</span>
                  <strong>{completionPct}%</strong>
                </div>
                <p className="go-activity-completion__sub">All locations</p>
                <div className="go-activity-completion__bar" role="progressbar" aria-valuenow={completionPct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${completionPct}%` }} />
                </div>
              </div>

              <div id="go-activity-list" className="go-activity-lists">
                <div className="go-activity-block">
                  <h3>Completed ({completedToday.length})</h3>
                  {completedToday.length === 0 ? (
                    <p className="enterprise-muted go-activity-empty">No completions yet today.</p>
                  ) : (
                    <ul>
                      {completedToday.slice(0, 8).map((s) => (
                        <li key={s.id} className="go-activity-row go-activity-row--done">
                          <span className="go-activity-row__avatar">{userInitials(s.submitterName)}</span>
                          <div className="go-activity-row__copy">
                            <strong>{s.submitterName?.trim() || "Associate"}</strong>
                            <span>
                              {s.locationName} · {formatGoTime(s.submittedAt)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="go-activity-block">
                  <h3>Needs attention ({needsAttention.length})</h3>
                  {needsAttention.length === 0 ? (
                    <p className="enterprise-muted go-activity-empty">All caught up.</p>
                  ) : (
                    <ul>
                      {needsAttention.slice(0, 6).map((s) => (
                        <li key={s.id} className="go-activity-row go-activity-row--alert">
                          <div className="go-activity-row__copy">
                            <strong>{s.locationName}</strong>
                            <span>
                              {s.checkedCount}/{s.totalCount} complete · {formatGoTime(s.submittedAt)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {menuChecklist && menuCoords
        ? createPortal(
            <div
              className={`go-checklist-row-menu go-checklist-row-menu--fixed${menuCoords.openUp ? " go-checklist-row-menu--up" : ""}`}
              role="menu"
              style={{ top: menuCoords.top, left: menuCoords.left, minWidth: CHECKLIST_MENU_WIDTH }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuChecklistId(null);
                  openBuilder(menuChecklist.id);
                }}
              >
                Edit
              </button>
              {menuPreviewUrl ? (
                <a
                  href={menuPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  role="menuitem"
                  className="go-checklist-row-menu-link"
                  onClick={() => setMenuChecklistId(null)}
                >
                  Preview
                </a>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="go-checklist-row-menu-danger"
                onClick={() => {
                  setMenuChecklistId(null);
                  void onDeactivate(menuChecklist);
                }}
              >
                Remove
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
