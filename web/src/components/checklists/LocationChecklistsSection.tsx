import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  deleteChecklistLocation,
  fetchChecklistLocations,
  workspaceChecklistHubUrl,
  type ChecklistLocationRow,
} from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import { LocationChecklistEditorModal } from "./LocationChecklistEditorModal";
import { LocationChecklistHistoryPanel } from "./LocationChecklistHistoryPanel";
import { LocationChecklistQrPanel } from "./LocationChecklistQrPanel";

type Props = {
  teamId: string;
  myRole: string;
  teamName?: string;
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

export function LocationChecklistsSection({ teamId, myRole, teamName }: Props) {
  const queryClient = useQueryClient();
  const manager = canManage(myRole);
  const [editorTarget, setEditorTarget] = useState<ChecklistLocationRow | null | "new">(null);
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
  const hubToken = listQuery.data?.hubToken ?? null;
  const locations = listQuery.data?.locations ?? [];
  const recentSubmissions = listQuery.data?.recentSubmissions ?? [];
  const activeChecklists = useMemo(() => locations.filter((l) => l.isActive), [locations]);

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

  const copyHubLink = async () => {
    if (!hubToken) return;
    try {
      await navigator.clipboard.writeText(workspaceChecklistHubUrl(hubToken));
    } catch {
      setActionErr("Could not copy link.");
    }
  };

  const showQrPanel = !planRequired;

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
              Checklists
            </h2>
            <p className="enterprise-muted enterprise-checklists-sub">
              One QR code per workspace. Associates open the checklist page on iPad and pick a checklist — no login.
            </p>
          </div>
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
                : "Could not load checklists. Restart the backend after updating, then run prisma db push."}
            </p>
          ) : planRequired ? (
            <div className="enterprise-checklists-upgrade">
              <p className="enterprise-muted">Checklists are available on Team and Pro plans.</p>
              <Link to="/billing" className="enterprise-profile-development-link">
                View billing →
              </Link>
            </div>
          ) : (
            <>
              {showQrPanel ? (
                <LocationChecklistQrPanel
                  hubToken={hubToken}
                  workspaceName={teamName ?? "Workspace"}
                  checklistCount={activeChecklists.length}
                  showAddPrompt={manager}
                  onNewChecklist={manager ? () => setEditorTarget("new") : undefined}
                />
              ) : null}

              {activeChecklists.length > 0 ? (
                <>
                  <div className="enterprise-checklist-list-head">
                    <h3 className="enterprise-checklist-list-title">Your checklists</h3>
                    {manager ? (
                      <button
                        type="button"
                        className="enterprise-team-pill-btn enterprise-checklist-share-btn"
                        onClick={() => setEditorTarget("new")}
                      >
                        + New checklist
                      </button>
                    ) : null}
                  </div>

                  <ul className="enterprise-checklist-location-list">
                    {activeChecklists.map((cl) => (
                      <li key={cl.id} className="enterprise-checklist-location-row">
                        <button
                          type="button"
                          className="enterprise-checklist-location-main"
                          onClick={() => {
                            setHistoryTarget(cl);
                            setMenuId(null);
                          }}
                        >
                          <strong>{cl.name}</strong>
                          <span className="enterprise-muted enterprise-checklist-location-meta">
                            {cl.items.length} tasks · Last {formatRelative(cl.stats.lastSubmittedAt)} · Today{" "}
                            {cl.stats.todayCount}
                          </span>
                        </button>
                        <div className="enterprise-checklist-location-actions">
                          {hubToken ? (
                            <a
                              href={workspaceChecklistHubUrl(hubToken) + `/${cl.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="enterprise-team-pill-btn"
                            >
                              Preview
                            </a>
                          ) : null}
                          {manager ? (
                            <div className="enterprise-profile-workspace-menu-wrap">
                              <button
                                type="button"
                                className="enterprise-profile-workspace-more"
                                aria-label={`Actions for ${cl.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuId((prev) => (prev === cl.id ? null : cl.id));
                                }}
                              >
                                ⋯
                              </button>
                              {menuId === cl.id ? (
                                <div className="enterprise-profile-workspace-menu" role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setMenuId(null);
                                      setEditorTarget(cl);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button type="button" role="menuitem" onClick={() => void copyHubLink()}>
                                    Copy workspace link
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="enterprise-profile-workspace-menu-danger"
                                    onClick={() => void onDeactivate(cl)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
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
                              {s.submitterName ? (
                                <span className="enterprise-muted"> · {s.submitterName}</span>
                              ) : null}
                            </span>
                            <span
                              className={
                                s.isComplete ? "enterprise-checklist-badge-complete" : "enterprise-checklist-badge-partial"
                              }
                            >
                              {s.checkedCount}/{s.totalCount}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
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
          onSaved={async () => {
            await refresh();
          }}
        />
      ) : null}
    </>
  );
}
