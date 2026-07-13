import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { WebTeamMemberRow } from "../lib/api";
import {
  frequencyToDays,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";
import { DevelopmentPlanTab } from "./DevelopmentPlanTab";
import { OneOnOneHistoryTab } from "./OneOnOneHistoryTab";
import { ProfileOverviewTab } from "./ProfileOverviewTab";
import { UserAvatar } from "./UserAvatar";

type ProfileSection =
  | "Overview"
  | "Check-ins"
  | "Development"
  | "Goals"
  | "Recognition"
  | "Feedback"
  | "Timeline"
  | "Documents"
  | "Settings";

const ACTIVE_SECTIONS: ProfileSection[] = ["Overview", "Check-ins", "Development", "Goals"];
const COMING_SOON_SECTIONS: ProfileSection[] = ["Recognition", "Feedback", "Timeline", "Documents", "Settings"];
const ALL_SECTIONS: ProfileSection[] = [...ACTIVE_SECTIONS, ...COMING_SOON_SECTIONS];

type Props = {
  teamId: string;
  teamName?: string | null;
  member: WebTeamMemberRow;
  isSelf: boolean;
  isFormerMember?: boolean;
  managerName: string | null;
  leaderUserId: string | null;
  roleLabel: string;
  roleBadgeClass: string;
  canManage: boolean;
  canCreateOneOne: boolean;
  canCreateDevGoal: boolean;
  canAddDevNotes: boolean;
  streak?: number;
  overdueFollowUpTasks?: number;
  activeTasks?: number;
  completedTasks?: number;
  activeDevGoals?: number;
  workplaceStandards?: WorkplaceStandards;
  standardsCompliance?: MemberStandardsCompliance;
  daysSinceLastCheckIn?: number | null;
  canManageStandards?: boolean;
  onManageStandards?: () => void;
  onBack: () => void;
  onManage: () => void;
};

function nextCheckInLabel(
  standards: WorkplaceStandards | undefined,
  daysSince: number | null | undefined,
  compliance: MemberStandardsCompliance | undefined,
): { value: string; hint: string } {
  if (!standards?.checkInRequired) return { value: "—", hint: "Not required" };
  if (daysSince == null) return { value: "Due", hint: "No check-in yet" };
  const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
  const remaining = frequencyDays - daysSince;
  if (compliance?.checkInStatus === "overdue" || remaining <= 0) {
    return { value: "Overdue", hint: `${daysSince} days since last` };
  }
  if (remaining === 1) return { value: "1 Day", hint: "Until next check-in" };
  return { value: `${remaining} Days`, hint: "Until next check-in" };
}

function goalsLabel(active: number | undefined, compliance: MemberStandardsCompliance | undefined): { value: string; hint: string } {
  const count = active ?? 0;
  if (compliance?.goalsStatus === "missing_goals") {
    return { value: String(count), hint: "Below standard" };
  }
  if (count <= 0) return { value: "0", hint: "No active goals" };
  return { value: String(count), hint: count === 1 ? "On Track" : "On Track" };
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M5 8H4a3 3 0 0 0 3 3" />
      <path d="M19 8h1a3 3 0 0 1-3 3" />
    </svg>
  );
}

function IconChecklist() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

export function TeamMemberProfilePanel({
  teamId,
  teamName,
  member,
  isSelf,
  isFormerMember = false,
  managerName,
  leaderUserId,
  roleLabel,
  roleBadgeClass,
  canManage,
  canCreateOneOne,
  canCreateDevGoal,
  canAddDevNotes,
  activeTasks,
  completedTasks,
  activeDevGoals,
  workplaceStandards,
  standardsCompliance,
  daysSinceLastCheckIn,
  canManageStandards,
  onManageStandards,
  onBack,
  onManage,
}: Props) {
  const [section, setSection] = useState<ProfileSection>("Overview");
  const displayName = member.user.name ?? member.user.email ?? "Member";

  useEffect(() => {
    setSection(isFormerMember ? "Check-ins" : "Overview");
  }, [isFormerMember, member.userId]);

  const nextCheckIn = useMemo(
    () => nextCheckInLabel(workplaceStandards, daysSinceLastCheckIn, standardsCompliance),
    [workplaceStandards, daysSinceLastCheckIn, standardsCompliance],
  );
  const goals = useMemo(
    () => goalsLabel(activeDevGoals, standardsCompliance),
    [activeDevGoals, standardsCompliance],
  );

  const contentSection = section === "Goals" ? "Development" : section;

  return (
    <div className="enterprise-team-profile enterprise-team-profile--v2" data-testid="team-member-profile">
      <button type="button" className="enterprise-team-profile-back" onClick={onBack}>
        ← Back to team
      </button>

      <header className="enterprise-team-profile-hero">
        <div className="enterprise-team-profile-hero-main">
          <UserAvatar
            user={member.user}
            className="enterprise-team-profile-avatar enterprise-team-profile-avatar--lg"
            alt={displayName}
          />
          <div className="enterprise-team-profile-hero-copy">
            <div className="enterprise-team-profile-name-row">
              <h2 className="enterprise-team-profile-name">
                {displayName}
                {isSelf ? " (You)" : ""}
              </h2>
              {isFormerMember ? (
                <span className="enterprise-team-profile-former-badge">Former</span>
              ) : (
                <span className="enterprise-team-profile-active-badge">Active</span>
              )}
              <span className={roleBadgeClass}>{roleLabel}</span>
            </div>
            {member.user.email ? <p className="enterprise-team-profile-email">{member.user.email}</p> : null}
            <div className="enterprise-team-profile-meta-row">
              {teamName ? (
                <span>
                  <em>Team</em> {teamName}
                </span>
              ) : null}
              {managerName && member.role !== "owner" && !isFormerMember ? (
                <span>
                  <em>Reports to</em> {managerName}
                </span>
              ) : null}
              {member.role === "owner" && !isFormerMember ? (
                <span>
                  <em>Role</em> Workspace owner
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="enterprise-team-profile-hero-actions">
          {isSelf ? (
            <Link to="/profile" className="enterprise-team-profile-edit-btn">
              <IconEdit />
              Edit Profile
            </Link>
          ) : null}
          {canManage ? (
            <button type="button" className="enterprise-team-profile-kebab" aria-label="Member actions" onClick={onManage}>
              ⋮
            </button>
          ) : null}
        </div>
      </header>

      {!isFormerMember ? (
        <div className="enterprise-team-profile-metrics" aria-label="Member metrics">
          <article className="enterprise-team-profile-metric">
            <span className="enterprise-team-profile-metric-icon" aria-hidden>
              <IconCalendar />
            </span>
            <div>
              <span className="enterprise-team-profile-metric-label">Next Check-in</span>
              <strong>{nextCheckIn.value}</strong>
              <span className="enterprise-team-profile-metric-hint">{nextCheckIn.hint}</span>
            </div>
          </article>
          <article className="enterprise-team-profile-metric">
            <span className="enterprise-team-profile-metric-icon" aria-hidden>
              <IconTarget />
            </span>
            <div>
              <span className="enterprise-team-profile-metric-label">Active Goals</span>
              <strong>{goals.value}</strong>
              <span className="enterprise-team-profile-metric-hint">{goals.hint}</span>
            </div>
          </article>
          <article className="enterprise-team-profile-metric">
            <span className="enterprise-team-profile-metric-icon" aria-hidden>
              <IconTrophy />
            </span>
            <div>
              <span className="enterprise-team-profile-metric-label">Recognition</span>
              <strong>—</strong>
              <span className="enterprise-team-profile-metric-hint">Coming soon</span>
            </div>
          </article>
          <article className="enterprise-team-profile-metric">
            <span className="enterprise-team-profile-metric-icon" aria-hidden>
              <IconChecklist />
            </span>
            <div>
              <span className="enterprise-team-profile-metric-label">Tasks Assigned</span>
              <strong>{activeTasks ?? 0}</strong>
              <span className="enterprise-team-profile-metric-hint">
                {completedTasks != null ? `${completedTasks} completed` : "Open tasks"}
              </span>
            </div>
          </article>
          <article className="enterprise-team-profile-metric">
            <span className="enterprise-team-profile-metric-icon" aria-hidden>
              <IconTrend />
            </span>
            <div>
              <span className="enterprise-team-profile-metric-label">Check-in Trend</span>
              <strong>
                {daysSinceLastCheckIn == null
                  ? "—"
                  : daysSinceLastCheckIn === 0
                    ? "Today"
                    : `${daysSinceLastCheckIn}d`}
              </strong>
              <span className="enterprise-team-profile-metric-hint">Since last check-in</span>
            </div>
          </article>
        </div>
      ) : null}

      <div className="enterprise-team-profile-workspace">
        {!isFormerMember ? (
          <nav className="enterprise-team-profile-sidenav" aria-label="Member profile sections">
            {ALL_SECTIONS.map((item) => {
              const soon = COMING_SOON_SECTIONS.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  className={`enterprise-team-profile-sidenav-item${section === item ? " is-active" : ""}${soon ? " is-soon" : ""}`}
                  aria-selected={section === item}
                  disabled={soon}
                  title={soon ? "Coming soon" : undefined}
                  onClick={() => setSection(item)}
                >
                  {item}
                </button>
              );
            })}
          </nav>
        ) : null}

        <div className="enterprise-team-profile-body enterprise-team-profile-body--v2">
          {contentSection === "Overview" ? (
            <ProfileOverviewTab
              teamId={teamId}
              memberUserId={member.userId}
              roleLabel={roleLabel}
              email={member.user.email}
              isSelf={isSelf}
              canManageStandards={canManageStandards}
              canCreateDevGoal={canCreateDevGoal}
              workplaceStandards={workplaceStandards}
              standardsCompliance={standardsCompliance}
              daysSinceLastCheckIn={daysSinceLastCheckIn}
              onManageStandards={onManageStandards}
              onOpenGrowthTab={() => setSection("Development")}
            />
          ) : contentSection === "Development" ? (
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
    </div>
  );
}
