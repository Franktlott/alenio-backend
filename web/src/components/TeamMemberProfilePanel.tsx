import { useState } from "react";
import type { WebTeamMemberRow } from "../lib/api";
import { OneOnOneHistoryTab } from "./OneOnOneHistoryTab";

const PROFILE_TABS = ["Overview", "Development plan", "1:1 history"] as const;

type ProfileTab = (typeof PROFILE_TABS)[number];

type Props = {
  teamId: string;
  member: WebTeamMemberRow;
  isSelf: boolean;
  managerName: string | null;
  roleLabel: string;
  roleBadgeClass: string;
  canManage: boolean;
  canCreateOneOne: boolean;
  streak?: number;
  overdueTasks?: number;
  onBack: () => void;
  onManage: () => void;
};

export function TeamMemberProfilePanel({
  teamId,
  member,
  isSelf,
  managerName,
  roleLabel,
  roleBadgeClass,
  canManage,
  canCreateOneOne,
  streak,
  overdueTasks,
  onBack,
  onManage,
}: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("Overview");
  const [oneOneCreateTrigger, setOneOneCreateTrigger] = useState(0);
  const displayName = member.user.name ?? member.user.email ?? "Member";

  const scheduleOneOne = () => {
    setActiveTab("1:1 history");
    if (canCreateOneOne) {
      setOneOneCreateTrigger((n) => n + 1);
    }
  };

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
          <button
            type="button"
            className="enterprise-team-profile-action enterprise-team-profile-action-outline"
            disabled={!canCreateOneOne}
            onClick={scheduleOneOne}
          >
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
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`enterprise-team-profile-tab${activeTab === tab ? " enterprise-team-profile-tab--active" : ""}`}
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className="enterprise-team-profile-body">
        {activeTab === "Overview" ? (
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
        ) : activeTab === "Development plan" ? (
          <div className="enterprise-team-profile-tab-coming-soon" aria-label="Development plan content">
            <span className="enterprise-team-coming-soon-badge">Coming soon</span>
            <p className="enterprise-team-profile-tab-coming-soon-title">Development plan</p>
            <p className="enterprise-muted enterprise-team-profile-tab-coming-soon-copy">
              Target roles, strengths, action plans, and manager notes will show up here.
            </p>
          </div>
        ) : (
          <OneOnOneHistoryTab
            teamId={teamId}
            memberUserId={member.userId}
            memberName={displayName}
            managerName={managerName}
            canCreate={canCreateOneOne}
            canModify={canCreateOneOne}
            createTrigger={oneOneCreateTrigger}
          />
        )}
      </div>
    </div>
  );
}
