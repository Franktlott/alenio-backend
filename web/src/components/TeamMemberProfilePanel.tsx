import type { WebTeamMemberRow } from "../lib/api";

const PROFILE_TABS = ["Overview", "Development plan", "1:1 history", "Goals", "Notes", "Training"] as const;

type Props = {
  member: WebTeamMemberRow;
  isSelf: boolean;
  managerName: string | null;
  roleLabel: string;
  roleBadgeClass: string;
  canManage: boolean;
  streak?: number;
  overdueTasks?: number;
  onBack: () => void;
  onManage: () => void;
};

export function TeamMemberProfilePanel({
  member,
  isSelf,
  managerName,
  roleLabel,
  roleBadgeClass,
  canManage,
  streak,
  overdueTasks,
  onBack,
  onManage,
}: Props) {
  const displayName = member.user.name ?? member.user.email ?? "Member";

  return (
    <div className="enterprise-team-profile" data-testid="team-member-profile">
      <button type="button" className="enterprise-team-profile-back" onClick={onBack}>
        ← Back to team
      </button>

      <header className="enterprise-team-profile-header">
        <div className="enterprise-team-profile-identity">
          <span className="enterprise-team-profile-avatar">
            {member.user.image ? (
              <img src={member.user.image} alt={displayName} />
            ) : (
              (member.user.name?.[0] ?? member.user.email?.[0] ?? "?").toUpperCase()
            )}
          </span>
          <div className="enterprise-team-profile-identity-text">
            <div className="enterprise-team-profile-name-row">
              <h2 className="enterprise-team-profile-name">
                {displayName}
                {isSelf ? " (you)" : ""}
              </h2>
              <span className="enterprise-team-profile-active-badge">Active</span>
            </div>
            <p className="enterprise-team-profile-role-line">
              <span className={roleBadgeClass}>{roleLabel}</span>
            </p>
            {member.user.email ? (
              <p className="enterprise-muted enterprise-team-profile-email">{member.user.email}</p>
            ) : null}
            {managerName && member.role !== "owner" ? (
              <p className="enterprise-muted enterprise-team-profile-reports">
                Reports to: <strong>{managerName}</strong>
              </p>
            ) : null}
          </div>
        </div>
        <div className="enterprise-team-profile-actions">
          <button type="button" className="enterprise-team-profile-action enterprise-team-profile-action--soon" disabled>
            + Add goal
          </button>
          <button type="button" className="enterprise-team-profile-action enterprise-team-profile-action-outline enterprise-team-profile-action--soon" disabled>
            Schedule 1:1
          </button>
          {canManage ? (
            <button
              type="button"
              className="enterprise-team-profile-kebab"
              aria-label="Member actions"
              onClick={onManage}
            >
              ⋮
            </button>
          ) : null}
        </div>
      </header>

      <nav className="enterprise-team-profile-tabs" aria-label="Member profile sections">
        {PROFILE_TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={`enterprise-team-profile-tab${index === 0 ? " enterprise-team-profile-tab--active" : ""} enterprise-team-profile-tab--soon`}
            disabled
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="enterprise-team-profile-body">
        <section className="enterprise-team-profile-section">
          <h3 className="enterprise-team-profile-section-title">At a glance</h3>
          <dl className="enterprise-team-profile-facts">
            <div>
              <dt>Role</dt>
              <dd>{roleLabel}</dd>
            </div>
            {member.user.email ? (
              <div>
                <dt>Email</dt>
                <dd>{member.user.email}</dd>
              </div>
            ) : null}
            {streak != null && streak > 0 ? (
              <div>
                <dt>Streak</dt>
                <dd>🔥 {streak} days</dd>
              </div>
            ) : null}
            {overdueTasks != null && overdueTasks > 0 ? (
              <div>
                <dt>Overdue tasks</dt>
                <dd className="enterprise-stat-overdue">{overdueTasks}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="enterprise-team-profile-section enterprise-team-section--coming-soon">
          <div className="enterprise-team-section-head">
            <h3 className="enterprise-team-profile-section-title">Development plan</h3>
            <span className="enterprise-team-coming-soon-badge">Coming soon</span>
          </div>
          <div className="enterprise-team-section-placeholder enterprise-team-profile-placeholder-grid">
            <div className="enterprise-team-profile-placeholder-card">
              <span className="enterprise-team-profile-placeholder-label">Target role</span>
              <span className="enterprise-team-profile-placeholder-value">—</span>
            </div>
            <div className="enterprise-team-profile-placeholder-card">
              <span className="enterprise-team-profile-placeholder-label">Action plan</span>
              <span className="enterprise-team-profile-placeholder-bar" />
              <span className="enterprise-team-profile-placeholder-bar enterprise-team-profile-placeholder-bar--short" />
            </div>
            <div className="enterprise-team-profile-placeholder-card">
              <span className="enterprise-team-profile-placeholder-label">Manager notes</span>
              <span className="enterprise-team-profile-placeholder-block" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
