import type { PrismaClient } from "@prisma/client";

/** Completed tasks older than this are moved out of the main Completed list. */
export const TASK_ARCHIVE_AFTER_DAYS = 30;

export function archiveCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - TASK_ARCHIVE_AFTER_DAYS);
  return cutoff;
}

/** Mark old completed tasks as archived for a team (idempotent). */
export async function archiveOldCompletedTasksForTeam(
  prisma: PrismaClient,
  teamId: string,
): Promise<number> {
  const result = await prisma.task.updateMany({
    where: {
      teamId,
      status: "done",
      archivedAt: null,
      completedAt: { lte: archiveCutoffDate() },
    },
    data: { archivedAt: new Date() },
  });
  return result.count;
}
