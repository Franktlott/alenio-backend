import { prisma } from "../../prisma";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function getWalkReportingSummary(
  teamId: string,
  opts?: { from?: Date; to?: Date },
) {
  const from = opts?.from ?? new Date(Date.now() - 30 * 86_400_000);
  const to = opts?.to ?? new Date();

  const [occurrences, runs, responses, openCorrectiveActions] = await Promise.all([
    prisma.walkOccurrence.findMany({
      where: { teamId, windowStart: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        templateId: true,
        score: true,
        completedByUserId: true,
        windowStart: true,
        dueAt: true,
        completedAt: true,
      },
    }),
    prisma.walkRun.findMany({
      where: { teamId, startedAt: { gte: from, lte: to }, status: "COMPLETED" },
      select: {
        id: true,
        templateId: true,
        score: true,
        startedByUserId: true,
        startedByName: true,
        completedAt: true,
        templateSnapshot: true,
      },
    }),
    prisma.walkItemResponse.findMany({
      where: {
        run: { teamId, startedAt: { gte: from, lte: to } },
        status: { not: "NOT_STARTED" },
      },
      select: {
        id: true,
        itemId: true,
        itemType: true,
        status: true,
        failed: true,
        response: true,
        photoUrls: true,
        notes: true,
        runId: true,
        run: { select: { templateId: true, templateSnapshot: true, startedAt: true } },
      },
    }),
    prisma.walkCorrectiveActionResult.count({
      where: {
        status: "PENDING",
        itemResponse: { run: { teamId } },
      },
    }),
  ]);

  const occTotal = occurrences.length;
  const completed = occurrences.filter((o) =>
    o.status === "COMPLETED" || o.status === "COMPLETED_LATE",
  ).length;
  const onTime = occurrences.filter((o) => o.status === "COMPLETED").length;
  const missed = occurrences.filter((o) => o.status === "MISSED").length;
  const late = occurrences.filter((o) => o.status === "COMPLETED_LATE").length;

  const byItem = new Map<
    string,
    {
      libraryItemId: string | null;
      title: string;
      type: string;
      total: number;
      failed: number;
      pass: number;
      walkIds: Set<string>;
    }
  >();

  for (const resp of responses) {
    const snapshot = asRecord(resp.run.templateSnapshot);
    const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
    const loose = Array.isArray(snapshot.unsectionedItems) ? snapshot.unsectionedItems : [];
    const allItems = [
      ...sections.flatMap((s) => {
        const sec = asRecord(s);
        return Array.isArray(sec.items) ? sec.items : [];
      }),
      ...loose,
    ];
    const snapItem = allItems.map(asRecord).find((i) => i.id === resp.itemId);
    const libraryItemId =
      typeof snapItem?.libraryItemId === "string" ? snapItem.libraryItemId : null;
    const title = typeof snapItem?.title === "string" ? snapItem.title : resp.itemId;
    const key = libraryItemId ?? `legacy:${resp.itemId}`;
    const cur = byItem.get(key) ?? {
      libraryItemId,
      title,
      type: resp.itemType,
      total: 0,
      failed: 0,
      pass: 0,
      walkIds: new Set<string>(),
    };
    cur.total += 1;
    if (resp.failed || resp.status === "FAIL" || resp.status === "NEEDS_ACTION") cur.failed += 1;
    if (resp.status === "PASS" || resp.status === "RESOLVED") cur.pass += 1;
    cur.walkIds.add(resp.run.templateId);
    byItem.set(key, cur);
  }

  const temperatureTrends = responses
    .filter((r) => r.itemType === "TEMPERATURE" && r.response)
    .map((r) => {
      const body = asRecord(r.response);
      const snapshot = asRecord(r.run.templateSnapshot);
      const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
      const loose = Array.isArray(snapshot.unsectionedItems) ? snapshot.unsectionedItems : [];
      const allItems = [
        ...sections.flatMap((s) => {
          const sec = asRecord(s);
          return Array.isArray(sec.items) ? sec.items : [];
        }),
        ...loose,
      ];
      const snapItem = allItems.map(asRecord).find((i) => i.id === r.itemId);
      return {
        runId: r.runId,
        itemId: r.itemId,
        libraryItemId: typeof snapItem?.libraryItemId === "string" ? snapItem.libraryItemId : null,
        title: typeof snapItem?.title === "string" ? snapItem.title : "Temperature",
        value: typeof body.value === "number" ? body.value : null,
        unit: typeof body.unit === "string" ? body.unit : "F",
        status: r.status,
        at: r.run.startedAt.toISOString(),
        templateId: r.run.templateId,
      };
    })
    .filter((t) => t.value != null);

  const photoNoteHistory = responses
    .filter((r) => {
      const photos = r.photoUrls;
      return r.notes || (Array.isArray(photos) && photos.length > 0) || r.itemType === "PHOTO";
    })
    .slice(0, 100)
    .map((r) => ({
      runId: r.runId,
      itemId: r.itemId,
      itemType: r.itemType,
      status: r.status,
      notes: r.notes,
      photoUrls: r.photoUrls,
      templateId: r.run.templateId,
      at: r.run.startedAt.toISOString(),
    }));

  const byPerson = new Map<string, { userId: string | null; name: string; completed: number }>();
  for (const run of runs) {
    const key = run.startedByUserId ?? run.startedByName ?? "unknown";
    const cur = byPerson.get(key) ?? {
      userId: run.startedByUserId,
      name: run.startedByName ?? run.startedByUserId ?? "Unknown",
      completed: 0,
    };
    cur.completed += 1;
    byPerson.set(key, cur);
  }

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    completion: {
      occurrenceTotal: occTotal,
      completed,
      onTime,
      late,
      missed,
      completionRate: occTotal > 0 ? Math.round((completed / occTotal) * 100) : 100,
      onTimeRate: completed > 0 ? Math.round((onTime / completed) * 100) : null,
      runsCompleted: runs.length,
    },
    openCorrectiveActions,
    byItem: [...byItem.values()].map((i) => ({
      libraryItemId: i.libraryItemId,
      title: i.title,
      type: i.type,
      total: i.total,
      failed: i.failed,
      pass: i.pass,
      failRate: i.total > 0 ? Math.round((i.failed / i.total) * 100) : 0,
      walkCount: i.walkIds.size,
    })),
    byPerson: [...byPerson.values()].sort((a, b) => b.completed - a.completed),
    temperatureTrends,
    photoNoteHistory,
  };
}
