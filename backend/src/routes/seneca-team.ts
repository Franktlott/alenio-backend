import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { senecaAvailable, senecaJson, senecaUnavailableMessage } from "../lib/seneca-openai";
import { assembleForWorkspaceTeam } from "../lib/seneca-prompt-assembly";
import { workspaceOwner } from "../lib/seneca-config-service";
import { env } from "../env";
import { buildSenecaChatContext, senecaChatContextToPrompt } from "../lib/seneca-chat-context";
import type { SenecaWorkspaceContext } from "../lib/seneca-workspace-context";
import { normalizeCheckInTemplateDraft } from "../lib/seneca-normalize";
import {
  buildPlanConfirmationMessage,
  conversationHasScheduleTopic,
  conversationSourceText,
  finalizePlanOneOnOneProposal,
  type SenecaPlanOneOnOneDraft,
  type SenecaPlanOneOnOneProposal,
} from "../lib/seneca-plan-one-on-one";
import {
  buildCancelClarificationMessage,
  buildCancelConfirmationMessage,
  conversationHasCancelCheckInTopic,
  finalizeCancelOneOnOneProposal,
  type PlannedCheckInEventRow,
  type SenecaCancelOneOnOneDraft,
  type SenecaCancelOneOnOneProposal,
} from "../lib/seneca-cancel-one-on-one";
import {
  buildCreateTaskConfirmationMessage,
  conversationHasCreateTaskTopic,
  conversationSourceText as createTaskConversationSourceText,
  finalizeCreateTaskProposal,
  type SenecaCreateTaskDraft,
  type SenecaCreateTaskProposal,
} from "../lib/seneca-create-task";
import { calendarDayFromInstant, resolveTimeZone } from "../lib/timezone";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const senecaTeamRouter = new Hono<{ Variables: Variables }>();
senecaTeamRouter.use("*", authGuard);

async function getMembership(userId: string, teamId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function canUseSeneca(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

const checkInTemplateBodySchema = z.object({
  brief: z.string().trim().min(1, "Describe the check-in you want").max(500),
});

const askBodySchema = z.object({
  question: z.string().trim().min(1, "Ask Seneca a question").max(1000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

type SenecaChatTurn = z.infer<typeof askBodySchema>["messages"][number];

function formatConversationForPrompt(messages: SenecaChatTurn[], question: string): string {
  const prior = messages.slice(-12);
  if (prior.length === 0) {
    return `Manager question: "${question}"`;
  }
  const lines = prior.map((message) =>
    message.role === "user" ? `Manager: ${message.content}` : `Seneca: ${message.content}`,
  );
  lines.push(`Manager: ${question}`);
  return `Conversation so far:\n${lines.join("\n")}\n\nRespond to the manager's latest message in context.`;
}

type SenecaAskActionId =
  | "view_overdue_tasks"
  | "schedule_check_in"
  | "create_recognition"
  | "create_follow_up_task"
  | "build_checklist"
  | "open_team";

type SenecaAskAi = {
  message: string;
  insights?: Array<{ label: string; detail?: string }>;
  suggestedActions?: Array<{
    title: string;
    description: string;
    action: SenecaAskActionId;
  }>;
  planOneOnOne?: SenecaPlanOneOnOneDraft | null;
  cancelOneOnOne?: SenecaCancelOneOnOneDraft | null;
  createTask?: SenecaCreateTaskDraft | null;
};

async function loadUpcomingPlannedCheckIns(
  teamId: string,
  managerUserId: string,
  ctx: SenecaWorkspaceContext,
): Promise<PlannedCheckInEventRow[]> {
  const now = Date.now();
  const events = await prisma.calendarEvent.findMany({
    where: {
      teamId,
      createdById: managerUserId,
      isOneOnOne: true,
      oneOnOneMemberUserId: { not: null },
    },
    orderBy: { startDate: "asc" },
  });

  const memberNameById = new Map(ctx.members.map((member) => [member.userId, member.name]));

  return events
    .filter((event) => new Date(event.endDate ?? event.startDate).getTime() >= now)
    .map((event) => ({
      id: event.id,
      memberUserId: event.oneOnOneMemberUserId!,
      memberName: memberNameById.get(event.oneOnOneMemberUserId!) ?? "Team member",
      startDate: event.startDate,
    }));
}

function resolveCancelProposal(
  draft: SenecaCancelOneOnOneDraft | null | undefined,
  question: string,
  messages: SenecaChatTurn[],
  upcoming: PlannedCheckInEventRow[],
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
): SenecaCancelOneOnOneProposal | null {
  if (!conversationHasCancelCheckInTopic(messages, question)) return null;
  return finalizeCancelOneOnOneProposal(draft ?? {}, question, messages, upcoming, ctx, managerTimeZone);
}

function resolvePlanProposal(
  draft: SenecaPlanOneOnOneDraft | null | undefined,
  question: string,
  messages: SenecaChatTurn[],
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
): SenecaPlanOneOnOneProposal | null {
  const sourceText = conversationSourceText(messages, question);
  if (!conversationHasScheduleTopic(messages, question)) return null;
  return finalizePlanOneOnOneProposal(draft ?? {}, question, ctx, managerTimeZone, sourceText);
}

function resolveCreateTaskProposal(
  draft: SenecaCreateTaskDraft | null | undefined,
  question: string,
  messages: SenecaChatTurn[],
  ctx: SenecaWorkspaceContext,
  managerTimeZone: string,
): SenecaCreateTaskProposal | null {
  const sourceText = createTaskConversationSourceText(messages, question);
  if (!conversationHasCreateTaskTopic(messages, question)) return null;
  return finalizeCreateTaskProposal(draft ?? {}, question, ctx, managerTimeZone, sourceText);
}

function ruleBasedAskResponse(question: string): SenecaAskAi {
  const q = question.toLowerCase();

  if (q.includes("quote")) {
    return {
      message:
        "Leadership is practiced in the small moments — a clear expectation, a timely check-in, and recognition when the floor runs well. What would you like help with on your team this week?",
    };
  }

  return {
    message:
      "I'm here to help with leadership coaching, check-in scheduling, and team conversations. What would you like to work on?",
  };
}

senecaTeamRouter.post("/ask", zValidator("json", askBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || !canUseSeneca(membership.role)) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  const ctx = await buildSenecaChatContext(teamId, user.id);
  const manager = await prisma.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });
  const managerTimeZone = resolveTimeZone(manager?.timezone);

  if (!senecaAvailable()) {
    const fallback = ruleBasedAskResponse(body.question);
    const cancelIntent = conversationHasCancelCheckInTopic(body.messages, body.question);
    const upcomingPlanned = cancelIntent
      ? await loadUpcomingPlannedCheckIns(teamId, user.id, ctx)
      : [];
    const cancelOneOnOne = resolveCancelProposal(
      null,
      body.question,
      body.messages,
      upcomingPlanned,
      ctx,
      managerTimeZone,
    );
    const planOneOnOne = cancelOneOnOne
      ? null
      : resolvePlanProposal(null, body.question, body.messages, ctx, managerTimeZone);
    const createTask = cancelOneOnOne || planOneOnOne
      ? null
      : resolveCreateTaskProposal(null, body.question, body.messages, ctx, managerTimeZone);
    return c.json({
      data: {
        available: false,
        message: cancelOneOnOne
          ? buildCancelConfirmationMessage(cancelOneOnOne)
          : planOneOnOne
            ? buildPlanConfirmationMessage(planOneOnOne)
            : createTask
              ? buildCreateTaskConfirmationMessage(createTask)
              : cancelIntent
                ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
                : fallback.message,
        insights: [],
        suggestedActions: cancelOneOnOne || planOneOnOne || createTask ? [] : [],
        planOneOnOne,
        cancelOneOnOne,
        createTask,
      },
    });
  }

  try {
    const cancelIntent = conversationHasCancelCheckInTopic(body.messages, body.question);
    const scheduleIntent = !cancelIntent && conversationHasScheduleTopic(body.messages, body.question);
    const taskIntent =
      !cancelIntent && !scheduleIntent && conversationHasCreateTaskTopic(body.messages, body.question);
    const upcomingPlanned = cancelIntent
      ? await loadUpcomingPlannedCheckIns(teamId, user.id, ctx)
      : [];
    const conversationPrompt = formatConversationForPrompt(body.messages, body.question);
    const todayYmd = calendarDayFromInstant(new Date(), managerTimeZone);
    const todayLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: managerTimeZone,
    });
    const schedulingRules = scheduleIntent
      ? `
SCHEDULING A CHECK-IN (critical):
- The manager wants to schedule or plan a check-in, or is continuing a scheduling conversation.
- You CANNOT create calendar events yourself.
- NEVER say you have already scheduled, booked, or added anything to the calendar unless the manager explicitly confirmed in this same conversation and you are only restating the pending plan for confirmation.
- Use the full conversation to resolve member, date, time, and duration. Follow-up messages like "yes", "confirm", or "make it 2pm" refer to the plan under discussion.
- The manager's local date today (${managerTimeZone}) is ${todayYmd} (${todayLabel}). Interpret "today", "tonight", and "tomorrow" relative to this date.
- Extract member name, date (YYYY-MM-DD), optional time (HH:mm 24h), and durationMinutes. Use team member names from context only.
- In "message", summarize the proposed plan and ask them to confirm before it is added.
- Return "planOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD", "time": "HH:mm or null", "durationMinutes": 45 } when you have enough detail.
- If date or member is unclear, ask a clarifying question in "message" and set planOneOnOne to null.
`
      : cancelIntent
        ? `
CANCELLING A CHECK-IN (critical):
- The manager wants to delete, cancel, or remove a scheduled check-in, or is confirming a cancellation.
- You CANNOT delete calendar events yourself.
- NEVER say you have already cancelled or deleted anything unless the manager explicitly confirmed in this same conversation and you are only restating the pending cancellation for confirmation.
- Use the full conversation and upcomingPlannedCheckIns in context to identify the right event by member and/or date/time.
- Return "cancelOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD or null", "time": "HH:mm or null" } when you have enough detail.
- In "message", summarize what you will cancel and ask them to confirm before it is removed.
- If the check-in is unclear, ask which one using upcomingPlannedCheckIns and set cancelOneOnOne to null.
`
        : taskIntent
          ? `
CREATING A TASK (critical):
- The manager wants to create or assign a task for a team member, or is continuing a task-creation conversation.
- You CANNOT create tasks yourself.
- NEVER say you have already created, assigned, or saved a task unless the manager explicitly confirmed in this same conversation and you are only restating the pending task for confirmation.
- Do NOT give generic coaching advice (like "check in with them") when the manager is providing task details. Stay in task-creation mode until they confirm or dismiss.
- Use the full conversation to resolve assignee, title, description, due date, and priority. Follow-up messages like "yes", "confirm", or added details refer to the task under discussion.
- The manager's local date today (${managerTimeZone}) is ${todayYmd} (${todayLabel}). Interpret "today", "tonight", "tomorrow", and weekdays like "this Sunday" or "by Sunday" relative to this date.
- When assignee and work are clear, ALWAYS return createTask with title, assignee names, dueDate, and priority. The app shows a confirmation card — your job is to draft, not coach.
- For multiple assignees, default to separate tasks (one per person) unless the manager asks for a joint/shared task.
- Use isJoint=true only when they want one shared task for everyone. Use isJoint=false for separate individual tasks.
- Phrases like "joint task", "shared task", or "work together" mean isJoint=true. Phrases like "separate tasks" or "each their own" mean isJoint=false.
- Return "createTask": { "title": "string", "description": "string or null", "assigneeName": "string or null", "assigneeNames": ["string"], "dueDate": "YYYY-MM-DD or null", "priority": "low|medium|high or null", "isJoint": true|false|null } when you have enough detail (at minimum assignee and title).
- In "message", summarize the proposed task and ask them to confirm below before it is created.
- If assignee or title is unclear, ask one short clarifying question in "message" and set createTask to null.
`
          : `
- NEVER claim you scheduled, created, saved, cancelled, or deleted calendar events, tasks, or check-ins unless the manager has already confirmed an action in this app.
- Treat the conversation as continuous. Follow-up messages refer to earlier context.
`;

    const started = Date.now();
    let assembledSystemPrompt: string | undefined;
    let assembledMeta: Awaited<ReturnType<typeof assembleForWorkspaceTeam>> | null = null;
    try {
      assembledMeta = await assembleForWorkspaceTeam(prisma, teamId, {
        templateKey: "general_coaching",
        requestContext: conversationPrompt,
      });
      assembledSystemPrompt = assembledMeta.systemPrompt;
    } catch {
      assembledSystemPrompt = undefined;
    }

    const out = await senecaJson<SenecaAskAi>(
      `Answer using the conversation history and the light team context below (team name and member names only).
- Be practical, warm, and concise (2-4 sentences unless they ask for a list).
- You do NOT have access to live tasks, metrics, overdue work, or check-in history unless the manager tells you in chat.
- Do not invent tasks, overdue items, or performance data.
- For leadership coaching, give actionable advice grounded in what the manager shares.
- Use team member names from context when scheduling check-ins.
${schedulingRules}

${conversationPrompt}

Return JSON:
{
  "message": "string — your direct answer",
  "planOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD", "time": "HH:mm or null", "durationMinutes": 45 } | null,
  "cancelOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD or null", "time": "HH:mm or null" } | null,
  "createTask": { "title": "string", "description": "string or null", "assigneeName": "string or null", "assigneeNames": ["string"], "dueDate": "YYYY-MM-DD or null", "priority": "low|medium|high or null", "isJoint": true|false|null } | null
}`,
      cancelIntent
        ? JSON.stringify(
            {
              teamName: ctx.teamName,
              members: ctx.members.map((member) => member.name),
              upcomingPlannedCheckIns: upcomingPlanned.map((event) => ({
                memberName: event.memberName,
                startDate: event.startDate.toISOString(),
              })),
            },
            null,
            2,
          )
        : senecaChatContextToPrompt(ctx),
      assembledSystemPrompt ? { systemPrompt: assembledSystemPrompt } : undefined,
    );

    void prisma.senecaGeneration
      .create({
        data: {
          ownerType: workspaceOwner(teamId).ownerType,
          ownerId: teamId,
          userId: user.id,
          source: "ask",
          model: env.OPENAI_MODEL,
          promptVersion: assembledMeta?.promptVersion ?? null,
          knowledgeUsed: assembledMeta ? JSON.stringify(assembledMeta.knowledgeUsed) : null,
          contextUsed: assembledMeta ? JSON.stringify(assembledMeta.contextLayers) : null,
          question: body.question,
          response: out.message ?? null,
          latencyMs: Date.now() - started,
        },
      })
      .catch(() => {
        /* logging must not break ask */
      });

    const cancelOneOnOne = resolveCancelProposal(
      out.cancelOneOnOne,
      body.question,
      body.messages,
      upcomingPlanned,
      ctx,
      managerTimeZone,
    );
    const planOneOnOne = cancelOneOnOne
      ? null
      : resolvePlanProposal(out.planOneOnOne, body.question, body.messages, ctx, managerTimeZone);
    const createTask = cancelOneOnOne || planOneOnOne
      ? null
      : resolveCreateTaskProposal(out.createTask, body.question, body.messages, ctx, managerTimeZone);
    const message = cancelOneOnOne
      ? buildCancelConfirmationMessage(cancelOneOnOne)
      : planOneOnOne
        ? buildPlanConfirmationMessage(planOneOnOne)
        : createTask
          ? buildCreateTaskConfirmationMessage(createTask)
          : cancelIntent
            ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
            : out.message?.trim() || "I'm here to help you lead the floor. What would you like to focus on?";

    return c.json({
      data: {
        available: true,
        message,
        insights: [],
        suggestedActions: [],
        planOneOnOne,
        cancelOneOnOne,
        createTask,
      },
    });
  } catch (e) {
    const fallback = ruleBasedAskResponse(body.question);
    const cancelIntent = conversationHasCancelCheckInTopic(body.messages, body.question);
    const upcomingPlanned = cancelIntent
      ? await loadUpcomingPlannedCheckIns(teamId, user.id, ctx)
      : [];
    const cancelOneOnOne = resolveCancelProposal(
      null,
      body.question,
      body.messages,
      upcomingPlanned,
      ctx,
      managerTimeZone,
    );
    const planOneOnOne = cancelOneOnOne
      ? null
      : resolvePlanProposal(null, body.question, body.messages, ctx, managerTimeZone);
    const createTask = cancelOneOnOne || planOneOnOne
      ? null
      : resolveCreateTaskProposal(null, body.question, body.messages, ctx, managerTimeZone);
    return c.json({
      data: {
        available: false,
        message: cancelOneOnOne
          ? buildCancelConfirmationMessage(cancelOneOnOne)
          : planOneOnOne
            ? buildPlanConfirmationMessage(planOneOnOne)
            : createTask
              ? buildCreateTaskConfirmationMessage(createTask)
              : cancelIntent
                ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
                : e instanceof Error
                  ? e.message
                  : fallback.message,
        insights: [],
        suggestedActions: cancelOneOnOne || planOneOnOne || createTask ? [] : [],
        planOneOnOne,
        cancelOneOnOne,
        createTask,
      },
    });
  }
});

senecaTeamRouter.post("/check-in-template", zValidator("json", checkInTemplateBodySchema), async (c) => {
  const user = c.get("user")!;
  const teamId = c.req.param("teamId") as string;
  const body = c.req.valid("json");

  const membership = await getMembership(user.id, teamId);
  if (!membership || membership.role !== "owner") {
    return c.json(
      { error: { message: "Only the workspace owner can generate check-in templates", code: "FORBIDDEN" } },
      403,
    );
  }

  if (!senecaAvailable()) {
    return c.json({ error: { message: senecaUnavailableMessage() } }, 503);
  }

  const payload = JSON.stringify({ brief: body.brief }, null, 2);

  try {
    const draft = await senecaJson<unknown>(
      `Create a manager-led check-in template based on this request: "${body.brief}".
Return JSON with:
- title (string): concise template name
- description (string|null): one-sentence summary
- sections (array): 1 to 3 sections, each with:
  - title (string): section heading
  - questions (array): 2 to 10 total questions across all sections, each with:
    - label (string): the question text
    - type ("short_text" | "long_text" | "rating" | "yes_no"): prefer long_text for coaching questions
    - helpText (string|null): optional hint for the associate
    - required (boolean): usually false
    - ratingMax (number): only when type is rating, default 5
- leaderPrep (string[]): 2 to 4 short prep reminders for the manager before the check-in

Use practical, supportive language suited to frontline teams. Do not include leader comments, manager notes, or associate notes fields.`,
      payload,
    );
    const normalized = normalizeCheckInTemplateDraft(draft);
    if (!normalized) {
      return c.json({ error: { message: "Seneca returned an invalid check-in template." } }, 500);
    }
    return c.json({ data: normalized });
  } catch (e) {
    return c.json(
      { error: { message: e instanceof Error ? e.message : "Seneca check-in template failed" } },
      500,
    );
  }
});

export { senecaTeamRouter };
