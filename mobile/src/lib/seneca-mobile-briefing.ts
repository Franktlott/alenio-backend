import type { WorkspaceSnapshot } from "./seneca-assistant";
import { getSenecaGreeting } from "./seneca-briefing";

export type MobileInsightKind = "follow_up" | "coaching" | "recognition";

export type MobilePriorityInsight = {
  id: string;
  kind: MobileInsightKind;
  label: string;
  message: string;
  detail: string;
  actionLabel: "Review" | "Prepare" | "Celebrate";
  memberUserId?: string;
  memberName?: string;
  chatPrompt: string;
};

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part && part.length > 0 ? part : name;
}

export function managerFirstName(name: string | null | undefined): string | undefined {
  if (!name?.trim()) return undefined;
  return firstName(name);
}

export function buildMobileBriefingHeadlines(
  managerName: string | undefined,
  now = new Date(),
): { salutation: string; tagline: string } {
  const time = getSenecaGreeting(now);
  const who = managerName?.trim() ? firstName(managerName) : "there";
  return {
    salutation: `${time}, ${who}.`,
    tagline: "Here's your leadership brief.",
  };
}

export function buildMobileHeroGreeting(managerName: string | undefined, now = new Date()): string {
  const { salutation, tagline } = buildMobileBriefingHeadlines(managerName, now);
  return `${salutation} ${tagline}`;
}

/** Up to 3 short, scannable priority insights for the mobile home screen. */
export function buildMobilePriorityInsights(snapshot: WorkspaceSnapshot): MobilePriorityInsight[] {
  if (!snapshot.fromLiveData) return [];

  const insights: MobilePriorityInsight[] = [];

  if (snapshot.overdueTasks > 0) {
    insights.push({
      id: "mobile-follow-up",
      kind: "follow_up",
      label: "Follow-up risk",
      message: `${snapshot.overdueTasks} overdue task${snapshot.overdueTasks !== 1 ? "s" : ""} need attention.`,
      detail: "They're past due with no updates.",
      actionLabel: "Review",
      chatPrompt:
        "Walk me through the overdue work on my team — why it matters, what to prioritize, and the best next step.",
    });
  }

  const checkIn = snapshot.memberNeedingCheckIn;
  if (checkIn && insights.length < 3) {
    const member = firstName(checkIn.name);
    insights.push({
      id: `mobile-coaching-${checkIn.userId}`,
      kind: "coaching",
      label: "Coaching opportunity",
      message: `${member} may need support today.`,
      detail: `No check-in in ${checkIn.days} day${checkIn.days !== 1 ? "s" : ""}.`,
      actionLabel: "Prepare",
      memberUserId: checkIn.userId,
      memberName: member,
      chatPrompt: `Help me prepare for a check-in with ${member}. Why does it matter right now, and what should I cover?`,
    });
  } else if (snapshot.membersWithoutRecentCheckIn > 1 && insights.length < 3) {
    insights.push({
      id: "mobile-coaching-stale",
      kind: "coaching",
      label: "Coaching opportunity",
      message: `${snapshot.membersWithoutRecentCheckIn} teammates are due for a check-in.`,
      detail: "Several check-ins are overdue across the team.",
      actionLabel: "Prepare",
      chatPrompt:
        "Several teammates haven't had a recent check-in. Who should I prioritize and how should I prepare?",
    });
  }

  const topPerformer = [...snapshot.memberRows].sort((a, b) => {
    if (b.completedTasksThisMonth !== a.completedTasksThisMonth) {
      return b.completedTasksThisMonth - a.completedTasksThisMonth;
    }
    return b.streak - a.streak;
  })[0];

  if (
    topPerformer &&
    (topPerformer.completedTasksThisMonth > 0 || topPerformer.streak >= 3) &&
    insights.length < 3
  ) {
    const member = firstName(topPerformer.name);
    const detail =
      topPerformer.completedTasksThisMonth > 0
        ? `Completed ${topPerformer.completedTasksThisMonth} task${topPerformer.completedTasksThisMonth !== 1 ? "s" : ""} this month.`
        : topPerformer.streak >= 3
          ? `${topPerformer.streak}-day streak on active goals.`
          : "Strong momentum this month.";
    insights.push({
      id: `mobile-win-${topPerformer.userId}`,
      kind: "recognition",
      label: "Recognition moment",
      message: `${member} is showing strong consistency.`,
      detail,
      actionLabel: "Celebrate",
      memberUserId: topPerformer.userId,
      memberName: member,
      chatPrompt: `${member} is showing strong consistency. Why is this worth recognizing and what's a meaningful way to celebrate it?`,
    });
  } else if (snapshot.recentWin && insights.length < 3) {
    const member = firstName(snapshot.recentWin.name);
    insights.push({
      id: "mobile-recent-win",
      kind: "recognition",
      label: "Recognition moment",
      message: `${member} had a recent win worth celebrating.`,
      detail: "Recent activity stands out on the team feed.",
      actionLabel: "Celebrate",
      chatPrompt: `${member} had a recent win. Help me turn that into meaningful recognition on the team.`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "mobile-all-clear",
      kind: "recognition",
      label: "Team status",
      message: `${snapshot.teamName} looks steady today.`,
      detail: "No urgent follow-ups detected right now.",
      actionLabel: "Celebrate",
      chatPrompt:
        "My team looks steady right now. Who should I recognize or connect with to keep momentum going?",
    });
  }

  return insights.slice(0, 3);
}
