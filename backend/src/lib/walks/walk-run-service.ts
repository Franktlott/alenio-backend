import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma";
import {
  evaluateWalkItemResponse,
  getWalkItemTypeDefinition,
} from "./item-types/registry";
import { serializeWalkTemplate } from "./serialize";
import {
  isScorableItemType,
  isWalkItemType,
  type WalkItemResponseStatus,
  type WalkItemType,
} from "./types";

const templateInclude = {
  sections: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      items: {
        orderBy: { sortOrder: "asc" as const },
        include: { correctiveActions: { orderBy: { position: "asc" as const } } },
      },
    },
  },
  items: {
    where: { sectionId: null },
    orderBy: { sortOrder: "asc" as const },
    include: { correctiveActions: { orderBy: { position: "asc" as const } } },
  },
};

type SnapshotItem = {
  id: string;
  sectionId: string | null;
  type: string;
  title: string;
  description: string | null;
  instructions: string | null;
  position: number;
  required: boolean;
  config: Record<string, unknown>;
};

type SnapshotSection = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  items: SnapshotItem[];
};

type TemplateSnapshot = {
  id: string;
  name: string;
  description: string | null;
  workplace: string;
  scoringEnabled: boolean;
  version: number;
  sections: SnapshotSection[];
  unsectionedItems: SnapshotItem[];
};

function asSnapshot(template: ReturnType<typeof serializeWalkTemplate>): TemplateSnapshot {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    workplace: template.workplace,
    scoringEnabled: template.scoringEnabled,
    version: template.version,
    sections: template.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      position: s.position,
      items: s.items.map((i) => ({
        id: i.id,
        sectionId: i.sectionId,
        type: i.type,
        title: i.title,
        description: i.description,
        instructions: i.instructions,
        position: i.position,
        required: i.required,
        config: i.config,
      })),
    })),
    unsectionedItems: (template.unsectionedItems ?? []).map((i) => ({
      id: i.id,
      sectionId: i.sectionId,
      type: i.type,
      title: i.title,
      description: i.description,
      instructions: i.instructions,
      position: i.position,
      required: i.required,
      config: i.config,
    })),
  };
}

export function flattenSnapshotItems(snapshot: TemplateSnapshot): SnapshotItem[] {
  const fromSections = [...snapshot.sections]
    .sort((a, b) => a.position - b.position)
    .flatMap((s) => [...s.items].sort((a, b) => a.position - b.position));
  const loose = [...snapshot.unsectionedItems].sort((a, b) => a.position - b.position);
  return [...fromSections, ...loose];
}

function parseSnapshot(raw: unknown): TemplateSnapshot {
  return raw as TemplateSnapshot;
}

export function serializeWalkRun(run: {
  id: string;
  teamId: string;
  templateId: string;
  templateVersion: number;
  templateSnapshot: unknown;
  status: string;
  startedByUserId: string | null;
  startedByName: string | null;
  deviceId: string | null;
  isTest: boolean;
  testSessionId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  score: number | null;
  createdAt: Date;
  updatedAt: Date;
  responses?: Array<{
    id: string;
    runId: string;
    itemId: string;
    itemType: string;
    status: string;
    response: unknown;
    failed: boolean;
    notes: string | null;
    photoUrls: unknown;
    completedBy: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  const snapshot = parseSnapshot(run.templateSnapshot);
  const items = flattenSnapshotItems(snapshot);
  const responses = run.responses ?? [];
  const byItem = new Map(responses.map((r) => [r.itemId, r]));

  return {
    id: run.id,
    teamId: run.teamId,
    templateId: run.templateId,
    templateVersion: run.templateVersion,
    status: run.status,
    startedByUserId: run.startedByUserId,
    startedByName: run.startedByName,
    deviceId: run.deviceId,
    isTest: run.isTest,
    testSessionId: run.testSessionId,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    score: run.score,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    template: snapshot,
    items: items.map((item) => {
      const resp = byItem.get(item.id);
      return {
        ...item,
        response: resp
          ? {
              id: resp.id,
              status: resp.status,
              response: resp.response,
              failed: resp.failed,
              notes: resp.notes,
              photoUrls: resp.photoUrls,
              completedBy: resp.completedBy,
              completedAt: resp.completedAt?.toISOString() ?? null,
            }
          : null,
      };
    }),
    progress: {
      total: items.filter((i) => i.type !== "INSTRUCTION").length,
      answered: responses.filter((r) => r.status !== "NOT_STARTED").length,
      requiredRemaining: items.filter((i) => {
        if (!i.required || i.type === "INSTRUCTION") return false;
        const resp = byItem.get(i.id);
        return !resp || resp.status === "NOT_STARTED" || resp.status === "NEEDS_ACTION";
      }).length,
    },
  };
}

export async function listPublishedWalkTemplates(teamId: string) {
  const rows = await prisma.walkTemplate.findMany({
    where: { teamId, status: "PUBLISHED", isActive: true },
    orderBy: { updatedAt: "desc" },
    include: templateInclude,
  });
  return rows.map((row) => serializeWalkTemplate(row, { includeItemsLoose: true }));
}

export async function startWalkRun(input: {
  teamId: string;
  templateId: string;
  startedByUserId?: string | null;
  startedByName?: string | null;
  deviceId?: string | null;
  isTest?: boolean;
  testSessionId?: string | null;
}) {
  const template = await prisma.walkTemplate.findFirst({
    where: { id: input.templateId, teamId: input.teamId },
    include: templateInclude,
  });
  if (!template) return { error: "NOT_FOUND" as const };
  if (template.status !== "PUBLISHED") {
    return { error: "NOT_PUBLISHED" as const, message: "Only published walks can be started" };
  }

  const serialized = serializeWalkTemplate(template, { includeItemsLoose: true });
  const snapshot = asSnapshot(serialized);
  const items = flattenSnapshotItems(snapshot);
  if (items.length === 0) {
    return { error: "EMPTY_WALK" as const, message: "This walk has no items yet" };
  }

  const run = await prisma.walkRun.create({
    data: {
      teamId: input.teamId,
      templateId: template.id,
      templateVersion: template.version,
      templateSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      status: "IN_PROGRESS",
      startedByUserId: input.startedByUserId ?? null,
      startedByName: input.startedByName ?? null,
      deviceId: input.deviceId ?? null,
      isTest: input.isTest ?? false,
      testSessionId: input.testSessionId ?? null,
      responses: {
        create: items.map((item) => ({
          itemId: item.id,
          itemType: item.type,
          status: "NOT_STARTED",
          failed: false,
        })),
      },
    },
    include: { responses: true },
  });

  return { ok: true as const, run: serializeWalkRun(run) };
}

export async function getWalkRun(teamId: string, runId: string) {
  const run = await prisma.walkRun.findFirst({
    where: { id: runId, teamId },
    include: { responses: true },
  });
  if (!run) return null;
  return serializeWalkRun(run);
}

export async function submitWalkItemResponse(input: {
  teamId: string;
  runId: string;
  itemId: string;
  response: unknown;
  notes?: string | null;
  photoUrls?: string[] | null;
  completedBy?: string | null;
}) {
  const run = await prisma.walkRun.findFirst({
    where: { id: input.runId, teamId: input.teamId },
    include: { responses: true },
  });
  if (!run) return { error: "NOT_FOUND" as const };
  if (run.status !== "IN_PROGRESS") {
    return { error: "RUN_CLOSED" as const, message: "This walk is already closed" };
  }

  const snapshot = parseSnapshot(run.templateSnapshot);
  const item = flattenSnapshotItems(snapshot).find((i) => i.id === input.itemId);
  if (!item) return { error: "ITEM_NOT_FOUND" as const, message: "Item not found on this walk" };
  if (!isWalkItemType(item.type)) {
    return { error: "INVALID_TYPE" as const, message: "Unsupported item type" };
  }

  const def = getWalkItemTypeDefinition(item.type);
  if (!def?.fullySupported) {
    return { error: "UNSUPPORTED_TYPE" as const, message: `${item.type} is not runnable yet` };
  }

  const parsedResponse = def.responseSchema.safeParse(input.response);
  if (!parsedResponse.success) {
    return {
      error: "INVALID_RESPONSE" as const,
      message: parsedResponse.error.issues[0]?.message ?? "Invalid response",
    };
  }

  let status: WalkItemResponseStatus;
  try {
    status = evaluateWalkItemResponse(item.type as WalkItemType, item.config, parsedResponse.data);
  } catch (err) {
    return {
      error: "EVAL_FAILED" as const,
      message: err instanceof Error ? err.message : "Could not evaluate response",
    };
  }

  const photoUrls =
    input.photoUrls ??
    (parsedResponse.data &&
    typeof parsedResponse.data === "object" &&
    Array.isArray((parsedResponse.data as { photoUrls?: unknown }).photoUrls)
      ? ((parsedResponse.data as { photoUrls: string[] }).photoUrls)
      : null);

  const existing = run.responses.find((r) => r.itemId === input.itemId);
  const data = {
    itemType: item.type,
    status,
    response: parsedResponse.data as Prisma.InputJsonValue,
    failed: status === "FAIL" || status === "NEEDS_ACTION",
    notes: input.notes ?? null,
    photoUrls: (photoUrls ?? undefined) as Prisma.InputJsonValue | undefined,
    completedBy: input.completedBy ?? null,
    completedAt: new Date(),
  };

  if (existing) {
    await prisma.walkItemResponse.update({ where: { id: existing.id }, data });
  } else {
    await prisma.walkItemResponse.create({
      data: {
        runId: run.id,
        itemId: item.id,
        ...data,
      },
    });
  }

  const updated = await getWalkRun(input.teamId, input.runId);
  return { ok: true as const, run: updated };
}

/** Pure helper for completion gating (also used in unit tests). */
export function findIncompleteRequiredItems(
  items: SnapshotItem[],
  responses: Array<{ itemId: string; status: string }>,
): SnapshotItem[] {
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  return items.filter((item) => {
    if (!item.required || item.type === "INSTRUCTION") return false;
    const resp = byItem.get(item.id);
    return !resp || resp.status === "NOT_STARTED" || resp.status === "NEEDS_ACTION";
  });
}

export function scoreWalkRun(
  items: SnapshotItem[],
  responses: Array<{ itemId: string; status: string }>,
): number | null {
  const byItem = new Map(responses.map((r) => [r.itemId, r]));
  let scored = 0;
  let passed = 0;
  for (const item of items) {
    if (!isWalkItemType(item.type) || !isScorableItemType(item.type)) continue;
    const resp = byItem.get(item.id);
    if (!resp || resp.status === "NOT_STARTED" || resp.status === "NOT_APPLICABLE") continue;
    scored += 1;
    if (resp.status === "PASS" || resp.status === "RESOLVED") passed += 1;
  }
  return scored > 0 ? Math.round((passed / scored) * 100) : null;
}

export async function completeWalkRun(teamId: string, runId: string) {
  const run = await prisma.walkRun.findFirst({
    where: { id: runId, teamId },
    include: { responses: true },
  });
  if (!run) return { error: "NOT_FOUND" as const };
  if (run.status !== "IN_PROGRESS") {
    return { error: "RUN_CLOSED" as const, message: "This walk is already closed" };
  }

  const snapshot = parseSnapshot(run.templateSnapshot);
  const items = flattenSnapshotItems(snapshot);
  const incomplete = findIncompleteRequiredItems(items, run.responses);
  if (incomplete[0]) {
    return {
      error: "INCOMPLETE" as const,
      message: `Required item still needs a response: ${incomplete[0].title}`,
    };
  }

  const score = scoreWalkRun(items, run.responses);

  const updated = await prisma.walkRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      score,
    },
    include: { responses: true },
  });

  return { ok: true as const, run: serializeWalkRun(updated) };
}
