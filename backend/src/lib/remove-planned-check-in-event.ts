import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { canManageCalendarEvent } from "./calendar-permissions";
import { cancelPendingCalendarEventReminders } from "./calendar-event-reminders";
import {
  plannedCheckInTitlesForMember,
  PLANNED_CHECK_IN_TITLE_PREFIXES,
} from "./check-in-event-title";

type Db = Pick<typeof prisma, "calendarEvent" | "teamMember">;

type PlannedEventRow = {
  id: string;
  teamId: string;
  title: string;
  isOneOnOne: boolean;
  oneOnOneMemberUserId: string | null;
  createdById: string;
};

function isPlannedCheckInForMember(
  event: Pick<PlannedEventRow, "isOneOnOne" | "oneOnOneMemberUserId" | "title">,
  memberUserId: string,
  memberLabel: string,
): boolean {
  if (event.oneOnOneMemberUserId && event.oneOnOneMemberUserId !== memberUserId) {
    return false;
  }

  if (event.isOneOnOne && event.oneOnOneMemberUserId === memberUserId) {
    return true;
  }

  const legacyTitles = plannedCheckInTitlesForMember(memberLabel);
  if (legacyTitles.includes(event.title)) {
    return !event.oneOnOneMemberUserId || event.oneOnOneMemberUserId === memberUserId;
  }

  if (
    event.oneOnOneMemberUserId === memberUserId &&
    PLANNED_CHECK_IN_TITLE_PREFIXES.some((prefix) => event.title.startsWith(prefix))
  ) {
    return true;
  }

  return false;
}

export async function removePlannedCheckInCalendarEvent(
  db: Db | Prisma.TransactionClient,
  options: {
    eventId: string;
    teamId: string;
    memberUserId: string;
    actorUserId: string;
    actorRole: string;
  },
): Promise<void> {
  const { eventId, teamId, memberUserId, actorUserId, actorRole } = options;
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      teamId: true,
      title: true,
      isOneOnOne: true,
      oneOnOneMemberUserId: true,
      createdById: true,
    },
  });
  if (!event || event.teamId !== teamId) return;
  if (!canManageCalendarEvent(actorRole, actorUserId, event)) return;

  const member = await db.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
    include: { user: { select: { name: true, email: true } } },
  });
  const memberLabel = member?.user.name?.trim() || member?.user.email?.split("@")[0] || "";
  if (!isPlannedCheckInForMember(event, memberUserId, memberLabel)) return;

  cancelPendingCalendarEventReminders(eventId);
  await db.calendarEvent.delete({ where: { id: eventId } });
}
