import { prisma } from "../prisma";
import { deleteAllUserStorageObjects } from "./firebase-storage";
import { deleteNeonAuthUser } from "./delete-neon-auth-user";
import { assertAccountDeletionAllowed } from "./account-deletion-readiness";
import { deleteWorkspaceCompletely } from "./delete-workspace";

/**
 * Permanently deletes a user: app rows in Postgres, storage, then Neon Auth.
 * Ensures the `User` record is removed after clearing FK-restricted relations.
 */
export async function deleteAppUserCompletely(userId: string): Promise<void> {
  await assertAccountDeletionAllowed(userId);

  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) return;

  const ownedTeams = await prisma.teamMember.findMany({
    where: { userId, role: "owner" },
    select: { teamId: true },
  });
  for (const { teamId } of ownedTeams) {
    const memberCount = await prisma.teamMember.count({ where: { teamId } });
    if (memberCount === 1) {
      await deleteWorkspaceCompletely(teamId);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.pollVote.deleteMany({ where: { userId } });
      await tx.poll.deleteMany({ where: { createdById: userId } });

      await tx.task.deleteMany({ where: { creatorId: userId } });
      await tx.taskTemplate.deleteMany({ where: { createdById: userId } });

      await tx.oneOnOneMeeting.deleteMany({
        where: { OR: [{ createdById: userId }, { memberUserId: userId }] },
      });
      await tx.oneOnOneTemplate.deleteMany({ where: { createdById: userId } });

      await tx.developmentGoalNote.deleteMany({ where: { createdById: userId } });
      await tx.developmentGoal.deleteMany({
        where: { OR: [{ createdById: userId }, { memberUserId: userId }] },
      });

      await tx.message.deleteMany({ where: { senderId: userId } });
      await tx.directMessage.deleteMany({ where: { senderId: userId } });
      await tx.topic.deleteMany({ where: { createdById: userId } });
      await tx.calendarEvent.deleteMany({ where: { createdById: userId } });
      await tx.teamActivityReaction.deleteMany({ where: { userId } });

      await tx.user.delete({ where: { id: userId } });
    },
    { timeout: 60_000 },
  );

  await deleteAllUserStorageObjects(userId);
  await deleteNeonAuthUser(userId);
}
