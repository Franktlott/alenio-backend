import { prisma } from "../prisma";

export type StaffAuditEntry = {
  actorId: string;
  actorEmail: string | null;
  action: string;
  targetType: "user" | "team" | "organization" | "article" | "category" | "seneca" | "home_insight" | "feed_post" | "notification" | "pricing";
  targetId?: string | null;
  summary: string;
};

/**
 * Records a change made from Admin tools. Best effort: a logging problem must
 * never undo or block the change itself, so failures are reported and swallowed.
 */
export async function recordStaffAction(entry: StaffAuditEntry): Promise<void> {
  try {
    await prisma.staffAuditLog.create({
      data: {
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        summary: entry.summary.slice(0, 500),
      },
    });
  } catch (err) {
    console.error("[staff-audit] could not record", entry.action, err);
  }
}

export async function listStaffActions(params: { limit?: number; before?: Date | null; actorId?: string | null }) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  return prisma.staffAuditLog.findMany({
    where: {
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
