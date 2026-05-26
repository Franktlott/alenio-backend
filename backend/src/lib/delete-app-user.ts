import { prisma } from "../prisma";
import { deleteAllUserStorageObjects } from "./firebase-storage";
import { deleteNeonAuthUser } from "./delete-neon-auth-user";

/**
 * Permanently deletes a user: Neon Auth identity first, then app data in Postgres + Storage.
 */
export async function deleteAppUserCompletely(userId: string): Promise<void> {
  await deleteNeonAuthUser(userId);

  await prisma.pollVote.deleteMany({ where: { userId } });
  await prisma.poll.deleteMany({ where: { createdById: userId } });
  await prisma.directMessage.deleteMany({ where: { senderId: userId } });
  await prisma.message.deleteMany({ where: { senderId: userId } });
  await prisma.topic.deleteMany({ where: { createdById: userId } });
  await prisma.taskTemplate.deleteMany({ where: { createdById: userId } });
  await prisma.task.deleteMany({ where: { creatorId: userId } });
  await deleteAllUserStorageObjects(userId);
  await prisma.user.delete({ where: { id: userId } });
}
