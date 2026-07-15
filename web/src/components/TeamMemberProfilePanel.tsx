import { useEffect, useMemo, useState } from "react";
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
  onBack?: () => void;
  onManage: () => void;
};

function nextCheckInLabel(
  standards: WorkplaceStandards | undefined,
  daysSince: number | null | undefined,
  compliance: MemberStandardsCompliance | undefined,
): { value: string; hint: string } {
  if (!standards?.checkInRequired) return { value: "Not required", hint: "Check-ins optional" };
  if (daysSince == null) return { value: "Due", hint: "No check-in yet" };
  const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
  const remaining = frequencyDays - daysSince;
  if (compliance?.checkInStatus === "overdue" || remaining <= 0) {
    return { value: "Overdue", hint: `${daysSince} days since last` };
  }
  if (remaining === 1) return { value: "1 day", hint: "Until next check-in" };
  return { value: `${remaining} days`, hint: "Until next check-in" };
}

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconOrg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5V12M12 12H5.5M12 12h6.5M5.5 12v4.5M18.5 12v4.5" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M8 8h2M8 12h2M8 16h2M17 14h1M17 17h1" />
      <path d="M4 21h16" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
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
  const email = member.user.email?.trim() || null;

  useEffect(() => {
    setSection(isFormerMember ? "Check-ins" : "Overview");
  }, [isFormerMember, member.userId]);

  const nextCheckIn = useMemo(
    () => nextCheckInLabel(workplaceStandards, daysSinceLastCheckIn, standardsCompliance),
    [workplaceStandards, daysSinceLastCheckIn, standardsCompliance],
  );

  const contentSection = section === "Goals" ? "Development" : section;
  const statusLabel = isFormerMember ? "Former" : "Active";
  const reportsTo =
    managerName && member.role !== "owner" && !isFormerMember
      ? managerName
      : member.role === "owner" && !isFormerMember
        ? "Workspace owner"
        : "—";

  return (
    <div className="enterprise-team-profile enterprise-team-profile--wd" data-testid="team-member-profile">
      {onBack ? (
        <button type="button" className="enterprise-team-profile-back" onClick={onBack}>
          ← Back to team
        </button>
      ) : null}

      <div className="enterprise-team-profile-wd-layout">
        <aside className="enterprise-team-profile-rail">
          <div className="enterprise-team-profile-rail-identity">
            <UserAvatar
              user={member.user}
              className="enterprise-team-profile-avatar enterprise-team-profile-avatar--wd"
              alt={displayName}
            />
            <h2 className="enterprise-team-profile-rail-name">
              {displayName}
              {isSelf ? " (You)" : ""}
            </h2>
            {canManage && !isSelf ? (
              <button type="button" className="enterprise-team-profile-rail-manage" onClick={onManage}>
                Manage
              </button>
            ) : null}
          </div>

          {!isFormerMember ? (
            <nav className="enterprise-team-profile-rail-nav" aria-label="Member profile sections">
              {ALL_SECTIONS.map((item) => {
                const soon = COMING_SOON_SECTIONS.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`enterprise-team-profile-rail-nav-item${section === item ? " is-active" : ""}${soon ? " is-soon" : ""}`}
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
        </aside>

        <div className="enterprise-team-profile-wd-main">
          <section className="enterprise-team-profile-wd-summary" aria-label="Member summary">
            <div className="enterprise-team-profile-wd-summary-cell">
              <span className="enterprise-team-profile-wd-summary-label">Manager</span>
              <div className="enterprise-team-profile-wd-summary-value">
                <span className="enterprise-team-profile-wd-summary-icon" aria-hidden>
                  <IconUser />
                </span>
                <span className={reportsTo !== "—" ? "enterprise-team-profile-wd-linkish" : undefined}>{reportsTo}</span>
              </div>
            </div>
            <div className="enterprise-team-profile-wd-summary-cell">
              <span className="enterprise-team-profile-wd-summary-label">Team</span>
              <div className="enterprise-team-profile-wd-summary-value">
                <span className="enterprise-team-profile-wd-summary-icon" aria-hidden>
                  <IconOrg />
                </span>
                <span className="enterprise-team-profile-wd-linkish">{teamName || "—"}</span>
              </div>
            </div>
            <div className="enterprise-team-profile-wd-summary-cell">
              <span className="enterprise-team-profile-wd-summary-label">Status</span>
              <div className="enterprise-team-profile-wd-summary-value">
                <span className="enterprise-team-profile-wd-summary-icon" aria-hidden>
                  <IconBuilding />
                </span>
                <span>
                  {statusLabel}
                  {!isFormerMember ? (
                    <span className="enterprise-team-profile-wd-summary-muted"> · Next check-in {nextCheckIn.value}</span>
                  ) : null}
                </span>
              </div>
            </div>
          </section>

          {contentSection === "Overview" ? (
            <section className="enterprise-team-profile-wd-details" aria-label="Member details">
              <div className="enterprise-team-profile-wd-details-grid">
                <div className="enterprise-team-profile-wd-details-col">
                  <h3 className="enterprise-team-profile-wd-details-title">Member details</h3>
                  <dl className="enterprise-team-profile-wd-kv">
                    <div>
                      <dt>Name</dt>
                      <dd>{displayName}</dd>
                    </div>
                    <div>
                      <dt>Role</dt>
                      <dd>{roleLabel}</dd>
                    </div>
                    <div>
                      <dt>Team</dt>
                      <dd>{teamName || "—"}</dd>
                    </div>
                    <div>
                      <dt>Manager</dt>
                      <dd>{reportsTo}</dd>
                    </div>
                    <div>
                      <dt>Active goals</dt>
                      <dd>{activeDevGoals ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Tasks assigned</dt>
                      <dd>
                        {activeTasks ?? 0}
                        {completedTasks != null ? (
                          <span className="enterprise-team-profile-wd-summary-muted"> · {completedTasks} completed</span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Next check-in</dt>
                      <dd>
                        {nextCheckIn.value}
                        <span className="enterprise-team-profile-wd-summary-muted"> · {nextCheckIn.hint}</span>
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="enterprise-team-profile-wd-details-col">
                  <h3 className="enterprise-team-profile-wd-details-title">Contact information</h3>
                  <div className="enterprise-team-profile-wd-contact">
                    {email ? (
                      <a className="enterprise-team-profile-wd-contact-row" href={`mailto:${email}`}>
                        <IconMail />
                        <span>{email}</span>
                      </a>
                    ) : (
                      <p className="enterprise-muted">No email on file.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="enterprise-team-profile-wd-body">
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
    </div>
  );
}
