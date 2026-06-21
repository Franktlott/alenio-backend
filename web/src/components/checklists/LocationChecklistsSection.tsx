import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  checklistPublicUrl,
  deleteChecklistLocation,
  fetchChecklistLocations,
  type ChecklistLocationRow,
} from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { LocationChecklistEditorModal } from "./LocationChecklistEditorModal";
import { LocationChecklistHistoryPanel } from "./LocationChecklistHistoryPanel";
import { LocationChecklistLinkQrModal } from "./LocationChecklistLinkQrModal";

type Props = {
  teamId: string;
  myRole: string;
};

function canManage(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LocationChecklistsSection({ teamId, myRole }: Props) {
  const queryClient = useQueryClient();
  const manager = canManage(myRole);
  const [editorTarget, setEditorTarget] = useState<ChecklistLocationRow | null | "new">(null);
  const [linkTarget, setLinkTarget] = useState<ChecklistLocationRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ChecklistLocationRow | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"today" | "7d" | "30d">("7d");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.checklistLocations(teamId),
    queryFn: () => fetchChecklistLocations(teamId),
    enabled: !!teamId,
    refetchInterval: 8000,
  });

  const planRequired = listQuery.data?.planRequired ?? false;
  const locations = listQuery.data?.locations ?? [];
  const recentSubmissions = listQuery.data?.recentSubmissions ?? [];

  const activeLocations = useMemo(() => locations.filter((l) => l.isActive), [locations]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.checklistLocations(teamId) });
  };

  const onDeactivate = async (location: ChecklistLocationRow) => {
    setActionErr(null);
    setMenuId(null);
    if (!window.confirm(`Remove "${location.name}"? Existing links will stop working.`)) return;
    try {
      await deleteChecklistLocation(teamId, location.id);
      if (historyTarget?.id === location.id) setHistoryTarget(null);
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not remove location.");
    }
  };

  const copyLink = async (location: ChecklistLocationRow) => {
    setMenuId(null);
    try {
      await navigator.clipboard.writeText(checklistPublicUrl(location.publicToken));
    } catch {
      setActionErr("Could not copy link.");
    }
  };

  return (
    <>
      <section
        className="enterprise-card enterprise-card-checklists"
        aria-labelledby="location-checklists-heading"
        id="location-checklists"
      >
        <div className="enterprise-card-head enterprise-card-head-row">
          <div>
            <h2 id="location-checklists-heading" className="enterprise-card-title">
              Location Checklists
            </h2>
            <p className="enterprise-muted enterprise-checklists-sub">
              {manager && !planRequired
                ? "Create a location, then use Share link & QR on each row for on-site staff."
                : "Share a link or QR at each location. Staff complete checklists without logging in."}
            </p>
          </div>
          {manager && !planRequired ? (
            <button
              type="button"
              className="enterprise-dashboard-add-task"
              onClick={() => setEditorTarget("new")}
            >
              + Add location
            </button>
          ) : null}
        </div>

        {actionErr ? (
          <p className="enterprise-form-error" role="alert">
            {actionErr}
          </p>
        ) : null}

        <div className="enterprise-card-checklists-body">
          {listQuery.isLoading ? (
            <p className="enterprise-muted">Loading checklists…</p>
          ) : listQuery.isError ? (
            <p className="enterprise-form-error" role="alert">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : "Could not load location checklists. Restart the backend after updating, then run prisma db push."}
            </p>
          ) : planRequired ? (
            <div className="enterprise-checklists-upgrade">
              <p className="enterprise-muted">Location checklists are available on Team and Pro plans.</p>
              <Link to="/billing" className="enterprise-profile-development-link">
                View billing →
              </Link>
            </div>
          ) : activeLocations.length === 0 ? (
            <p className="enterprise-muted">
              {manager ? "Add your first location checklist to generate a link and QR code." : "No location checklists yet."}
            </p>
          ) : (
            <>
              <ul className="enterprise-checklist-location-list">
                {activeLocations.map((loc) => (
                  <li key={loc.id} className="enterprise-checklist-location-row">
                    <button
                      type="button"
                      className="enterprise-checklist-location-main"
                      onClick={() => {
                        setHistoryTarget(loc);
                        setMenuId(null);
                      }}
                    >
                      <strong>{loc.name}</strong>
                      <span className="enterprise-muted enterprise-checklist-location-meta">
                        {loc.items.length} tasks · Last {formatRelative(loc.stats.lastSubmittedAt)} · Today {loc.stats.todayCount}
                      </span>
                    </button>
                    {manager ? (
                      <div className="enterprise-checklist-location-actions">
                        <button
                          type="button"
                          className="enterprise-team-pill-btn enterprise-checklist-share-btn"
                          onClick={() => setLinkTarget(loc)}
                          data-testid={`checklist-share-${loc.id}`}
                        >
                          Share link & QR
                        </button>
                        <div className="enterprise-profile-workspace-menu-wrap">
                          <button
                            type="button"
                            className="enterprise-profile-workspace-more"
                            aria-label={`Actions for ${loc.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId((prev) => (prev === loc.id ? null : loc.id));
                            }}
                          >
                            ⋯
                          </button>
                          {menuId === loc.id ? (
                            <div className="enterprise-profile-workspace-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => { setMenuId(null); setEditorTarget(loc); }}>
                                Edit
                              </button>
                              <button type="button" role="menuitem" onClick={() => void copyLink(loc)}>
                                Copy link
                              </button>
                              <button type="button" role="menuitem" onClick={() => { setMenuId(null); setLinkTarget(loc); }}>
                                QR code
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="enterprise-profile-workspace-menu-danger"
                                onClick={() => void onDeactivate(loc)}
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              {historyTarget ? (
                <LocationChecklistHistoryPanel
                  teamId={teamId}
                  location={historyTarget}
                  filter={historyFilter}
                  onFilterChange={setHistoryFilter}
                  onClose={() => setHistoryTarget(null)}
                />
              ) : null}

              {recentSubmissions.length > 0 ? (
                <div className="enterprise-checklist-recent">
                  <h3 className="enterprise-checklist-recent-title">Recent submissions</h3>
                  <ul className="enterprise-checklist-recent-list">
                    {recentSubmissions.slice(0, 8).map((s) => (
                      <li key={s.id} className="enterprise-checklist-recent-row">
                        <span>
                          <strong>{s.locationName}</strong>
                          <span className="enterprise-muted"> · {formatWhen(s.submittedAt)}</span>
                          {s.submitterName ? <span className="enterprise-muted"> · {s.submitterName}</span> : null}
                        </span>
                        <span className={s.isComplete ? "enterprise-checklist-badge-complete" : "enterprise-checklist-badge-partial"}>
                          {s.checkedCount}/{s.totalCount}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {editorTarget ? (
        <LocationChecklistEditorModal
          teamId={teamId}
          location={editorTarget === "new" ? null : editorTarget}
          onClose={() => setEditorTarget(null)}
          onSaved={async (saved, wasCreate) => {
            await refresh();
            if (wasCreate) setLinkTarget(saved);
          }}
        />
      ) : null}

      {linkTarget ? (
        <LocationChecklistLinkQrModal location={linkTarget} onClose={() => setLinkTarget(null)} />
      ) : null}
    </>
  );
}
