import { prisma } from "../prisma";

const GROUPABLE_TYPES = ["task_assigned", "calendar_event_added"] as const;
type GroupableType = (typeof GROUPABLE_TYPES)[number];

function isGroupableType(type: string): type is GroupableType {
  return GROUPABLE_TYPES.includes(type as GroupableType);
}

export async function logActivity(params: {
  teamId: string;
  userId?: string;
  type: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isGroupableType(params.type)) {
    // Non-groupable types: always create a new record
    await prisma.teamActivity.create({
      data: {
        teamId: params.teamId,
        userId: params.userId ?? null,
        type: params.type,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
    return;
  }

  // For groupable types, look for an existing record within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const existing = await prisma.teamActivity.findFirst({
    where: {
      teamId: params.teamId,
      userId: params.userId ?? null,
      type: params.type,
      createdAt: { gte: oneHourAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    // Merge into the existing record
    const existingMeta = existing.metadata
      ? (JSON.parse(existing.metadata as string) as Record<string, unknown>)
      : {};

    let updatedMeta: Record<string, unknown>;

    if (params.type === "task_assigned") {
      const newTitle = (params.metadata?.taskTitles as string[] | undefined)?.[0] ?? "";
      const existingTitles = (existingMeta.taskTitles as string[] | undefined) ?? [];
      const existingCount = (existingMeta.taskCount as number | undefined) ?? existingTitles.length;
      const updatedTitles = [...existingTitles, newTitle].filter(Boolean);
      updatedMeta = {
        ...existingMeta,
        taskTitles: updatedTitles,
        taskCount: existingCount + 1,
        assigneeName: params.metadata?.assigneeName ?? existingMeta.assigneeName ?? "",
      };
    } else {
      // calendar_event_added
      const newTitle = (params.metadata?.eventTitles as string[] | undefined)?.[0] ?? "";
      const existingTitles = (existingMeta.eventTitles as string[] | undefined) ?? [];
      const existingCount = (existingMeta.eventCount as number | undefined) ?? existingTitles.length;
      const updatedTitles = [...existingTitles, newTitle].filter(Boolean);
      updatedMeta = {
        ...existingMeta,
        eventTitles: updatedTitles,
        eventCount: existingCount + 1,
      };
    }

    await prisma.teamActivity.update({
      where: { id: existing.id },
      data: { metadata: JSON.stringify(updatedMeta) },
    });
  } else {
    // No recent record found — create a new one
    await prisma.teamActivity.create({
      data: {
        teamId: params.teamId,
        userId: params.userId ?? null,
        type: params.type,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  }
}
