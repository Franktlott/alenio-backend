import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { buildSenecaRawContext, senecaContextToPrompt } from "../lib/seneca-context";
import { senecaAvailable, senecaJson, senecaText, senecaUnavailableMessage } from "../lib/seneca-openai";
import {
  normalizeDevelopmentGoalDraft,
  normalizeQuickDevelopmentGoal,
  normalizeStringArray,
} from "../lib/seneca-normalize";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const senecaRouter = new Hono<{ Variables: Variables }>();
senecaRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function canUseSeneca(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

function canManageDevelopmentGoal(
  membership: { role: string; userId: string },
  memberUserId: string,
): boolean {
  const isLeaderRole =
    membership.role === "owner" || membership.role === "team_leader" || membership.role === "admin";
  return isLeaderRole || membership.userId === memberUserId;
}

const prepBodySchema = z.object({
  templateId: z.string().optional(),
  memberName: z.string().optional(),
  managerName: z.string().nullable().optional(),
});

const assistBodySchema = z.object({
  action: z.enum([
    "suggest_next_question",
    "rewrite_feedback",
    "notes_to_action_items",
    "create_follow_up_task",
    "create_development_goal",
    "summarize_conversation",
  ]),
  templateId: z.string().optional(),
  templateTitle: z.string().optional(),
  templateFields: z
    .array(z.object({ id: z.string(), label: z.string(), type: z.string() }))
    .optional(),
  responses: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  focusFieldId: z.string().optional(),
  focusText: z.string().optional(),
  memberName: z.string().optional(),
  managerName: z.string().nullable().optional(),
});

const summaryBodySchema = z.object({
  templateTitle: z.string(),
  templateFields: z.array(z.object({ id: z.string(), label: z.string(), type: z.string() })),
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
  followUpTasks: z
    .array(z.object({ title: z.string(), assigneeRole: z.enum(["associate", "leader"]).optional() }))
    .optional(),
  memberName: z.string().optional(),
  managerName: z.string().nullable().optional(),
});

const devPlanBodySchema = z.object({
  memberName: z.string().optional(),
  managerName: z.string().nullable().optional(),
  contextNotes: z.string().optional(),
  checkInSummary: z.string().optional(),
});

const quickGoalBodySchema = z.object({
  skillOrGoal: z.string().trim().min(1, "Describe a goal or skill").max(500),
  memberName: z.string().optional(),
  managerName: z.string().nullable().optional(),
});

type SenecaPrepAi = {
  lastCheckInNotes: string | null;
  openDevelopmentGoals: string[];
  openFollowUpTasks: string[];
  recentWins: string[];
  completionPatterns: string | null;
  suggestedTalkingPoints: string[];
  suggestedCoachingQuestions: string[];
};

type SenecaAssistAi = {
  result: string;
  suggestions?: string[];
  followUpTasks?: Array<{ title: string; assigneeRole: "associate" | "leader"; dueDate?: string }>;
  developmentGoal?: {
    goalTitle: string;
    focusArea: string;
    actionSteps30Day: string[];
    managerSupportNeeded: string[];
    successMeasures: string[];
    targetDate: string | null;
  };
};

type SenecaSummaryAi = {
  conversationSummary: string;
  winsDiscussed: string[];
  opportunitiesDiscussed: string[];
  actionItems: string[];
  followUpTasks: Array<{ title: string; assigneeRole: "associate" | "leader"; dueDate?: string }>;
  suggestedNextCheckInDate: string | null;
  draftDevelopmentGoal: SenecaAssistAi["developmentGoal"] | null;
};

type SenecaDevPlanAi = {
  goalTitle: string;
  focusArea: string;
  actionSteps30Day: string[];
  managerSupportNeeded: string[];
  successMeasures: string[];
  targetDate: string | null;
  status: "active";
};

function ruleBasedPrep(ctx: Awaited<ReturnType<typeof buildSenecaRawContext>>): SenecaPrepAi {
  const talkingPoints: string[] = [];
  if (ctx.lastCheckIn?.openFollowUps.length) {
    talkingPoints.push(`Follow up on ${ctx.lastCheckIn.openFollowUps.length} open task(s) from the last check-in.`);
  }
  if (ctx.activeDevelopmentGoals.length) {
    talkingPoints.push(`Review progress on: ${ctx.activeDevelopmentGoals.map((g) => g.skill).join(", ")}.`);
  }
  if (ctx.memberStats?.overdueTasks) {
    talkingPoints.push(`Discuss ${ctx.memberStats.overdueTasks} overdue task(s) and blockers.`);
  }
  if (ctx.recentWins.length) {
    talkingPoints.push("Recognize recent wins and reinforce positive behaviors.");
  }

  const questions = [
    `What's going well for you right now, ${ctx.memberName}?`,
    "What support do you need from me this week?",
    "Are there any obstacles getting in the way of your goals?",
  ];

  return {
    lastCheckInNotes: ctx.lastCheckIn?.notesSummary ?? null,
    openDevelopmentGoals: ctx.activeDevelopmentGoals.map((g) => g.skill),
    openFollowUpTasks: ctx.lastCheckIn?.openFollowUps.map((t) => t.title) ?? [],
    recentWins: ctx.recentWins,
    completionPatterns: ctx.completionPatterns,
    suggestedTalkingPoints: talkingPoints.length ? talkingPoints : ["Open with how they're doing and what's on their mind."],
    suggestedCoachingQuestions: questions,
  };
}

// GET prep context (raw + AI suggestions)
senecaRouter.post("/:memberUserId/seneca/prep", zValidator("json", prepBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  const raw = await buildSenecaRawContext(teamId, memberUserId, {
    templateId: body.templateId,
    memberName: body.memberName,
    managerName: body.managerName,
  });

  if (!senecaAvailable()) {
    return c.json({
      data: {
        available: false,
        message: senecaUnavailableMessage(),
        raw,
        prep: ruleBasedPrep(raw),
      },
    });
  }

  try {
    const prep = await senecaJson<SenecaPrepAi>(
      `Generate a pre-check-in prep summary for a manager about to meet with ${raw.memberName}.
Return JSON with keys:
- lastCheckInNotes (string|null): brief summary of last check-in notes
- openDevelopmentGoals (string[]): skill names
- openFollowUpTasks (string[]): task titles
- recentWins (string[])
- completionPatterns (string|null)
- suggestedTalkingPoints (string[]): 3-5 practical talking points
- suggestedCoachingQuestions (string[]): 3-5 open-ended coaching questions`,
      senecaContextToPrompt(raw),
    );
    return c.json({
      data: {
        available: true,
        raw,
        prep: {
          ...prep,
          openDevelopmentGoals: normalizeStringArray(prep.openDevelopmentGoals),
          openFollowUpTasks: normalizeStringArray(prep.openFollowUpTasks),
          recentWins: normalizeStringArray(prep.recentWins),
          suggestedTalkingPoints: normalizeStringArray(prep.suggestedTalkingPoints),
          suggestedCoachingQuestions: normalizeStringArray(prep.suggestedCoachingQuestions),
        },
      },
    });
  } catch (e) {
    return c.json({
      data: {
        available: false,
        message: e instanceof Error ? e.message : "Seneca prep failed",
        raw,
        prep: ruleBasedPrep(raw),
      },
    });
  }
});

senecaRouter.post("/:memberUserId/seneca/assist", zValidator("json", assistBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  const raw = await buildSenecaRawContext(teamId, memberUserId, {
    templateId: body.templateId,
    memberName: body.memberName,
    managerName: body.managerName,
  });

  const liveContext = JSON.stringify(
    {
      ...raw,
      currentCheckIn: {
        templateTitle: body.templateTitle,
        templateFields: body.templateFields,
        responses: body.responses,
        focusFieldId: body.focusFieldId,
        focusText: body.focusText,
      },
    },
    null,
    2,
  );

  const actionInstructions: Record<string, string> = {
    suggest_next_question:
      "Suggest the next best coaching question based on what's been discussed so far. Return JSON: { result: string (the question), suggestions: string[] (1-2 alternate questions) }",
    rewrite_feedback:
      "Rewrite the focusText as clear, supportive, professional manager feedback. Return JSON: { result: string (rewritten text) }",
    notes_to_action_items:
      "Turn the current check-in notes into concrete action items. Return JSON: { result: string (summary), suggestions: string[] (action item bullets) }",
    create_follow_up_task:
      "Suggest 1-3 follow-up tasks based on the conversation. Return JSON: { result: string, followUpTasks: [{ title, assigneeRole: 'associate'|'leader', dueDate?: ISO date }] }",
    create_development_goal:
      "Suggest a developmental goal draft based on the conversation. Return JSON: { result: string (rationale), developmentGoal: { goalTitle, focusArea, actionSteps30Day: string[], managerSupportNeeded: string[], successMeasures: string[], targetDate: ISO|null } }",
    summarize_conversation:
      "Summarize the conversation so far for the manager. Return JSON: { result: string (paragraph summary), suggestions: string[] (key bullets) }",
  };

  try {
    const out = await senecaJson<SenecaAssistAi>(actionInstructions[body.action]!, liveContext);
    return c.json({
      data: {
        ...out,
        suggestions: out.suggestions ? normalizeStringArray(out.suggestions) : undefined,
        developmentGoal: out.developmentGoal
          ? normalizeDevelopmentGoalDraft(out.developmentGoal) ?? undefined
          : undefined,
      },
    });
  } catch (e) {
    return c.json({ error: { message: e instanceof Error ? e.message : "Seneca assist failed" } }, 500);
  }
});

senecaRouter.post("/:memberUserId/seneca/summary", zValidator("json", summaryBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  const raw = await buildSenecaRawContext(teamId, memberUserId, {
    memberName: body.memberName,
    managerName: body.managerName,
  });

  const payload = JSON.stringify({ background: raw, completedCheckIn: body }, null, 2);

  try {
    const summary = await senecaJson<SenecaSummaryAi>(
      `Generate a post-check-in summary for the manager after completing a 1:1 with ${body.memberName ?? raw.memberName}.
Return JSON with:
- conversationSummary (string)
- winsDiscussed (string[])
- opportunitiesDiscussed (string[])
- actionItems (string[])
- followUpTasks ([{ title, assigneeRole: 'associate'|'leader', dueDate?: ISO }])
- suggestedNextCheckInDate (ISO date string or null, typically 2-4 weeks out)
- draftDevelopmentGoal (object or null): { goalTitle, focusArea, actionSteps30Day, managerSupportNeeded, successMeasures, targetDate }`,
      payload,
    );
    return c.json({
      data: {
        ...summary,
        winsDiscussed: normalizeStringArray(summary.winsDiscussed),
        opportunitiesDiscussed: normalizeStringArray(summary.opportunitiesDiscussed),
        actionItems: normalizeStringArray(summary.actionItems),
        followUpTasks: Array.isArray(summary.followUpTasks) ? summary.followUpTasks : [],
        draftDevelopmentGoal: normalizeDevelopmentGoalDraft(summary.draftDevelopmentGoal),
      },
    });
  } catch (e) {
    return c.json({ error: { message: e instanceof Error ? e.message : "Seneca summary failed" } }, 500);
  }
});

senecaRouter.post("/:memberUserId/seneca/development-plan", zValidator("json", devPlanBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  const raw = await buildSenecaRawContext(teamId, memberUserId, {
    memberName: body.memberName,
    managerName: body.managerName,
  });

  const payload = JSON.stringify(
    { member: raw, contextNotes: body.contextNotes, checkInSummary: body.checkInSummary },
    null,
    2,
  );

  try {
    const plan = await senecaJson<SenecaDevPlanAi>(
      `Create a structured 30-day development plan draft for ${raw.memberName}.
Return JSON with:
- goalTitle (string)
- focusArea (string)
- actionSteps30Day (string[]): 3-5 concrete steps
- managerSupportNeeded (string[]): how the manager can help
- successMeasures (string[]): measurable outcomes
- targetDate (ISO date ~30 days out or null)
- status: "active"`,
      payload,
    );
    const normalized = normalizeDevelopmentGoalDraft(plan);
    if (!normalized) {
      return c.json({ error: { message: "Seneca returned an invalid development plan." } }, 500);
    }
    return c.json({ data: { ...normalized, status: "active" as const } });
  } catch (e) {
    return c.json({ error: { message: e instanceof Error ? e.message : "Seneca development plan failed" } }, 500);
  }
});

senecaRouter.post("/:memberUserId/seneca/quick-goal", zValidator("json", quickGoalBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canManageDevelopmentGoal(membership, memberUserId)) {
    return c.json({ error: { message: "Not allowed to create development goals for this member" } }, 403);
  }

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  const raw = await buildSenecaRawContext(teamId, memberUserId, {
    memberName: body.memberName,
    managerName: body.managerName,
  });

  const payload = JSON.stringify(
    { member: raw, skillOrGoalRequest: body.skillOrGoal },
    null,
    2,
  );

  try {
    const goal = await senecaJson<{ skill: string; steps: string[] }>(
      `Create a development goal for ${raw.memberName} based on this request: "${body.skillOrGoal}".
Return JSON with:
- skill (string): concise goal or skill title
- steps (string[]): 2 to 5 concrete, actionable steps (maximum 5)`,
      payload,
    );
    const normalized = normalizeQuickDevelopmentGoal(goal);
    if (!normalized) {
      return c.json({ error: { message: "Seneca returned an invalid development goal." } }, 500);
    }
    return c.json({ data: normalized });
  } catch (e) {
    return c.json({ error: { message: e instanceof Error ? e.message : "Seneca goal creation failed" } }, 500);
  }
});

// Simple text rewrite endpoint for inline use
senecaRouter.post("/:memberUserId/seneca/rewrite", async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  const body = await c.req.json<{ text?: string; memberName?: string }>().catch(() => ({ text: undefined, memberName: undefined }));
  if (!body.text?.trim()) return c.json({ error: { message: "text is required" } }, 400);

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  try {
    const result = await senecaText(
      `Rewrite this manager feedback about ${body.memberName ?? "a team member"} to be clear, supportive, and professional. Return only the rewritten text, no quotes.`,
      body.text,
    );
    return c.json({ data: { result } });
  } catch (e) {
    return c.json({ error: { message: e instanceof Error ? e.message : "Rewrite failed" } }, 500);
  }
});

export { senecaRouter };
