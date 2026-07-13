import { prisma } from "../prisma";
import {
  billingProviderFromSubscription,
  getTeamSubscription,
} from "../routes/subscription";

export type AccountDeletionIssueCode =
  | "multi_member_owner"
  | "active_web_billing"
  | "mobile_store_billing";

export type AccountDeletionIssue = {
  code: AccountDeletionIssueCode;
  message: string;
  teamId: string;
  teamName: string;
  blocking: boolean;
};

export type AccountDeletionReadiness = {
  canDelete: boolean;
  issues: AccountDeletionIssue[];
};

function isActivePaidTeamPlan(sub: {
  plan: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
}): boolean {
  const plan = (sub.plan ?? "free").trim().toLowerCase();
  if (!["team", "pro", "operations"].includes(plan)) return false;
  const status = (sub.status ?? "active").trim().toLowerCase();
  if (!["active", "trialing", "past_due"].includes(status)) return false;
  if (sub.cancelAtPeriodEnd === true) return false;
  return true;
}

export async function getAccountDeletionReadiness(userId: string): Promise<AccountDeletionReadiness> {
  const ownedMemberships = await prisma.teamMember.findMany({
    where: { userId, role: "owner" },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
        },
      },
    },
  });

  const issues: AccountDeletionIssue[] = [];

  for (const membership of ownedMemberships) {
    const team = membership.team;
    const teamId = team.id;
    const teamName = team.name;
    const memberCount = team._count.members;
    const otherMembers = Math.max(0, memberCount - 1);

    if (otherMembers > 0) {
      issues.push({
        code: "multi_member_owner",
        message: `Transfer ownership of "${teamName}" to another member (or remove other members) before deleting your account.`,
        teamId,
        teamName,
        blocking: true,
      });
    }

    const subscription = await getTeamSubscription(teamId);
    const billingProvider = billingProviderFromSubscription(subscription);
    const paidActive = isActivePaidTeamPlan(subscription);

    if (paidActive && (billingProvider === "stripe" || billingProvider === "mobile_store")) {
      issues.push({
        code: billingProvider === "stripe" ? "active_web_billing" : "mobile_store_billing",
        message: `Cancel the Pro plan for "${teamName}" in Plan & Access (or the web billing dashboard) before deleting your account.`,
        teamId,
        teamName,
        blocking: true,
      });
    }
  }

  return {
    canDelete: !issues.some((issue) => issue.blocking),
    issues,
  };
}

export async function assertAccountDeletionAllowed(userId: string): Promise<void> {
  const readiness = await getAccountDeletionReadiness(userId);
  if (readiness.canDelete) return;

  const first = readiness.issues.find((issue) => issue.blocking);
  throw new Error(first?.message ?? "Account cannot be deleted until workspace obligations are resolved.");
}
