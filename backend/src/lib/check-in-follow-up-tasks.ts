import type { Prisma, PrismaClient } from "@prisma/client";
import { parseFeedbackTaskDescription } from "./one-on-one-feedback";

type MeetingDb = PrismaClient | Prisma.TransactionClient;

export function isOrphanCheckInFollowUpTask(
  task: { oneOnOneMeetingId: string | null; description?: string | null },
  existingMeetingIds: ReadonlySet<string>,
): boolean {
  if (task.oneOnOneMeetingId) {
    return !existingMeetingIds.has(task.oneOnOneMeetingId);
  }
  const meta = parseFeedbackTaskDescription(task.description);
  if (!meta?.meetingId) return false;
  return !existingMeetingIds.has(meta.meetingId);
}

/** Deletes follow-up tasks tied to a check-in, including orphaned feedback tasks. */
export async function deleteCheckInFollowUpTasks(
  db: MeetingDb,
  meetingId: string,
): Promise<number> {
  const linked = await db.task.deleteMany({
    where: { oneOnOneMeetingId: meetingId },
  });

  const maybeOrphans = await db.task.findMany({
    where: {
      oneOnOneMeetingId: null,
      description: { contains: meetingId },
    },
    select: { id: true, description: true, oneOnOneMeetingId: true },
  });
  const orphanIds = maybeOrphans
    .filter((task) => isOrphanCheckInFollowUpTask(task, new Set()))
    .filter((task) => parseFeedbackTaskDescription(task.description)?.meetingId === meetingId)
    .map((task) => task.id);

  let orphanCount = 0;
  if (orphanIds.length > 0) {
    const result = await db.task.deleteMany({ where: { id: { in: orphanIds } } });
    orphanCount = result.count;
  }

  return linked.count + orphanCount;
}

/** Removes leftover "Follow up on …" tasks whose check-in no longer exists. */
export async function purgeOrphanCheckInFollowUpTasks(db: MeetingDb): Promise<number> {
  const candidates = await db.task.findMany({
    where: {
      OR: [
        { oneOnOneMeetingId: { not: null } },
        { description: { contains: "[alenio:oneone-feedback]" } },
      ],
    },
    select: { id: true, description: true, oneOnOneMeetingId: true },
  });
  if (candidates.length === 0) return 0;

  const meetingIds = [
    ...new Set(
      candidates
        .map((task) => task.oneOnOneMeetingId ?? parseFeedbackTaskDescription(task.description)?.meetingId)
        .filter((id): id is string => !!id),
    ),
  ];
  const meetings =
    meetingIds.length > 0
      ? await db.oneOnOneMeeting.findMany({
          where: { id: { in: meetingIds } },
          select: { id: true },
        })
      : [];
  const existing = new Set(meetings.map((meeting) => meeting.id));
  const orphanIds = candidates
    .filter((task) => isOrphanCheckInFollowUpTask(task, existing))
    .map((task) => task.id);
  if (orphanIds.length === 0) return 0;
  const result = await db.task.deleteMany({ where: { id: { in: orphanIds } } });
  return result.count;
}
