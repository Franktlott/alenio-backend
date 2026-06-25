import {
  TASK_DUE_SOON_DAYS,
  formatAvgFollowUpDays,
  type TaskFollowUpStats,
} from "../../lib/task-follow-up-stats";

type TaskScope = "mine" | "team";

type Props = {
  taskScope: TaskScope;
  canViewTeamScope: boolean;
  stats: TaskFollowUpStats;
  onScopeChange: (scope: TaskScope) => void;
};

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3.3 2.7-6 6-6" />
      <path d="M14 19c0-2.5 1.8-4.6 4.2-5" />
    </svg>
  );
}

export function WorkspaceTaskFollowUpPanel({
  taskScope,
  canViewTeamScope,
  stats,
  onScopeChange,
}: Props) {
  return (
    <div className="enterprise-workspace-followup-panel">
      <div className="enterprise-workspace-followup-head">
        <div className="enterprise-workspace-followup-scope" role={canViewTeamScope ? "tablist" : undefined}>
          {canViewTeamScope ? (
            (["mine", "team"] as const).map((scope) => {
              const active = taskScope === scope;
              return (
                <button
                  key={scope}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`enterprise-workspace-followup-scope-tab ${active ? "enterprise-workspace-followup-scope-tab-on" : ""}`}
                  onClick={() => onScopeChange(scope)}
                >
                  {scope === "mine" ? <PersonIcon /> : <TeamIcon />}
                  {scope === "mine" ? "My Follow-Ups" : "Team Follow-Ups"}
                </button>
              );
            })
          ) : (
            <div className="enterprise-workspace-followup-scope-tab enterprise-workspace-followup-scope-tab-on enterprise-workspace-followup-scope-tab-static">
              <PersonIcon />
              My Follow-Ups
            </div>
          )}
        </div>
      </div>

      <div className="enterprise-workspace-followup-stats" aria-label="Follow-up summary">
        <article className="enterprise-workspace-followup-stat enterprise-workspace-followup-stat--attention">
          <span className="enterprise-workspace-followup-stat-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4" />
              <circle cx="12" cy="16" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="enterprise-workspace-followup-stat-copy">
            <strong>{stats.needsAttention}</strong>
            <span className="enterprise-workspace-followup-stat-title">Needs Attention</span>
            <span className="enterprise-workspace-followup-stat-sub">Overdue or due today</span>
          </div>
        </article>

        <article className="enterprise-workspace-followup-stat enterprise-workspace-followup-stat--soon">
          <span className="enterprise-workspace-followup-stat-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div className="enterprise-workspace-followup-stat-copy">
            <strong>{stats.dueSoon}</strong>
            <span className="enterprise-workspace-followup-stat-title">Due Soon</span>
            <span className="enterprise-workspace-followup-stat-sub">
              Due in the next {TASK_DUE_SOON_DAYS} days
            </span>
          </div>
        </article>

        <article className="enterprise-workspace-followup-stat enterprise-workspace-followup-stat--track">
          <span className="enterprise-workspace-followup-stat-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
          </span>
          <div className="enterprise-workspace-followup-stat-copy">
            <strong>{stats.onTrack}</strong>
            <span className="enterprise-workspace-followup-stat-title">On Track</span>
            <span className="enterprise-workspace-followup-stat-sub">
              Due after {TASK_DUE_SOON_DAYS} days
            </span>
          </div>
        </article>

        <article className="enterprise-workspace-followup-stat enterprise-workspace-followup-stat--avg">
          <span className="enterprise-workspace-followup-stat-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 18l4-6 4 3 4-7 4 5" />
            </svg>
          </span>
          <div className="enterprise-workspace-followup-stat-copy">
            <strong>{formatAvgFollowUpDays(stats.avgFollowUpDays)}</strong>
            <span className="enterprise-workspace-followup-stat-title">Avg follow-up time</span>
            <span className="enterprise-workspace-followup-stat-sub">This month</span>
          </div>
        </article>
      </div>
    </div>
  );
}
