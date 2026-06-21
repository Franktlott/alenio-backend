import { useEffect, useMemo, useRef, useState } from "react";
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
  formatGoRelative,
  formatGoTime,
  isIpadRecentlyActive,
  latestSubmissionAt,
  storeCompletionPercent,
  todaySubmissions,
  userInitials,
} from "../../lib/go-dashboard-utils";
import { queryKeys } from "../../lib/query-keys";
import { checklistCardColorStyles } from "../../lib/checklist-card-colors";
import { GoLocationQrCompact } from "./GoLocationQrCompact";
import { LocationChecklistHistoryPanel } from "./LocationChecklistHistoryPanel";

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

function IconMapPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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

function IconDevice() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LocationChecklistsSection({ teamId, myRole, teamName, teamImage }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const manager = canManage(myRole);
  const [historyTarget, setHistoryTarget] = useState<ChecklistLocationRow | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"today" | "7d" | "30d">("7d");
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [locationExpanded, setLocationExpanded] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);
  const locationsRef = useRef<HTMLElement>(null);

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

  const lastDeviceActivity = useMemo(() => latestSubmissionAt(recentSubmissions), [recentSubmissions]);
  const ipadConnected = isIpadRecentlyActive(lastDeviceActivity);
  const todayActivity = useMemo(() => todaySubmissions(recentSubmissions), [recentSubmissions]);
  const completionPct = storeCompletionPercent(recentSubmissions, activeChecklists.length);
  const completedToday = todayActivity.filter((s) => s.isComplete);
  const needsAttention = todayActivity.filter((s) => !s.isComplete);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.checklistLocations(teamId) });
  };

  const onDeactivate = async (checklist: ChecklistLocationRow) => {
    setActionErr(null);
    setMenuId(null);
    if (!window.confirm(`Remove "${checklist.name}"?`)) return;
    try {
      await deleteChecklistLocation(teamId, checklist.id);
      if (historyTarget?.id === checklist.id) setHistoryTarget(null);
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

  const scrollToLocations = () => {
    locationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setLocationExpanded(true);
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

        <div className="go-dashboard__toolbar">
          {manager ? (
            <button type="button" className="go-btn go-btn--primary" onClick={() => openBuilder()}>
              + Create Checklist
            </button>
          ) : null}
          <button type="button" className="go-btn go-btn--outline" onClick={scrollToLocations}>
            <IconDevice />
            Connect Device
          </button>
        </div>

        <section className="go-dashboard__section" aria-labelledby="go-checklists-heading">
          <div className="go-dashboard__section-head">
            <h2 id="go-checklists-heading" className="go-dashboard__section-title">
              <IconClipboard />
              Checklists
            </h2>
            <button type="button" className="go-dashboard__section-link" onClick={() => carouselRef.current?.scrollIntoView({ behavior: "smooth" })}>
              View all checklists
            </button>
          </div>

          {activeChecklists.length === 0 ? (
            <div className="go-dashboard__empty-card">
              <p className="enterprise-muted">No checklists yet.</p>
              {manager ? (
                <button type="button" className="go-btn go-btn--primary go-btn--sm" onClick={() => openBuilder()}>
                  + Create Checklist
                </button>
              ) : null}
            </div>
          ) : (
            <div className="go-checklist-carousel-wrap">
              <div className="go-checklist-carousel" ref={carouselRef}>
                {activeChecklists.map((cl) => {
                  const meta = checklistCardMeta(cl);
                  const cardStyle = checklistCardColorStyles(cl.cardColor);
                  const previewUrl = hubToken ? `${workspaceChecklistHubUrl(hubToken)}/${cl.id}` : null;
                  return (
                    <article
                      key={cl.id}
                      className="go-checklist-card"
                      style={{
                        background: cardStyle.background,
                        borderColor: cardStyle.borderColor,
                        boxShadow: `inset 4px 0 0 ${cardStyle.accent}`,
                      }}
                    >
                      <div className="go-checklist-card__head">
                        <div className="go-checklist-card__icon" style={{ background: meta.iconBg }} aria-hidden>
                          {meta.icon}
                        </div>
                        {manager ? (
                          <div className="go-checklist-card__menu-wrap">
                            <button
                              type="button"
                              className="go-checklist-card__menu-btn"
                              aria-label={`Actions for ${cl.name}`}
                              aria-expanded={menuId === cl.id}
                              aria-haspopup="menu"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuId((prev) => (prev === cl.id ? null : cl.id));
                              }}
                            >
                              ⋯
                            </button>
                            {menuId === cl.id ? (
                              <div className="go-checklist-card__menu" role="menu">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuId(null);
                                    openBuilder(cl.id);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="go-checklist-card__menu-danger"
                                  onClick={() => void onDeactivate(cl)}
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <h3 className="go-checklist-card__title">{cl.name}</h3>
                      <dl className="go-checklist-card__meta">
                        <div>
                          <dt>Area</dt>
                          <dd>{meta.area}</dd>
                        </div>
                        <div>
                          <dt>Frequency</dt>
                          <dd>{meta.frequency}</dd>
                        </div>
                        <div>
                          <dt>Tasks</dt>
                          <dd>{cl.items.length}</dd>
                        </div>
                        <div>
                          <dt>Locations</dt>
                          <dd>1</dd>
                        </div>
                      </dl>
                      <p className="go-checklist-card__updated">Last updated {formatGoDate(cl.updatedAt)}</p>
                      <div className="go-checklist-card__actions">
                        {previewUrl ? (
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="go-btn go-btn--ghost go-btn--sm">
                            Preview
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="go-btn go-btn--ghost go-btn--sm"
                          onClick={() => {
                            setHistoryTarget(cl);
                          }}
                        >
                          History
                        </button>
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

        <div className="go-dashboard__columns">
          <section className="go-dashboard__section" id="go-locations" ref={locationsRef} aria-labelledby="go-locations-heading">
            <div className="go-dashboard__section-head">
              <h2 id="go-locations-heading" className="go-dashboard__section-title">
                <IconMapPin />
                Locations
              </h2>
              <button type="button" className="go-dashboard__section-link" onClick={scrollToLocations}>
                View all locations
              </button>
            </div>

            <div className="go-location-list">
              <article className={`go-location-card${locationExpanded ? " go-location-card--open" : ""}`}>
                <button
                  type="button"
                  className="go-location-card__head"
                  onClick={() => setLocationExpanded((v) => !v)}
                  aria-expanded={locationExpanded}
                >
                  <div className="go-location-card__thumb-wrap">
                    {teamImage ? (
                      <img src={teamImage} alt="" className="go-location-card__thumb" />
                    ) : (
                      <span className="go-location-card__thumb-fallback">{teamName?.[0]?.toUpperCase() ?? "W"}</span>
                    )}
                  </div>
                  <div className="go-location-card__summary">
                    <strong>{teamName ?? "Workspace"}</strong>
                    <span className={`go-location-card__status${ipadConnected ? " go-location-card__status--on" : ""}`}>
                      <span className="go-location-card__status-dot" aria-hidden />
                      {ipadConnected ? "iPad Connected" : "iPad Not Connected"}
                    </span>
                  </div>
                  <span className="go-location-card__chevron" aria-hidden>
                    {locationExpanded ? "▴" : "▾"}
                  </span>
                </button>

                {locationExpanded ? (
                  <div className="go-location-card__body">
                    <p className="go-location-card__last-seen">Last seen {formatGoRelative(lastDeviceActivity)}</p>
                    <div className="go-location-card__active">
                      <h3>Active Checklists</h3>
                      {activeChecklists.length === 0 ? (
                        <p className="enterprise-muted">None yet</p>
                      ) : (
                        <ul>
                          {activeChecklists.map((cl) => (
                            <li key={cl.id}>
                              <span className="go-location-card__check" aria-hidden>
                                ✓
                              </span>
                              {cl.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <GoLocationQrCompact hubToken={hubToken} workspaceName={teamName} />
                  </div>
                ) : null}
              </article>
            </div>
          </section>

          <section className="go-dashboard__section" aria-labelledby="go-activity-heading">
            <div className="go-dashboard__section-head">
              <h2 id="go-activity-heading" className="go-dashboard__section-title">
                <IconActivity />
                Today&apos;s Activity
              </h2>
              <button type="button" className="go-dashboard__section-link" onClick={() => document.getElementById("go-activity-list")?.scrollIntoView({ behavior: "smooth" })}>
                View all activity
              </button>
            </div>

            <div className="go-activity-panel">
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
                      {completedToday.slice(0, 12).map((s) => (
                        <li key={s.id} className="go-activity-row go-activity-row--done">
                          <span className="go-activity-row__avatar">{userInitials(s.submitterName)}</span>
                          <div className="go-activity-row__copy">
                            <strong>{s.submitterName?.trim() || "Associate"}</strong>
                            <span>
                              {s.locationName} · {formatGoTime(s.submittedAt)}
                            </span>
                          </div>
                          <span className="go-activity-row__badge go-activity-row__badge--ok" aria-hidden>
                            ✓
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="go-activity-block">
                  <h3>Needs Attention ({needsAttention.length})</h3>
                  {needsAttention.length === 0 ? (
                    <p className="enterprise-muted go-activity-empty">All caught up.</p>
                  ) : (
                    <ul>
                      {needsAttention.slice(0, 8).map((s) => (
                        <li key={s.id} className="go-activity-row go-activity-row--alert">
                          <span className="go-activity-row__dot" aria-hidden />
                          <div className="go-activity-row__copy">
                            <strong>{s.locationName}</strong>
                            <span>
                              {s.checkedCount}/{s.totalCount} complete · {formatGoTime(s.submittedAt)}
                            </span>
                          </div>
                          <span className="go-activity-row__due">Due now</span>
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

      {historyTarget ? (
        <LocationChecklistHistoryPanel
          teamId={teamId}
          location={historyTarget}
          filter={historyFilter}
          onFilterChange={setHistoryFilter}
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}
    </>
  );
}
