import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { SENECA_DATA_GROUNDING_RULES } from "../lib/seneca-grounding";
import { senecaAvailable, senecaJson, senecaUnavailableMessage } from "../lib/seneca-openai";
import {
  buildSenecaWorkspaceContext,
  senecaWorkspaceContextToPrompt,
} from "../lib/seneca-workspace-context";
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
};

async function loadUpcomingPlannedCheckIns(
  teamId: string,
  managerUserId: string,
  ctx: Awaited<ReturnType<typeof buildSenecaWorkspaceContext>>,
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
  ctx: Awaited<ReturnType<typeof buildSenecaWorkspaceContext>>,
  managerTimeZone: string,
): SenecaCancelOneOnOneProposal | null {
  if (!conversationHasCancelCheckInTopic(messages, question)) return null;
  return finalizeCancelOneOnOneProposal(draft ?? {}, question, messages, upcoming, ctx, managerTimeZone);
}

function resolvePlanProposal(
  draft: SenecaPlanOneOnOneDraft | null | undefined,
  question: string,
  messages: SenecaChatTurn[],
  ctx: Awaited<ReturnType<typeof buildSenecaWorkspaceContext>>,
  managerTimeZone: string,
): SenecaPlanOneOnOneProposal | null {
  const sourceText = conversationSourceText(messages, question);
  if (!conversationHasScheduleTopic(messages, question)) return null;
  return finalizePlanOneOnOneProposal(draft ?? {}, question, ctx, managerTimeZone, sourceText);
}

function ruleBasedAskResponse(question: string, ctx: Awaited<ReturnType<typeof buildSenecaWorkspaceContext>>): SenecaAskAi {
  const q = question.toLowerCase();
  const leaders = ctx.members.filter((m) => m.role === "Owner" || m.role === "Team leader");

  if (q.includes("quote")) {
    return {
      message:
        "Leadership is practiced in the small moments — a clear expectation, a timely check-in, and recognition when the floor runs well. What routine on your team deserves more consistency this week?",
      suggestedActions: [
        {
          title: "Recognize a team win",
          description: "Post a shout-out on the activity feed",
          action: "create_recognition",
        },
      ],
    };
  }

  if (q.includes("manager") || q.includes("leader") || q.includes("owner")) {
    const leaderNames = leaders.map((m) => `${m.name} (${m.role})`).join(", ");
    return {
      message: leaderNames
        ? `In ${ctx.teamName}, your leadership roles include: ${leaderNames}. I can help you prep check-ins, follow up on tasks, or recognize wins across the team.`
        : `I don't see a designated team leader in ${ctx.teamName} yet. Check Team to confirm roles and ownership.`,
      insights: leaders.map((m) => ({
        label: m.name,
        detail: `${m.role} · ${m.overdueTasks} overdue · ${m.activeDevGoals} dev goal${m.activeDevGoals !== 1 ? "s" : ""}`,
      })),
      suggestedActions: [{ title: "Open Team", description: "Review members and roles", action: "open_team" }],
    };
  }

  if (ctx.overdueTasks.length > 0) {
    return {
      message: `${ctx.teamName} has ${ctx.overdueTasks.length} overdue task${ctx.overdueTasks.length !== 1 ? "s" : ""} right now. Start there before adding new work.`,
      insights: ctx.overdueTasks.slice(0, 3).map((t) => ({
        label: t.title,
        detail: `${t.assigneeNames.join(", ")}${t.dueDate ? ` · due ${new Date(t.dueDate).toLocaleDateString()}` : ""}`,
      })),
      suggestedActions: [
        {
          title: "View overdue tasks",
          description: "Open Workspace filtered to past-due work",
          action: "view_overdue_tasks",
        },
      ],
    };
  }

  return {
    message: `${ctx.teamName} looks steady from here — no overdue tasks flagged. Consider a proactive check-in or recognition post to keep momentum.`,
    suggestedActions: [
      { title: "Schedule check-in", description: "Open Team and start check-in prep", action: "schedule_check_in" },
      { title: "Recognize a win", description: "Celebrate progress on the activity feed", action: "create_recognition" },
    ],
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

  const ctx = await buildSenecaWorkspaceContext(teamId, user.id);
  const manager = await prisma.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });
  const managerTimeZone = resolveTimeZone(manager?.timezone);

  if (!senecaAvailable()) {
    const fallback = ruleBasedAskResponse(body.question, ctx);
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
    return c.json({
      data: {
        available: false,
        message: cancelOneOnOne
          ? buildCancelConfirmationMessage(cancelOneOnOne)
          : planOneOnOne
            ? buildPlanConfirmationMessage(planOneOnOne)
            : cancelIntent
              ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
              : fallback.message,
        insights: fallback.insights ?? [],
        suggestedActions: cancelOneOnOne || planOneOnOne
          ? []
          : fallback.suggestedActions ?? [],
        planOneOnOne,
        cancelOneOnOne,
      },
    });
  }

  try {
    const cancelIntent = conversationHasCancelCheckInTopic(body.messages, body.question);
    const scheduleIntent = !cancelIntent && conversationHasScheduleTopic(body.messages, body.question);
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
        : `
- NEVER claim you scheduled, created, saved, cancelled, or deleted calendar events, tasks, or check-ins unless the manager has already confirmed an action in this app.
- Treat the conversation as continuous. Follow-up messages refer to earlier context.
`;

    const out = await senecaJson<SenecaAskAi>(
      `You are Seneca, an AI leadership assistant for frontline managers using Alenio.
Answer the manager using ONLY the workspace context JSON below and the conversation history.
- Be practical, warm, and concise (2-4 sentences unless they ask for a list).
- If they ask for a leadership quote, give a short quote plus one sentence on how it applies to their team today.
- If they ask about a manager, leader, or team member, use names and stats from the context.
- If the context lacks information, say what you know and suggest a concrete next step.
- Do not invent tasks, people, or metrics not in the context.
${schedulingRules}
${SENECA_DATA_GROUNDING_RULES}

${conversationPrompt}

Return JSON:
{
  "message": "string — your direct answer",
  "insights": [{ "label": "string", "detail": "optional string" }],
  "suggestedActions": [{ "title": "string", "description": "string", "action": "view_overdue_tasks"|"schedule_check_in"|"create_recognition"|"create_follow_up_task"|"build_checklist"|"open_team" }],
  "planOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD", "time": "HH:mm or null", "durationMinutes": 45 } | null,
  "cancelOneOnOne": { "memberName": "string", "date": "YYYY-MM-DD or null", "time": "HH:mm or null" } | null
}
Include 0-4 insights and 0-3 suggestedActions when helpful.`,
      JSON.stringify(
        {
          ...ctx,
          ...(cancelIntent ? { upcomingPlannedCheckIns: upcomingPlanned.map((event) => ({
            memberName: event.memberName,
            startDate: event.startDate.toISOString(),
          })) } : {}),
        },
        null,
        2,
      ),
    );

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
    const message = cancelOneOnOne
      ? buildCancelConfirmationMessage(cancelOneOnOne)
      : planOneOnOne
        ? buildPlanConfirmationMessage(planOneOnOne)
        : cancelIntent
          ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
          : out.message?.trim() || "I'm here to help you lead the floor. What would you like to focus on?";

    return c.json({
      data: {
        available: true,
        message,
        insights: Array.isArray(out.insights) ? out.insights.slice(0, 6) : [],
        suggestedActions: cancelOneOnOne || planOneOnOne
          ? []
          : Array.isArray(out.suggestedActions)
            ? out.suggestedActions.slice(0, 4)
            : [],
        planOneOnOne,
        cancelOneOnOne,
      },
    });
  } catch (e) {
    const fallback = ruleBasedAskResponse(body.question, ctx);
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
    return c.json({
      data: {
        available: false,
        message: cancelOneOnOne
          ? buildCancelConfirmationMessage(cancelOneOnOne)
          : planOneOnOne
            ? buildPlanConfirmationMessage(planOneOnOne)
            : cancelIntent
              ? buildCancelClarificationMessage(upcomingPlanned, managerTimeZone)
              : e instanceof Error
                ? e.message
                : fallback.message,
        insights: fallback.insights ?? [],
        suggestedActions: cancelOneOnOne || planOneOnOne
          ? []
          : fallback.suggestedActions ?? [],
        planOneOnOne,
        cancelOneOnOne,
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
