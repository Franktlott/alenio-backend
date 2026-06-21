import { randomBytes } from "crypto";
import { prisma } from "../prisma";
import { getTeamSubscription } from "../routes/subscription";

export function generateChecklistPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function canManageLocationChecklists(role: string): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

export async function teamHasChecklistPlan(teamId: string): Promise<boolean> {
  const subscription = await getTeamSubscription(teamId);
  return subscription.plan === "team" || subscription.plan === "pro";
}

export async function getTeamMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

export async function findActiveLocationByToken(token: string) {
  return prisma.checklistLocation.findFirst({
    where: { publicToken: token, isActive: true },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export type ChecklistResponseItem = { itemId: string; checked: boolean };

export function buildSubmissionStats(
  items: { id: string }[],
  responses: ChecklistResponseItem[],
): { checkedCount: number; totalCount: number; isComplete: boolean; normalized: ChecklistResponseItem[] } {
  const itemIds = new Set(items.map((i) => i.id));
  const byId = new Map<string, boolean>();
  for (const r of responses) {
    if (itemIds.has(r.itemId)) byId.set(r.itemId, !!r.checked);
  }
  const normalized = items.map((i) => ({ itemId: i.id, checked: byId.get(i.id) ?? false }));
  const checkedCount = normalized.filter((r) => r.checked).length;
  const totalCount = items.length;
  const isComplete = totalCount > 0 && checkedCount === totalCount;
  return { checkedCount, totalCount, isComplete, normalized };
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkPublicSubmissionRateLimit(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const row = rateLimitBuckets.get(key);
  if (!row || now >= row.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= max) return false;
  row.count += 1;
  return true;
}

export function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
