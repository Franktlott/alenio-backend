import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WebTeamMemberRow } from "../lib/api";
import { greetingForHour } from "../lib/alenio-go-dashboard";
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
  | "Recognition"
  | "Feedback"
  | "Timeline"
  | "Documents"
  | "Settings";

const ACTIVE_SECTIONS: ProfileSection[] = ["Overview", "Check-ins", "Development"];
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
  completedDevGoals?: number;
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
): { value: string; hint: string; remaining: number | null } {
  if (!standards?.checkInRequired) return { value: "Not required", hint: "Check-ins optional", remaining: null };
  if (daysSince == null) return { value: "Due", hint: "No check-in yet", remaining: 0 };
  const frequencyDays = frequencyToDays(standards.checkInFrequencyValue, standards.checkInFrequencyUnit);
  const remaining = frequencyDays - daysSince;
  const dueDate = new Date();
  dueDate.setHours(12, 0, 0, 0);
  dueDate.setDate(dueDate.getDate() + Math.max(0, remaining));
  const dueHint = `Due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  if (compliance?.checkInStatus === "overdue" || remaining <= 0) {
    return { value: "Overdue", hint: `${daysSince} days since last`, remaining: 0 };
  }
  if (remaining === 1) return { value: "1 day", hint: dueHint, remaining: 1 };
  return { value: `${remaining} days`, hint: dueHint, remaining };
}

function firstNameFrom(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}

function IconCrown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 17.5 5.5 8l4 4.5L12 6l2.5 6.5L18.5 8 21 17.5H3Zm1.5 1.5h15V21H4.5v-2Z" />
    </svg>
  );
}

function IconMetaManager() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.2-3.2 3.4-4.8 7-4.8s5.8 1.6 7 4.8" />
    </svg>
  );
}

function IconMetaTeam() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19c1-3 2.8-4.5 5.5-4.5S13 16 14 19" />
      <path d="M14.5 14.5c1.6 0 3 .7 4 2.2" />
    </svg>
  );
}

function IconNavOverview() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function IconNavCheckins() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function IconNavDevelopment() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 19h16" />
      <path d="M7 19V9l5-4 5 4v10" />
      <path d="M10 19v-5h4v5" />
    </svg>
  );
}

function IconNavRecognition() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5A2.5 2.5 0 0 0 7 8.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5" />
    </svg>
  );
}

function IconNavFeedback() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 5h16v11H8l-4 4V5Z" />
    </svg>
  );
}

function IconNavTimeline() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
      <path d="M12 7v3M12 14v3" />
    </svg>
  );
}

function IconNavDocuments() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function IconNavSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

const SECTION_ICONS: Record<ProfileSection, ReactNode> = {
  Overview: <IconNavOverview />,
  "Check-ins": <IconNavCheckins />,
  Development: <IconNavDevelopment />,
  Recognition: <IconNavRecognition />,
  Feedback: <IconNavFeedback />,
  Timeline: <IconNavTimeline />,
  Documents: <IconNavDocuments />,
  Settings: <IconNavSettings />,
};

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
  streak,
  activeTasks: _activeTasks,
  completedTasks: _completedTasks,
  activeDevGoals,
  completedDevGoals,
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
  const firstName = firstNameFrom(displayName);

  useEffect(() => {
    setSection(isFormerMember ? "Check-ins" : "Overview");
  }, [isFormerMember, member.userId]);

  const nextCheckIn = useMemo(
    () => nextCheckInLabel(workplaceStandards, daysSinceLastCheckIn, standardsCompliance),
    [workplaceStandards, daysSinceLastCheckIn, standardsCompliance],
  );

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const contentSection = section;
  const statusLabel = isFormerMember ? "Former" : "Active";
  const reportsTo =
    managerName && member.role !== "owner" && !isFormerMember
      ? managerName
      : member.role === "owner" && !isFormerMember
        ? "Workspace owner"
        : "—";

  const headerSubtitle =
    contentSection === "Check-ins"
      ? "Stay consistent. Small check-ins lead to big impact."
      : contentSection === "Development"
        ? "Build skills with clear goals, action steps, and progress notes."
        : contentSection === "Overview"
          ? "Review goals and what’s next for this teammate."
          : "Track growth, goals, and progress over time.";

  const nextDueGreen =
    !isFormerMember &&
    nextCheckIn.remaining != null &&
    nextCheckIn.remaining > 0 &&
    nextCheckIn.value !== "Overdue" &&
    nextCheckIn.value !== "Not required";

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
            <div className="enterprise-team-profile-rail-avatar-wrap">
              <UserAvatar
                user={member.user}
                className="enterprise-team-profile-avatar enterprise-team-profile-avatar--wd"
                alt={displayName}
              />
              {isSelf ? (
                <Link
                  to="/settings"
                  className="enterprise-team-profile-rail-camera"
                  aria-label="Update profile photo in settings"
                  title="Update photo"
                >
                  <IconCamera />
                </Link>
              ) : (
                <span className="enterprise-team-profile-rail-camera is-static" aria-hidden>
                  <IconCamera />
                </span>
              )}
            </div>
            <h2 className="enterprise-team-profile-rail-name">
              {displayName}
              {isSelf ? " (You)" : ""}
            </h2>
            <span className={`enterprise-team-profile-rail-role ${roleBadgeClass}`}>
              <IconCrown />
              {roleLabel}
            </span>
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
                    <span className="enterprise-team-profile-rail-nav-icon" aria-hidden>
                      {SECTION_ICONS[item]}
                    </span>
                    <span>{item}</span>
                  </button>
                );
              })}
            </nav>
          ) : null}
        </aside>

        <div className="enterprise-team-profile-wd-main">
          <section className="enterprise-team-profile-wd-summary" aria-label="Member summary">
            <div className="enterprise-team-profile-wd-greeting">
              <h2 className="enterprise-team-profile-wd-greeting-title">
                {greeting}, {firstName} 👋
              </h2>
              <p className="enterprise-team-profile-wd-greeting-sub">{headerSubtitle}</p>
            </div>
            <div className="enterprise-team-profile-wd-meta">
              <div className="enterprise-team-profile-wd-meta-item">
                <span className="enterprise-team-profile-wd-summary-label">Manager</span>
                <span className="enterprise-team-profile-wd-meta-value enterprise-team-profile-wd-meta-value--manager">
                  <span className="enterprise-team-profile-wd-meta-icon" aria-hidden>
                    <IconMetaManager />
                  </span>
                  <span className={reportsTo !== "—" ? "enterprise-team-profile-wd-linkish" : undefined}>{reportsTo}</span>
                </span>
              </div>
              <div className="enterprise-team-profile-wd-meta-item">
                <span className="enterprise-team-profile-wd-summary-label">Team</span>
                <span className="enterprise-team-profile-wd-meta-value enterprise-team-profile-wd-meta-value--team">
                  <span className="enterprise-team-profile-wd-meta-icon" aria-hidden>
                    <IconMetaTeam />
                  </span>
                  <span className="enterprise-team-profile-wd-linkish">{teamName || "—"}</span>
                </span>
              </div>
              <div className="enterprise-team-profile-wd-meta-item">
                <span className="enterprise-team-profile-wd-summary-label">Status</span>
                <div className="enterprise-team-profile-wd-meta-status">
                  <span
                    className={`enterprise-team-profile-wd-status-pill${isFormerMember ? " is-former" : " is-active"}`}
                  >
                    {statusLabel}
                  </span>
                  {!isFormerMember && nextDueGreen ? (
                    <span className="enterprise-team-profile-wd-next-due">
                      Next check-in due in {nextCheckIn.value}
                    </span>
                  ) : !isFormerMember ? (
                    <span className="enterprise-team-profile-wd-summary-muted">
                      Next check-in {nextCheckIn.value}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

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
                streak={streak}
                activeDevGoals={activeDevGoals}
                completedDevGoals={completedDevGoals}
                daysSinceLastCheckIn={daysSinceLastCheckIn}
                nextCheckInValue={nextCheckIn.value}
                nextCheckInHint={nextCheckIn.hint}
                teamName={teamName ?? undefined}
                isSelf={isSelf}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
