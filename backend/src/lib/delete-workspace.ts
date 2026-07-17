import { prisma } from "../prisma";
import { deleteStorageObjectByUrlIfOwned } from "./firebase-storage";

/**
 * Permanently removes a workspace and its dependent rows.
 * Explicit cleanup avoids FK / cascade-order failures that surface as opaque 500s.
 */
export async function deleteWorkspaceCompletely(teamId: string): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, image: true },
  });
  if (!team) return;

  await prisma.$transaction(
    async (tx) => {
      // Break self-referential message threads before cascading team delete.
      await tx.message.updateMany({ where: { teamId }, data: { replyToId: null } });

      // Detach follow-up tasks from check-ins before meetings/series are removed.
      await tx.task.updateMany({ where: { teamId }, data: { oneOnOneMeetingId: null } });

      const polls = await tx.poll.findMany({ where: { teamId }, select: { id: true } });
      const pollIds = polls.map((p) => p.id);
      if (pollIds.length > 0) {
        await tx.pollVote.deleteMany({ where: { pollId: { in: pollIds } } });
        await tx.pollOption.deleteMany({ where: { pollId: { in: pollIds } } });
        await tx.poll.deleteMany({ where: { id: { in: pollIds } } });
      }

      const conversations = await tx.conversation.findMany({
        where: { teamId },
        select: { id: true },
      });
      const conversationIds = conversations.map((c) => c.id);
      if (conversationIds.length > 0) {
        await tx.directMessageReaction.deleteMany({
          where: { directMessage: { conversationId: { in: conversationIds } } },
        });
        await tx.directMessage.updateMany({
          where: { conversationId: { in: conversationIds } },
          data: { replyToId: null },
        });
        await tx.directMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
        await tx.conversationParticipant.deleteMany({
          where: { conversationId: { in: conversationIds } },
        });
        await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      }

      await tx.teamActivityReaction.deleteMany({
        where: { activity: { teamId } },
      });
      await tx.teamActivity.deleteMany({ where: { teamId } });

      await tx.developmentGoalNote.deleteMany({
        where: { goal: { teamId } },
      });
      await tx.developmentGoal.deleteMany({ where: { teamId } });

      await tx.oneOnOneMeeting.deleteMany({ where: { teamId } });
      await tx.oneOnOneTemplate.deleteMany({ where: { teamId } });

      await tx.taskAssignment.deleteMany({ where: { task: { teamId } } });
      await tx.subtaskCompletion.deleteMany({ where: { subtask: { task: { teamId } } } });
      await tx.subtask.deleteMany({ where: { task: { teamId } } });
      await tx.recurrenceRule.deleteMany({ where: { task: { teamId } } });
      await tx.task.deleteMany({ where: { teamId } });
      await tx.recurrenceSeries.deleteMany({ where: { teamId } });
      await tx.taskTemplate.deleteMany({ where: { teamId } });

      await tx.messageReaction.deleteMany({ where: { message: { teamId } } });
      await tx.message.deleteMany({ where: { teamId } });
      await tx.topic.deleteMany({ where: { teamId } });

      await tx.calendarEvent.deleteMany({ where: { teamId } });
      await tx.teamInvite.deleteMany({ where: { teamId } });
      await tx.joinRequest.deleteMany({ where: { teamId } });

      await tx.briefingCompletion.deleteMany({ where: { teamId } });
      await tx.briefing.deleteMany({ where: { teamId } });

      await tx.walkCorrectiveActionResult.deleteMany({
        where: { itemResponse: { run: { teamId } } },
      });
      await tx.walkItemResponse.deleteMany({ where: { run: { teamId } } });
      await tx.walkRun.deleteMany({ where: { teamId } });
      await tx.walkCorrectiveAction.deleteMany({
        where: { libraryItemVersion: { libraryItem: { teamId } } },
      });
      await tx.walkCompletion.deleteMany({ where: { teamId } });
      await tx.walkTemplateItem.deleteMany({ where: { template: { teamId } } });
      await tx.walkTemplateSection.deleteMany({ where: { template: { teamId } } });
      await tx.walkTemplate.deleteMany({ where: { teamId } });

      await tx.workplaceAlertAck.deleteMany({
        where: { alert: { teamId } },
      });
      await tx.workplaceAlert.deleteMany({ where: { teamId } });
      await tx.goDevicePresence.deleteMany({ where: { teamId } });
      await tx.goLoginRequest.deleteMany({ where: { teamId } });

      await tx.checklistLocationSubmission.deleteMany({
        where: { location: { teamId } },
      });
      await tx.checklistLocationItem.deleteMany({
        where: { location: { teamId } },
      });
      await tx.checklistLocation.deleteMany({ where: { teamId } });

      await tx.moduleTestSession.deleteMany({ where: { teamId } });
      await tx.workspaceModule.deleteMany({ where: { teamId } });
      await tx.teamSubscription.deleteMany({ where: { teamId } });
      await tx.teamMember.deleteMany({ where: { teamId } });

      await tx.team.delete({ where: { id: teamId } });
    },
    { timeout: 120_000 },
  );

  await deleteStorageObjectByUrlIfOwned(team.image ?? undefined).catch((err) => {
    console.warn("[delete-workspace] storage cleanup failed:", err);
  });
}
