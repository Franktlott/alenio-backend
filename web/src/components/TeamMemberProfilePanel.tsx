import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WebTeamMemberRow } from "../lib/api";
import {
  frequencyToDays,
  type MemberStandardsCompliance,
  type WorkplaceStandards,
} from "../lib/workplace-standards";
import { DevelopmentPlanTab } from "./DevelopmentPlanTab";
import { MemberProfileHeader } from "./MemberProfileHeader";
import { OneOnOneHistoryTab } from "./OneOnOneHistoryTab";
import { ProfileOverviewTab } from "./ProfileOverviewTab";
import { RecognitionTab } from "./RecognitionTab";
import { UserAvatar } from "./UserAvatar";

type ProfileSection =
  | "Overview"
  | "Check-ins"
  | "Development"
  | "Recognition"
  | "Timeline"
  | "Settings";

const COMING_SOON_SECTIONS: ProfileSection[] = ["Timeline", "Settings"];

const NAV_GROUPS: { label: string | null; items: ProfileSection[] }[] = [
  { label: null, items: ["Overview"] },
  { label: "PERFORMANCE", items: ["Check-ins", "Development", "Recognition"] },
  { label: "HISTORY", items: ["Timeline"] },
  { label: "SETTINGS", items: ["Settings"] },
];

type Props = {
  teamId: string;
  teamName?: string | null;
  member: WebTeamMemberRow;
  isSelf: boolean;
  currentUserId?: string;
  isFormerMember?: boolean;
  managerName: string | null;
  leaderUserId: string | null;
  roleLabel: string;
  roleBadgeClass: string;
  canManage: boolean;
  canCreateOneOne: boolean;
  canCreateDevGoal: boolean;
  canAddDevNotes: boolean;
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
  ownerEmail?: string | null;
  canModerateRecognitions?: boolean;
  onSectionChange?: (section: ProfileSection) => void;
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
  Timeline: <IconNavTimeline />,
  Settings: <IconNavSettings />,
};

export function TeamMemberProfilePanel({
  teamId,
  teamName,
  member,
  isSelf,
  currentUserId,
  isFormerMember = false,
  managerName,
  leaderUserId,
  roleLabel,
  roleBadgeClass,
  canManage,
  canCreateOneOne,
  canCreateDevGoal,
  canAddDevNotes,
  activeTasks: _activeTasks,
  completedTasks: _completedTasks,
  activeDevGoals,
  completedDevGoals,
  workplaceStandards,
  standardsCompliance,
  daysSinceLastCheckIn,
  canManageStandards: _canManageStandards,
  onManageStandards: _onManageStandards,
  onBack,
  onManage,
  ownerEmail,
  canModerateRecognitions = false,
  onSectionChange,
}: Props) {
  const [section, setSection] = useState<ProfileSection>("Overview");
  const displayName = member.user.name ?? member.user.email ?? "Member";
  const resolvedCurrentUserId = currentUserId ?? (isSelf ? member.userId : undefined);

  useEffect(() => {
    setSection(isFormerMember ? "Check-ins" : "Overview");
  }, [isFormerMember, member.userId]);

  useEffect(() => {
    onSectionChange?.(section);
  }, [section, onSectionChange]);

  const selectSection = (item: ProfileSection) => {
    setSection(item);
    onSectionChange?.(item);
  };

  const nextCheckIn = useMemo(
    () => nextCheckInLabel(workplaceStandards, daysSinceLastCheckIn, standardsCompliance),
    [workplaceStandards, daysSinceLastCheckIn, standardsCompliance],
  );

  const lastActiveLabel = useMemo(() => {
    if (daysSinceLastCheckIn == null) return null;
    if (daysSinceLastCheckIn === 0) return "Today";
    if (daysSinceLastCheckIn === 1) return "Yesterday";
    if (daysSinceLastCheckIn < 7) return `${daysSinceLastCheckIn}d ago`;
    if (daysSinceLastCheckIn < 30) return `${Math.floor(daysSinceLastCheckIn / 7)}w ago`;
    return `${daysSinceLastCheckIn}d ago`;
  }, [daysSinceLastCheckIn]);

  const contentSection = section;
  const showProfileHeader = !isFormerMember;

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
              {NAV_GROUPS.map((group) => (
                <div key={group.label ?? "top"} className="enterprise-team-profile-rail-nav-group">
                  {group.label ? (
                    <p className="enterprise-team-profile-rail-nav-group-label">{group.label}</p>
                  ) : null}
                  {group.items.map((item) => {
                    const soon = COMING_SOON_SECTIONS.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`enterprise-team-profile-rail-nav-item${section === item ? " is-active" : ""}${soon ? " is-soon" : ""}`}
                        aria-selected={section === item}
                        disabled={soon}
                        title={soon ? "Coming soon" : undefined}
                        onClick={() => selectSection(item)}
                      >
                        <span className="enterprise-team-profile-rail-nav-icon" aria-hidden>
                          {SECTION_ICONS[item]}
                        </span>
                        <span>{item}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          ) : null}
        </aside>

        <div
          className={`enterprise-team-profile-wd-main${showProfileHeader ? " enterprise-team-profile-wd-main--profile-chrome enterprise-team-profile-wd-main--unified" : ""}`}
        >
          {showProfileHeader ? (
            <MemberProfileHeader
              displayName={displayName}
              isSelf={isSelf}
              roleLabel={roleLabel}
              roleBadgeClass={roleBadgeClass}
              joinedAt={member.joinedAt ?? null}
              lastActiveLabel={lastActiveLabel}
              standardsCompliance={standardsCompliance}
              onCheckIn={() => selectSection("Check-ins")}
              onRecognition={() => selectSection("Recognition")}
              onGoal={() => selectSection("Development")}
            />
          ) : null}
          <div className="enterprise-team-profile-wd-body">
            {contentSection === "Overview" ? (
              <ProfileOverviewTab
                teamId={teamId}
                memberUserId={member.userId}
                isSelf={isSelf}
                canCreateDevGoal={canCreateDevGoal}
                workplaceStandards={workplaceStandards}
                standardsCompliance={standardsCompliance}
                daysSinceLastCheckIn={daysSinceLastCheckIn}
                onOpenGrowthTab={() => selectSection("Development")}
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
            ) : contentSection === "Recognition" ? (
              <RecognitionTab
                teamId={teamId}
                currentUserId={resolvedCurrentUserId}
                memberUserId={member.userId}
                isSelf={isSelf}
                canDelete={canModerateRecognitions}
                ownerEmail={ownerEmail}
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
