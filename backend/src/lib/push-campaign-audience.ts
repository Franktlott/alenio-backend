import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

export const PUSH_AUDIENCES = ["all", "workspace", "paid", "trial"] as const;
export type PushAudienceKind = (typeof PUSH_AUDIENCES)[number];

export type PushAudience = { kind: PushAudienceKind; teamId?: string | null };

/** Paid means a live subscription on a paid plan; trials count separately. */
const PAID_SUBSCRIPTION: Prisma.TeamSubscriptionWhereInput = { status: { in: ["active", "past_due"] }, plan: { not: "free" } };
const TRIAL_SUBSCRIPTION: Prisma.TeamSubscriptionWhereInput = { status: "trialing" };

/**
 * Everyone a campaign is meant for. Staff logins are separate accounts and never receive campaigns.
 * Returns null when the audience can't be resolved (a workspace audience with no workspace).
 */
export function audienceUserWhere(audience: PushAudience): Prisma.UserWhereInput | null {
  const base: Prisma.UserWhereInput = { accountType: { not: "platform_admin" } };
  switch (audience.kind) {
    case "all":
      return base;
    case "workspace":
      if (!audience.teamId) return null;
      return { ...base, teamMembers: { some: { teamId: audience.teamId } } };
    case "paid":
      return { ...base, teamMembers: { some: { team: { subscription: { is: PAID_SUBSCRIPTION } } } } };
    case "trial":
      return { ...base, teamMembers: { some: { team: { subscription: { is: TRIAL_SUBSCRIPTION } } } } };
    default:
      return null;
  }
}

/** The subset that a push can actually reach: has a device token and hasn't turned announcements off. */
export function reachableUserWhere(audience: PushAudience): Prisma.UserWhereInput | null {
  const where = audienceUserWhere(audience);
  if (!where) return null;
  return { ...where, pushToken: { not: null }, notifProductUpdates: true };
}

export async function countPushAudience(audience: PushAudience): Promise<{ total: number; reachable: number }> {
  const all = audienceUserWhere(audience);
  const reachable = reachableUserWhere(audience);
  if (!all || !reachable) return { total: 0, reachable: 0 };
  const [total, reach] = await Promise.all([prisma.user.count({ where: all }), prisma.user.count({ where: reachable })]);
  return { total, reachable: reach };
}

export async function pushAudienceUserIds(audience: PushAudience): Promise<string[]> {
  const where = reachableUserWhere(audience);
  if (!where) return [];
  const rows = await prisma.user.findMany({ where, select: { id: true } });
  return rows.map((row) => row.id);
}
