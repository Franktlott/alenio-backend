import type { PrismaClient } from "@prisma/client";
import { env } from "../env";
import type { SenecaFocusAction, SenecaFocusKeyInsight } from "../types";
import { senecaJson } from "./seneca-openai";
import { assembleForWorkspaceTeam } from "./seneca-prompt-assembly";
import type { SenecaFocusCandidate, SenecaFocusFacts } from "./seneca-focus-engine";
import { sourceMetricsFromFacts } from "./seneca-focus-engine";

export type SenecaFocusCopy = {
  summary: string;
  rationale: string;
  keyInsights: SenecaFocusKeyInsight[];
  actions: SenecaFocusAction[];
};

type GeneratedCopy = {
  category?: unknown;
  mentionedMembers?: unknown;
  summary?: unknown;
  rationale?: unknown;
  keyInsights?: unknown;
  actions?: unknown;
};

const actionRoute: Record<SenecaFocusCandidate["action"], SenecaFocusAction["route"]> = {
  view_check_ins: "/team-priority",
  view_goals: "/team-priority",
  view_overdue_tasks: "/team-priority",
  view_workload: "/(app)/execute",
  create_recognition: "/(app)/activity",
  open_team: "/(app)/team",
};

/** Copy generation may use Seneca style/template layers, but never workspace notes or knowledge text. */
export function permissionSafeFocusSystemPrompt(systemPrompt: string): string {
  return systemPrompt
    .replace(
      /\n\n# Workspace Operational Context[\s\S]*?(?=\n\n# (?:Knowledge base|Prompt template|Current user context|Current request context)|$)/,
      "",
    )
    .replace(
      /\n\n# Knowledge base \(active documents only\)[\s\S]*?(?=\n\n# (?:Prompt template|Current user context|Current request context)|$)/,
      "",
    );
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= max ? text : null;
}

export function deterministicFocusCopy(candidate: SenecaFocusCandidate): SenecaFocusCopy {
  const projected =
    candidate.projectedHealthPct === null
      ? "The impact is supported by current structured workload and standards data."
      : `Resolving the selected measurable gap would move the calculable health result to ${candidate.projectedHealthPct}%.`;
  const primaryRoute = actionRoute[candidate.action];
  const primaryStatus =
    candidate.impact === "high" ? "risk" : candidate.impact === "positive" ? "opportunity" : "priority";
  return {
    summary: `${candidate.title}. ${candidate.reason}`,
    rationale: `${candidate.reason} ${projected}`,
    keyInsights: [
      { id: "priority", label: "Why this is first", detail: candidate.reason, status: primaryStatus },
      {
        id: "scope",
        label: "Scope",
        detail: `${candidate.affectedMemberIds.length} team member${candidate.affectedMemberIds.length === 1 ? "" : "s"} affected.`,
        status: primaryStatus,
      },
      { id: "impact", label: "Expected impact", detail: projected, status: "opportunity" },
    ],
    actions: [
      {
        id: "primary",
        action: candidate.action,
        title: candidate.title,
        description: "Open the relevant team workflow and address the supported items.",
        route: primaryRoute,
        params: { focus: candidate.category },
        estimatedMinutes: candidate.estimatedMinutes,
        measurable: candidate.measurable,
        completedAt: null,
      },
      {
        id: "review",
        action: "open_team",
        title: "Review the team signal",
        description: "Return to the Team view to confirm the measurable change.",
        route: "/(app)/team",
        params: {},
        estimatedMinutes: 3,
        measurable: false,
        completedAt: null,
      },
    ],
  };
}

export function validateFocusCopy(
  raw: GeneratedCopy,
  candidate: SenecaFocusCandidate,
  facts: SenecaFocusFacts,
): SenecaFocusCopy | null {
  const summary = cleanText(raw.summary, 180);
  const rationale = cleanText(raw.rationale, 360);
  if (raw.category !== candidate.category || !Array.isArray(raw.mentionedMembers)) return null;
  const allowedNames = new Map(
    facts.members
      .filter((member) => candidate.affectedMemberIds.includes(member.id))
      .map((member) => [member.id, member.name]),
  );
  for (const member of raw.mentionedMembers) {
    if (!member || typeof member !== "object") return null;
    const row = member as Record<string, unknown>;
    if (typeof row.id !== "string" || row.name !== allowedNames.get(row.id)) return null;
  }
  if (!summary || !rationale || !Array.isArray(raw.keyInsights) || !Array.isArray(raw.actions)) return null;
  if (raw.keyInsights.length < 3 || raw.keyInsights.length > 5 || raw.actions.length < 2 || raw.actions.length > 4) {
    return null;
  }

  const allowedNumbers = new Set(
    JSON.stringify(sourceMetricsFromFacts(facts)).match(/\d+(?:\.\d+)?/g) ?? [],
  );
  allowedNumbers.add(String(candidate.estimatedMinutes));
  if (candidate.projectedHealthPct !== null) allowedNumbers.add(String(candidate.projectedHealthPct));
  for (const number of `${summary} ${rationale} ${JSON.stringify(raw.keyInsights)}`.match(/\d+(?:\.\d+)?/g) ?? []) {
    if (!allowedNumbers.has(number)) return null;
  }

  const insights: SenecaFocusKeyInsight[] = [];
  const allowedInsightStatuses = new Set(["risk", "priority", "opportunity", "on_track"]);
  for (const [index, item] of raw.keyInsights.entries()) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const label = cleanText(row.label, 80);
    const detail = cleanText(row.detail, 240);
    const status = typeof row.status === "string" ? row.status : "";
    if (!label || !detail || !allowedInsightStatuses.has(status)) return null;
    insights.push({
      id: `insight-${index + 1}`,
      label,
      detail,
      status: status as SenecaFocusKeyInsight["status"],
    });
  }

  const allowedActions = new Set<SenecaFocusCandidate["action"]>([
    candidate.action,
    "open_team",
  ]);
  const actions: SenecaFocusAction[] = [];
  for (const [index, item] of raw.actions.entries()) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const action = row.action as SenecaFocusCandidate["action"];
    const title = cleanText(row.title, 100);
    const description = cleanText(row.description, 240);
    if (!allowedActions.has(action) || !title || !description) return null;
    const expectedRoute = actionRoute[action];
    if (row.route !== expectedRoute) return null;
    const affected = Array.isArray(row.affectedMemberIds)
      ? row.affectedMemberIds.filter((id): id is string => typeof id === "string")
      : [];
    if (affected.some((id) => !candidate.affectedMemberIds.includes(id))) return null;
    actions.push({
      id: `action-${index + 1}`,
      action,
      title,
      description,
      route: expectedRoute,
      params: action === candidate.action ? { focus: candidate.category } : {},
      estimatedMinutes: action === candidate.action ? candidate.estimatedMinutes : 3,
      measurable: action === candidate.action && candidate.measurable,
      completedAt: null,
    });
  }
  return { summary, rationale, keyInsights: insights, actions };
}

export async function generateGroundedFocusCopy(
  prisma: PrismaClient,
  teamId: string,
  userId: string,
  candidate: SenecaFocusCandidate,
  facts: SenecaFocusFacts,
): Promise<{ copy: SenecaFocusCopy; source: "seneca" | "deterministic"; error?: string }> {
  const fallback = deterministicFocusCopy(candidate);
  const safeContext = {
    candidate,
    sourceMetrics: sourceMetricsFromFacts(facts),
    affectedMembers: facts.members
      .filter((member) => candidate.affectedMemberIds.includes(member.id))
      .map((member) => ({ id: member.id, name: member.name })),
  };
  const started = Date.now();
  let assembled: Awaited<ReturnType<typeof assembleForWorkspaceTeam>> | null = null;
  try {
    assembled = await assembleForWorkspaceTeam(prisma, teamId, {
      templateKey: "daily_summary",
      requestContext:
        "Generate copy only from the permission-safe structured focus facts supplied with this request.",
    });
    const raw = await senecaJson<GeneratedCopy>(
      `Write compact manager-facing Today's Focus copy.
Return JSON with category (exactly "${candidate.category}"), mentionedMembers (only exact id/name pairs from affectedMembers, or []), summary, rationale, keyInsights (3-5 objects with label/detail/status, where status is risk, priority, opportunity, or on_track), and actions (2-4 objects).
The summary must be one concise recommendation that states the priority and why it matters, not a dashboard metric list.
Every action must use action "${candidate.action}" with route "${actionRoute[candidate.action]}", or action "open_team" with route "/(app)/team".
Actions may include affectedMemberIds, but only IDs supplied in context.
Do not restate a list of metrics, invent causation, blame anyone, infer private sentiment, or claim repeated patterns not explicitly supported.
Do not introduce names, numbers, routes, categories, tasks, shifts, departments, reliability, notes, or check-in responses not supplied in context.`,
      JSON.stringify(safeContext),
      { systemPrompt: permissionSafeFocusSystemPrompt(assembled.systemPrompt) },
    );
    const copy = validateFocusCopy(raw, candidate, facts);
    if (!copy) throw new Error("Seneca focus copy failed strict grounding validation");
    await prisma.senecaGeneration.create({
      data: {
        ownerType: "WORKSPACE",
        ownerId: teamId,
        userId,
        source: "daily_summary",
        model: env.OPENAI_MODEL,
        promptVersion: assembled.promptVersion,
        knowledgeUsed: JSON.stringify([]),
        contextUsed: JSON.stringify(["focus_candidate", "source_metrics"]),
        question: candidate.id,
        response: JSON.stringify(copy),
        latencyMs: Date.now() - started,
      },
    });
    return { copy, source: "seneca" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.senecaGeneration
      .create({
        data: {
          ownerType: "WORKSPACE",
          ownerId: teamId,
          userId,
          source: "daily_summary",
          model: env.OPENAI_MODEL,
          promptVersion: assembled?.promptVersion ?? null,
          contextUsed: JSON.stringify(["focus_candidate", "source_metrics", "fallback"]),
          question: candidate.id,
          response: JSON.stringify({ fallback: true, error: message.slice(0, 300) }),
          latencyMs: Date.now() - started,
        },
      })
      .catch(() => undefined);
    return { copy: fallback, source: "deterministic", error: message };
  }
}
