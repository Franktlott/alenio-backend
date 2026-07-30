import type { Prisma, SenecaTeamBrief } from "@prisma/client";
import { prisma } from "../prisma";
import type {
  SenecaFocusAction,
  SenecaFocusBrief,
  SenecaFocusResponse,
  SenecaFocusSourceMetrics,
} from "../types";
import { generateGroundedFocusCopy, type SenecaFocusCopy } from "./seneca-focus-copy";
import { loadSenecaFocusFacts } from "./seneca-focus-data";
import {
  buildMaterialFingerprint,
  isFocusRefreshCoolingDown,
  isCandidateResolved,
  selectFocusCandidate,
  sourceMetricsFromFacts,
  type SenecaFocusCandidate,
} from "./seneca-focus-engine";
import { calendarDayFromInstant, dueInstantFromCalendarDay } from "./timezone";

const REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

type AuditType =
  | "generated"
  | "shown"
  | "opened"
  | "completed"
  | "refreshed"
  | "stale"
  | "failed";

async function audit(
  type: AuditType,
  teamId: string,
  actorUserId: string | null,
  briefId: string | null,
  metadata: Record<string, unknown> = {},
) {
  await prisma.senecaTeamBriefEvent.create({
    data: { type, teamId, actorUserId, briefId, metadata: metadata as Prisma.InputJsonValue },
  });
}

function parseJson<T>(value: Prisma.JsonValue): T {
  return value as T;
}

function publicBrief(row: SenecaTeamBrief): SenecaFocusBrief {
  const candidate = parseJson<SenecaFocusCandidate>(row.candidateJson);
  const copy = parseJson<SenecaFocusCopy>(row.copyJson);
  return {
    id: row.id,
    teamId: row.teamId,
    localDate: row.localDate,
    category: row.category as SenecaFocusBrief["category"],
    impact: row.impact as SenecaFocusBrief["impact"],
    status: row.status as SenecaFocusBrief["status"],
    summary: copy.summary,
    rationale: copy.rationale,
    estimatedMinutes: row.estimatedMinutes,
    affectedCount: row.affectedCount,
    affectedMemberIds: parseJson<string[]>(row.affectedMemberIds),
    confidence: row.confidence,
    score: row.score,
    projectedHealthPct: row.projectedHealthPct,
    keyInsights: copy.keyInsights,
    actions: copy.actions,
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function response(row: SenecaTeamBrief, reused: boolean, stale = false): SenecaFocusResponse {
  return {
    brief: publicBrief(row),
    reused,
    stale,
    generatedBy: row.copySource === "seneca" ? "seneca" : "deterministic",
    refreshAvailableAt: row.refreshAvailableAt?.toISOString() ?? null,
  };
}

async function createBrief(input: {
  teamId: string;
  userId: string;
  timeZone: string;
  now: Date;
  excludedCandidateIds?: string[];
}) {
  const facts = await loadSenecaFocusFacts(input.teamId, input.userId, input.timeZone, input.now);
  const { selected, candidates } = selectFocusCandidate(facts, input.excludedCandidateIds);
  const fingerprint = buildMaterialFingerprint(facts);
  const generated = await generateGroundedFocusCopy(
    prisma,
    input.teamId,
    input.userId,
    selected,
    facts,
  );
  const localDate = calendarDayFromInstant(input.now, input.timeZone);
  const expiresAt = new Date(dueInstantFromCalendarDay(localDate, input.timeZone).getTime() + 1);
  const status =
    generated.source === "deterministic" && generated.error
      ? "fallback"
      : selected.category === "low_data"
        ? "low_data"
        : selected.category === "momentum"
          ? "positive"
          : "generated";
  const metrics = sourceMetricsFromFacts(facts);
  metrics.health.projectedPct = selected.projectedHealthPct;

  const row = await prisma.senecaTeamBrief.create({
    data: {
      teamId: input.teamId,
      generatedForUserId: input.userId,
      localDate,
      timezone: input.timeZone,
      category: selected.category,
      impact: selected.impact,
      status,
      score: selected.score,
      confidence: selected.confidence,
      estimatedMinutes: selected.estimatedMinutes,
      affectedCount: selected.affectedMemberIds.length,
      affectedMemberIds: selected.affectedMemberIds,
      candidateJson: selected as unknown as Prisma.InputJsonValue,
      candidatesJson: candidates as unknown as Prisma.InputJsonValue,
      sourceMetricsJson: metrics as unknown as Prisma.InputJsonValue,
      materialFingerprint: fingerprint,
      copyJson: generated.copy as unknown as Prisma.InputJsonValue,
      copySource: generated.source,
      projectedHealthPct: selected.projectedHealthPct,
      generatedAt: input.now,
      expiresAt,
      refreshAvailableAt: new Date(input.now.getTime() + REFRESH_COOLDOWN_MS),
    },
  });
  await audit("generated", input.teamId, input.userId, row.id, {
    candidateId: selected.id,
    fingerprint,
    copySource: generated.source,
  });
  if (generated.error) {
    await audit("failed", input.teamId, input.userId, row.id, {
      stage: "copy",
      fallbackServed: true,
      error: generated.error.slice(0, 300),
    });
  }
  return { row, facts };
}

async function latestForDay(teamId: string, userId: string, localDate: string) {
  return prisma.senecaTeamBrief.findFirst({
    where: { teamId, generatedForUserId: userId, localDate },
    orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getOrCreateSenecaFocus(
  teamId: string,
  userId: string,
  timeZone: string,
  now = new Date(),
): Promise<SenecaFocusResponse> {
  const localDate = calendarDayFromInstant(now, timeZone);
  const existing = await latestForDay(teamId, userId, localDate);
  if (existing && !existing.completedAt) {
    try {
      const facts = await loadSenecaFocusFacts(teamId, userId, timeZone, now);
      const candidate = parseJson<SenecaFocusCandidate>(existing.candidateJson);
      if (isCandidateResolved(candidate, facts)) {
        await prisma.senecaTeamBrief.update({
          where: { id: existing.id },
          data: { status: "completed", completedAt: now },
        });
        await audit("completed", teamId, userId, existing.id, {
          automatic: true,
          candidateId: candidate.id,
        });
        const next = await createBrief({
          teamId,
          userId,
          timeZone,
          now,
          excludedCandidateIds: [candidate.id],
        });
        await audit("shown", teamId, userId, next.row.id, { reused: false });
        return response(next.row, false);
      }
      const fingerprint = buildMaterialFingerprint(facts);
      if (fingerprint === existing.materialFingerprint && existing.expiresAt > now) {
        await audit("shown", teamId, userId, existing.id, { reused: true });
        return response(existing, true);
      }
    } catch (error) {
      const stale = await prisma.senecaTeamBrief.update({
        where: { id: existing.id },
        data: { status: "stale" },
      });
      await audit("stale", teamId, userId, existing.id, {
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      return response(stale, true, true);
    }
  }

  try {
    const created = await createBrief({ teamId, userId, timeZone, now });
    await audit("shown", teamId, userId, created.row.id, { reused: false });
    return response(created.row, false);
  } catch (error) {
    if (existing) {
      const stale = await prisma.senecaTeamBrief.update({
        where: { id: existing.id },
        data: { status: "stale" },
      });
      await audit("stale", teamId, userId, existing.id, {
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      return response(stale, true, true);
    }
    await audit("failed", teamId, userId, null, {
      stage: "generation",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    });
    throw error;
  }
}

export class SenecaFocusCooldownError extends Error {
  constructor(readonly availableAt: Date) {
    super("Today's Focus can be refreshed again after the cooldown.");
  }
}

export async function refreshSenecaFocus(
  teamId: string,
  userId: string,
  timeZone: string,
  now = new Date(),
): Promise<SenecaFocusResponse> {
  const localDate = calendarDayFromInstant(now, timeZone);
  const existing = await latestForDay(teamId, userId, localDate);
  if (isFocusRefreshCoolingDown(existing?.refreshAvailableAt, now)) {
    throw new SenecaFocusCooldownError(existing!.refreshAvailableAt!);
  }
  const created = await createBrief({ teamId, userId, timeZone, now });
  if (existing && !existing.completedAt) {
    await prisma.senecaTeamBrief.update({
      where: { id: existing.id },
      data: { status: "stale" },
    });
  }
  await audit("refreshed", teamId, userId, created.row.id, {
    previousBriefId: existing?.id ?? null,
  });
  return response(created.row, false);
}

export async function recordSenecaFocusOpen(teamId: string, userId: string, briefId: string) {
  const brief = await prisma.senecaTeamBrief.findFirst({
    where: { id: briefId, teamId, generatedForUserId: userId },
    select: { id: true },
  });
  if (!brief) return false;
  await audit("opened", teamId, userId, briefId);
  return true;
}

export async function completeSenecaFocusAction(input: {
  teamId: string;
  userId: string;
  briefId: string;
  actionId: string;
  timeZone: string;
  now?: Date;
}): Promise<SenecaFocusResponse | null> {
  const now = input.now ?? new Date();
  const brief = await prisma.senecaTeamBrief.findFirst({
    where: {
      id: input.briefId,
      teamId: input.teamId,
      generatedForUserId: input.userId,
    },
  });
  if (!brief) return null;
  const copy = parseJson<SenecaFocusCopy>(brief.copyJson);
  const action = copy.actions.find((item) => item.id === input.actionId);
  if (!action) return null;
  const updatedActions: SenecaFocusAction[] = copy.actions.map((item) =>
    item.id === input.actionId ? { ...item, completedAt: now.toISOString() } : item,
  );
  await prisma.senecaTeamBrief.update({
    where: { id: brief.id },
    data: {
      copyJson: { ...copy, actions: updatedActions } as unknown as Prisma.InputJsonValue,
      status: "completed",
      completedAt: now,
      completedByUserId: input.userId,
    },
  });
  const candidate = parseJson<SenecaFocusCandidate>(brief.candidateJson);
  await audit("completed", input.teamId, input.userId, brief.id, {
    automatic: false,
    actionId: input.actionId,
    candidateId: candidate.id,
  });
  const next = await createBrief({
    teamId: input.teamId,
    userId: input.userId,
    timeZone: input.timeZone,
    now,
    excludedCandidateIds: [candidate.id],
  });
  await audit("shown", input.teamId, input.userId, next.row.id, {
    afterCompletion: brief.id,
  });
  return response(next.row, false);
}

export type { SenecaFocusSourceMetrics };
