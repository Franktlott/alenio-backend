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

import { templateInclude } from "./walk-template-service";

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
  libraryItemId?: string | null;
  libraryItemVersionId?: string | null;
  correctiveActions?: Array<{
    id: string;
    actionType: string;
    title: string;
    instructions?: string | null;
    required: boolean;
    blocksCompletion?: boolean;
    position: number;
    config?: Record<string, unknown> | null;
  }>;
};

function correctiveBranch(
  action: { config?: Record<string, unknown> | null },
): "first_failure" | "if_pass" | "if_fail" | null {
  const raw = action.config?.branch;
  if (raw === "first_failure" || raw === "if_pass" || raw === "if_fail") return raw;
  return null;
}

/** If-pass notes are informational — they must not block the associate. */
function isAssociateCorrectiveAction(action: {
  config?: Record<string, unknown> | null;
  actionType?: string;
}): boolean {
  return correctiveBranch(action) !== "if_pass";
}

function isFirstFailureAction(action: { config?: Record<string, unknown> | null }): boolean {
  const branch = correctiveBranch(action);
  return branch === "first_failure" || branch == null;
}

function isIfFailAction(action: { config?: Record<string, unknown> | null }): boolean {
  return correctiveBranch(action) === "if_fail";
}

function responseRetestCount(response: unknown): number {
  if (!response || typeof response !== "object") return 0;
  const count = (response as { retestCount?: unknown }).retestCount;
  return typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

type DbClient = Pick<
  typeof prisma,
  "walkCorrectiveActionResult" | "walkItemResponse"
>;

type OccurrenceWindow = {
  windowStart: Date;
  graceEndsAt: Date;
  status?: string;
};

/** Scheduled Temps checks may only be worked during windowStart → graceEndsAt. */
function assertOccurrenceInWindow(
  occurrence: OccurrenceWindow,
  now = new Date(),
): { ok: true } | { error: "OUTSIDE_WINDOW"; message: string } {
  if (now < occurrence.windowStart) {
    return {
      error: "OUTSIDE_WINDOW" as const,
      message: "This check hasn’t opened yet",
    };
  }
  if (now > occurrence.graceEndsAt) {
    return {
      error: "OUTSIDE_WINDOW" as const,
      message: "This check window has closed",
    };
  }
  return { ok: true as const };
}

/** Ad-hoc runs (no occurrence) are unrestricted; scheduled runs must be in window. */
async function assertRunOccurrenceInWindow(
  teamId: string,
  runId: string,
): Promise<{ ok: true } | { error: "OUTSIDE_WINDOW"; message: string }> {
  const occurrence = await prisma.walkOccurrence.findFirst({
    where: { teamId, runId },
    select: { windowStart: true, graceEndsAt: true, status: true },
  });
  if (!occurrence) return { ok: true as const };
  return assertOccurrenceInWindow(occurrence);
}

async function upsertPendingCorrectiveResults(
  db: DbClient,
  itemResponseId: string,
  actions: NonNullable<SnapshotItem["correctiveActions"]>,
) {
  for (const action of actions) {
    await db.walkCorrectiveActionResult.upsert({
      where: {
        itemResponseId_correctiveActionId: {
          itemResponseId,
          correctiveActionId: action.id,
        },
      },
      create: {
        itemResponseId,
        correctiveActionId: action.id,
        status: "PENDING",
      },
      update: {},
    });
  }
}

async function skipPendingCorrectiveResults(
  db: DbClient,
  itemResponseId: string,
  actionIds: string[],
) {
  if (actionIds.length === 0) return;
  await db.walkCorrectiveActionResult.updateMany({
    where: {
      itemResponseId,
      correctiveActionId: { in: actionIds },
      status: "PENDING",
    },
    data: { status: "SKIPPED", completedAt: new Date() },
  });
}

const runResponseInclude = {
  responses: {
    include: { correctiveActionResults: true },
  },
} as const;

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
        libraryItemId: "libraryItemId" in i ? (i.libraryItemId ?? null) : null,
        libraryItemVersionId:
          "libraryItemVersionId" in i ? (i.libraryItemVersionId ?? null) : null,
        correctiveActions: "correctiveActions" in i ? (i.correctiveActions ?? []) : [],
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
      libraryItemId: "libraryItemId" in i ? (i.libraryItemId ?? null) : null,
      libraryItemVersionId:
        "libraryItemVersionId" in i ? (i.libraryItemVersionId ?? null) : null,
      correctiveActions: "correctiveActions" in i ? (i.correctiveActions ?? []) : [],
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
    correctiveActionResults?: Array<{
      id: string;
      correctiveActionId: string;
      status: string;
      completedAt: Date | null;
    }>;
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
      const caDefs = item.correctiveActions ?? [];
      const caResults = resp?.correctiveActionResults ?? [];
      return {
        ...item,
        correctiveActions: caDefs,
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
              correctiveActions: caDefs
                .filter((action) => isAssociateCorrectiveAction(action))
                .map((action) => {
                  const result = caResults.find((r) => r.correctiveActionId === action.id);
                  const required = Boolean(
                    action.required ||
                      action.blocksCompletion ||
                      action.actionType === "BLOCK_COMPLETION",
                  );
                  const branch = correctiveBranch(action);
                  // Only treat a step as completable when a result row exists (or
                  // NEEDS_ACTION opened first-failure and rows are about to be healed).
                  const status =
                    result?.status ??
                    (branch === "if_fail"
                      ? "LOCKED"
                      : resp.status === "NEEDS_ACTION"
                        ? "PENDING"
                        : "LOCKED");
                  return {
                    id: action.id,
                    title: action.title,
                    actionType: action.actionType,
                    instructions: action.instructions ?? null,
                    required,
                    blocksCompletion: Boolean(
                      action.blocksCompletion ||
                        action.actionType === "BLOCK_COMPLETION" ||
                        required,
                    ),
                    branch,
                    config: action.config ?? null,
                    status,
                    completedAt: result?.completedAt?.toISOString() ?? null,
                  };
                }),
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
  occurrenceId?: string | null;
}) {
  let occurrence: {
    id: string;
    templateId: string;
    templateVersionId: string;
    status: string;
    runId: string | null;
    windowStart: Date;
    graceEndsAt: Date;
  } | null = null;

  if (input.occurrenceId) {
    occurrence = await prisma.walkOccurrence.findFirst({
      where: { id: input.occurrenceId, teamId: input.teamId },
    });
    if (!occurrence) return { error: "NOT_FOUND" as const, message: "Occurrence not found" };
    const windowCheck = assertOccurrenceInWindow(occurrence);
    if (windowCheck.error) return windowCheck;
    if (occurrence.runId) {
      const existing = await getWalkRun(input.teamId, occurrence.runId);
      if (existing) return { ok: true as const, run: existing };
    }
    // UPCOMING is blocked by the clock check above; closed statuses stay blocked.
    if (!["AVAILABLE", "IN_PROGRESS"].includes(occurrence.status)) {
      return { error: "OCCURRENCE_CLOSED" as const, message: "This walk window is not available" };
    }
  }

  const templateId = occurrence?.templateId ?? input.templateId;
  const template = await prisma.walkTemplate.findFirst({
    where: { id: templateId, teamId: input.teamId },
    include: templateInclude,
  });
  if (!template) return { error: "NOT_FOUND" as const };
  if (template.status !== "PUBLISHED" && !input.isTest) {
    return { error: "NOT_PUBLISHED" as const, message: "Only published walks can be started" };
  }

  let snapshot: TemplateSnapshot;
  let templateVersion = template.version;

  if (occurrence?.templateVersionId) {
    const published = await prisma.walkTemplateVersion.findFirst({
      where: { id: occurrence.templateVersionId },
    });
    if (published) {
      snapshot = parseSnapshot(published.snapshot);
      templateVersion = published.version;
    } else {
      snapshot = asSnapshot(serializeWalkTemplate(template, { includeItemsLoose: true }));
    }
  } else {
    const published = await prisma.walkTemplateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: "desc" },
    });
    if (published) {
      snapshot = parseSnapshot(published.snapshot);
      templateVersion = published.version;
    } else {
      snapshot = asSnapshot(serializeWalkTemplate(template, { includeItemsLoose: true }));
    }
  }

  const items = flattenSnapshotItems(snapshot);
  if (items.length === 0) {
    return { error: "EMPTY_WALK" as const, message: "This walk has no items yet" };
  }

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.walkRun.create({
      data: {
        teamId: input.teamId,
        templateId: template.id,
        templateVersion,
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
      include: runResponseInclude,
    });

    if (occurrence) {
      await tx.walkOccurrence.update({
        where: { id: occurrence.id },
        data: {
          status: "IN_PROGRESS",
          runId: created.id,
          startedByUserId: input.startedByUserId ?? null,
          startedAt: new Date(),
        },
      });
    }

    return created;
  });

  return { ok: true as const, run: serializeWalkRun(run) };
}

export async function getWalkRun(teamId: string, runId: string) {
  const run = await prisma.walkRun.findFirst({
    where: { id: runId, teamId },
    include: runResponseInclude,
  });
  if (!run) return null;
  return serializeWalkRun(run);
}

export async function listWalkRuns(teamId: string, limit = 50) {
  const rows = await prisma.walkRun.findMany({
    where: { teamId },
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { responses: true, template: { select: { name: true } } },
  });
  return rows.map((run) => ({
    ...serializeWalkRun(run),
    templateName: run.template.name,
  }));
}

export async function submitWalkItemResponse(input: {
  teamId: string;
  runId: string;
  itemId: string;
  response: unknown;
  notes?: string | null;
  photoUrls?: string[] | null;
  completedBy?: string | null;
  /** When true (Alenio Go), save pass/fail only — no failure-procedure gating. */
  skipFailureProcedure?: boolean;
}) {
  const run = await prisma.walkRun.findFirst({
    where: { id: input.runId, teamId: input.teamId },
    include: { responses: true },
  });
  if (!run) return { error: "NOT_FOUND" as const };
  if (run.status !== "IN_PROGRESS") {
    return { error: "RUN_CLOSED" as const, message: "This walk is already closed" };
  }
  const windowCheck = await assertRunOccurrenceInWindow(input.teamId, input.runId);
  if (windowCheck.error) return windowCheck;

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
  const actions = item.correctiveActions ?? [];
  const firstFailureActions = actions.filter(isFirstFailureAction);
  const ifFailActions = actions.filter(isIfFailAction);
  const hasProcedure = firstFailureActions.length > 0 || ifFailActions.length > 0;
  const requireRetest = Boolean(
    item.config && (item.config as { requireRetestOnFailure?: unknown }).requireRetestOnFailure,
  );
  const retestCount = responseRetestCount(parsedResponse.data);
  const isRetest = retestCount >= 1;

  let nextStatus: WalkItemResponseStatus = status;
  let failed = status === "FAIL" || status === "NEEDS_ACTION";
  const runProcedure = hasProcedure && !input.skipFailureProcedure;

  if (runProcedure && failed && !isRetest) {
    // First failure → open 1st-failure steps only.
    nextStatus = "NEEDS_ACTION";
  } else if (runProcedure && isRetest && status === "PASS") {
    // Retemp passed → procedure complete; skip unused if-fail steps.
    nextStatus = "RESOLVED";
    failed = false;
  } else if (runProcedure && isRetest && status === "FAIL" && ifFailActions.length > 0) {
    // Retemp failed → open 2nd-failure steps.
    nextStatus = "NEEDS_ACTION";
    failed = true;
  } else if (runProcedure && failed) {
    nextStatus = "NEEDS_ACTION";
  }

  const data = {
    itemType: item.type,
    status: nextStatus,
    response: parsedResponse.data as Prisma.InputJsonValue,
    failed,
    notes: input.notes ?? null,
    photoUrls: (photoUrls ?? undefined) as Prisma.InputJsonValue | undefined,
    completedBy: input.completedBy ?? null,
    completedAt: new Date(),
  };

  // Persist response + procedure rows together so a failed upsert cannot leave
  // NEEDS_ACTION with phantom PENDING steps and no result rows.
  await prisma.$transaction(async (tx) => {
    const itemResponseId = existing
      ? (
          await tx.walkItemResponse.update({ where: { id: existing.id }, data })
        ).id
      : (
          await tx.walkItemResponse.create({
            data: {
              runId: run.id,
              itemId: item.id,
              ...data,
            },
          })
        ).id;

    if (runProcedure) {
      if (status === "PASS") {
        // Passing reading must never keep leftover PENDING corrective steps.
        await skipPendingCorrectiveResults(
          tx,
          itemResponseId,
          actions.map((a) => a.id),
        );
      } else if (!isRetest && status === "FAIL" && firstFailureActions.length > 0) {
        await upsertPendingCorrectiveResults(tx, itemResponseId, firstFailureActions);
      } else if (isRetest && status === "FAIL" && ifFailActions.length > 0) {
        await upsertPendingCorrectiveResults(tx, itemResponseId, ifFailActions);
      } else if (
        !requireRetest &&
        status === "FAIL" &&
        firstFailureActions.length === 0 &&
        ifFailActions.length > 0
      ) {
        // Legacy / misconfigured: only if_fail steps exist and retest is off.
        await upsertPendingCorrectiveResults(tx, itemResponseId, ifFailActions);
      }
    }
  });

  const updated = await getWalkRun(input.teamId, input.runId);
  return { ok: true as const, run: updated };
}

export async function completeCorrectiveAction(input: {
  teamId: string;
  runId: string;
  itemId: string;
  correctiveActionId: string;
  response?: unknown;
  completedBy?: string | null;
}) {
  const run = await prisma.walkRun.findFirst({
    where: { id: input.runId, teamId: input.teamId },
    include: { responses: { include: { correctiveActionResults: true } } },
  });
  if (!run) return { error: "NOT_FOUND" as const };
  if (run.status !== "IN_PROGRESS") {
    return { error: "RUN_CLOSED" as const, message: "This walk is already closed" };
  }
  const windowCheck = await assertRunOccurrenceInWindow(input.teamId, input.runId);
  if (windowCheck.error) return windowCheck;
  const itemResponse = run.responses.find((r) => r.itemId === input.itemId);
  if (!itemResponse) return { error: "ITEM_NOT_FOUND" as const };

  const snapshot = parseSnapshot(run.templateSnapshot);
  const item = flattenSnapshotItems(snapshot).find((i) => i.id === input.itemId);
  const actions = (item?.correctiveActions ?? []).filter(isAssociateCorrectiveAction);
  const target = actions.find((a) => a.id === input.correctiveActionId);
  if (!target) return { error: "ACTION_NOT_FOUND" as const };

  // Heal missing result rows (e.g. older fail saves left NEEDS_ACTION without results).
  let result = itemResponse.correctiveActionResults.find(
    (r) => r.correctiveActionId === input.correctiveActionId,
  );
  if (!result) {
    if (itemResponse.status !== "NEEDS_ACTION") {
      return { error: "ACTION_NOT_FOUND" as const };
    }
    const openActions = isIfFailAction(target)
      ? actions.filter(isIfFailAction)
      : actions.filter(isFirstFailureAction);
    await upsertPendingCorrectiveResults(prisma, itemResponse.id, openActions);
    const refreshed = await prisma.walkCorrectiveActionResult.findUnique({
      where: {
        itemResponseId_correctiveActionId: {
          itemResponseId: itemResponse.id,
          correctiveActionId: input.correctiveActionId,
        },
      },
    });
    if (!refreshed) return { error: "ACTION_NOT_FOUND" as const };
    result = refreshed;
    itemResponse.correctiveActionResults = [
      ...itemResponse.correctiveActionResults.filter(
        (r) => r.correctiveActionId !== refreshed.correctiveActionId,
      ),
      refreshed,
    ];
  }

  if (result.status === "COMPLETED" || result.status === "SKIPPED") {
    const updated = await getWalkRun(input.teamId, input.runId);
    return { ok: true as const, run: updated };
  }

  const sameBranch = actions.filter((a) => {
    if (isFirstFailureAction(target)) return isFirstFailureAction(a);
    if (isIfFailAction(target)) return isIfFailAction(a);
    return correctiveBranch(a) === correctiveBranch(target);
  });
  const targetIndex = sameBranch.findIndex((a) => a.id === input.correctiveActionId);
  for (let i = 0; i < targetIndex; i++) {
    const prior = sameBranch[i]!;
    const priorResult = itemResponse.correctiveActionResults.find(
      (r) => r.correctiveActionId === prior.id,
    );
    if (!priorResult || priorResult.status === "PENDING") {
      return {
        error: "OUT_OF_ORDER" as const,
        message: `Complete step ${i + 1} before this step`,
      };
    }
  }

  await prisma.walkCorrectiveActionResult.update({
    where: { id: result.id },
    data: {
      status: "COMPLETED",
      response: (input.response ?? undefined) as Prisma.InputJsonValue | undefined,
      completedBy: input.completedBy ?? null,
      completedAt: new Date(),
    },
  });

  const pending = await prisma.walkCorrectiveActionResult.count({
    where: { itemResponseId: itemResponse.id, status: "PENDING" },
  });
  if (pending === 0) {
    const requireRetest = Boolean(
      item?.config &&
        (item.config as { requireRetestOnFailure?: unknown }).requireRetestOnFailure,
    );
    const retestCount = responseRetestCount(itemResponse.response);
    const awaitingRetemp = requireRetest && retestCount < 1;

    if (!awaitingRetemp) {
      await prisma.walkItemResponse.update({
        where: { id: itemResponse.id },
        data: { status: "RESOLVED", failed: false },
      });
    }
    // If retemp is still required, keep NEEDS_ACTION so the associate must retest.
  }

  const updated = await getWalkRun(input.teamId, input.runId);
  return { ok: true as const, run: updated };
}

/** Clears a saved item response + failure-procedure progress so the associate can restart. */
export async function resetWalkItemResponse(input: {
  teamId: string;
  runId: string;
  itemId: string;
}) {
  const run = await prisma.walkRun.findFirst({
    where: { id: input.runId, teamId: input.teamId },
    include: { responses: { include: { correctiveActionResults: true } } },
  });
  if (!run) return { error: "NOT_FOUND" as const };
  if (run.status !== "IN_PROGRESS") {
    return { error: "RUN_CLOSED" as const, message: "This walk is already closed" };
  }
  const windowCheck = await assertRunOccurrenceInWindow(input.teamId, input.runId);
  if (windowCheck.error) return windowCheck;

  const snapshot = parseSnapshot(run.templateSnapshot);
  const item = flattenSnapshotItems(snapshot).find((i) => i.id === input.itemId);
  if (!item) return { error: "ITEM_NOT_FOUND" as const, message: "Item not found on this walk" };

  const existing = run.responses.find((r) => r.itemId === input.itemId);
  if (existing) {
    await prisma.walkCorrectiveActionResult.deleteMany({
      where: { itemResponseId: existing.id },
    });
    await prisma.walkItemResponse.delete({ where: { id: existing.id } });
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
  const windowCheck = await assertRunOccurrenceInWindow(teamId, runId);
  if (windowCheck.error) return windowCheck;

  const snapshot = parseSnapshot(run.templateSnapshot);
  const items = flattenSnapshotItems(snapshot);
  const incomplete = findIncompleteRequiredItems(items, run.responses);
  if (incomplete[0]) {
    return {
      error: "INCOMPLETE" as const,
      message: `Required item still needs a response: ${incomplete[0].title}`,
    };
  }

  const responsesWithCa = await prisma.walkItemResponse.findMany({
    where: { runId },
    include: { correctiveActionResults: true },
  });
  const snapshotByItemId = new Map(items.map((i) => [i.id, i]));
  for (const resp of responsesWithCa) {
    const snapshotItem = snapshotByItemId.get(resp.itemId);
    const actionById = new Map(
      (snapshotItem?.correctiveActions ?? []).map((a) => [a.id, a]),
    );
    for (const ca of resp.correctiveActionResults) {
      const def = actionById.get(ca.correctiveActionId);
      if (
        ca.status === "PENDING" &&
        def &&
        (def.blocksCompletion || def.actionType === "BLOCK_COMPLETION" || def.required)
      ) {
        return {
          error: "CORRECTIVE_BLOCKED" as const,
          message: `Complete corrective action: ${def.title}`,
        };
      }
    }
    if (resp.status === "NEEDS_ACTION") {
      return {
        error: "CORRECTIVE_BLOCKED" as const,
        message: "Finish the failure procedure (including retemp if required) before completing the walk",
      };
    }
  }

  const score = scoreWalkRun(items, run.responses);
  const completedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const runRow = await tx.walkRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt,
        score,
      },
      include: { ...runResponseInclude, occurrence: true },
    });

    if (runRow.occurrence) {
      const late = completedAt > runRow.occurrence.dueAt;
      await tx.walkOccurrence.update({
        where: { id: runRow.occurrence.id },
        data: {
          status: late ? "COMPLETED_LATE" : "COMPLETED",
          completedAt,
          score,
          completedByUserId: run.startedByUserId,
        },
      });
    }

    return runRow;
  });

  return { ok: true as const, run: serializeWalkRun(updated) };
}
