import { useState } from "react";
import type { WebTeamMemberRow } from "../lib/api";
import { DevelopmentPlanTab } from "./DevelopmentPlanTab";
import { OneOnOneHistoryTab } from "./OneOnOneHistoryTab";
import { ProfileOverviewTab } from "./ProfileOverviewTab";

const PROFILE_TABS = ["Overview", "Growth", "Check-In"] as const;

type ProfileTab = (typeof PROFILE_TABS)[number];

type Props = {
  teamId: string;
  member: WebTeamMemberRow;
  isSelf: boolean;
  managerName: string | null;
  leaderUserId: string | null;
  roleLabel: string;
  roleBadgeClass: string;
  canManage: boolean;
  canCreateOneOne: boolean;
  canCreateDevGoal: boolean;
  canAddDevNotes: boolean;
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
  leaderUserId,
  roleLabel,
  roleBadgeClass,
  canManage,
  canCreateOneOne,
  canCreateDevGoal,
  canAddDevNotes,
  streak,
  overdueTasks,
  onBack,
  onManage,
}: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("Overview");
  const displayName = member.user.name ?? member.user.email ?? "Member";

  return (
    <div
      className={`enterprise-team-profile${activeTab === "Check-In" ? " enterprise-team-profile--check-in" : ""}`}
      data-testid="team-member-profile"
    >
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
        {canManage ? (
          <div className="enterprise-team-profile-actions">
            <button
              type="button"
              className="enterprise-team-profile-kebab"
              aria-label="Member actions"
              onClick={onManage}
            >
              ⋮
            </button>
          </div>
        ) : null}
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

      <div
        className={`enterprise-team-profile-body${activeTab === "Check-In" ? " enterprise-team-profile-body--check-in" : ""}`}
      >
        {activeTab === "Overview" ? (
          <ProfileOverviewTab
            teamId={teamId}
            memberUserId={member.userId}
            roleLabel={roleLabel}
            email={member.user.email}
            streak={streak}
            overdueTasks={overdueTasks}
          />
        ) : activeTab === "Growth" ? (
          <DevelopmentPlanTab
            teamId={teamId}
            memberUserId={member.userId}
            memberName={displayName}
            managerName={managerName}
            canCreate={canCreateDevGoal}
            canAddNotes={canAddDevNotes}
          />
        ) : (
          <OneOnOneHistoryTab
            teamId={teamId}
            memberUserId={member.userId}
            memberName={displayName}
            managerName={managerName}
            leaderUserId={leaderUserId}
            canCreate={canCreateOneOne}
            canModify={canCreateOneOne}
          />
        )}
      </div>
    </div>
  );
}
