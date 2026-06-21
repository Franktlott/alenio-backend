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
      team: { select: { name: true, image: true } },
    },
  });
}

export type ChecklistResponseItem = { itemId: string; checked: boolean; signerName?: string | null };

export function normalizeSignerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 120);
  return trimmed || null;
}

export function buildSubmissionStats(
  items: { id: string }[],
  responses: ChecklistResponseItem[],
): {
  checkedCount: number;
  totalCount: number;
  isComplete: boolean;
  normalized: ChecklistResponseItem[];
  submitterNames: string[];
} {
  const itemIds = new Set(items.map((i) => i.id));
  const byId = new Map<string, ChecklistResponseItem>();
  for (const r of responses) {
    if (!itemIds.has(r.itemId)) continue;
    byId.set(r.itemId, {
      itemId: r.itemId,
      checked: !!r.checked,
      signerName: normalizeSignerName(r.signerName),
    });
  }
  const normalized = items.map((i) => {
    const row = byId.get(i.id);
    return {
      itemId: i.id,
      checked: row?.checked ?? false,
      signerName: row?.signerName ?? null,
    };
  });
  const checkedCount = normalized.filter((r) => r.checked).length;
  const totalCount = items.length;
  const isComplete = totalCount > 0 && checkedCount === totalCount;
  const submitterNames = [
    ...new Set(normalized.filter((r) => r.checked && r.signerName).map((r) => r.signerName as string)),
  ];
  return { checkedCount, totalCount, isComplete, normalized, submitterNames };
}

/** Checked items must include a signer name. */
export function validateSignedResponses(items: { id: string }[], responses: ChecklistResponseItem[]): string | null {
  const stats = buildSubmissionStats(items, responses);
  for (const row of stats.normalized) {
    if (row.checked && !row.signerName) {
      return "Enter your name and sign off each task before completing the checklist.";
    }
  }
  if (!stats.isComplete) {
    return "Complete every task before finishing the checklist.";
  }
  return null;
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
