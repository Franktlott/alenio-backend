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
});

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
};

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
      { title: "Schedule check-in", description: "Open Team and start 1:1 prep", action: "schedule_check_in" },
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

  if (!senecaAvailable()) {
    return c.json({
      data: {
        available: false,
        ...ruleBasedAskResponse(body.question, ctx),
      },
    });
  }

  try {
    const out = await senecaJson<SenecaAskAi>(
      `You are Seneca, an AI leadership assistant for frontline managers using Alenio.
Answer the manager's question using ONLY the workspace context JSON below.
- Be practical, warm, and concise (2-4 sentences unless they ask for a list).
- If they ask for a leadership quote, give a short quote plus one sentence on how it applies to their team today.
- If they ask about a manager, leader, or team member, use names and stats from the context.
- If the context lacks information, say what you know and suggest a concrete next step.
- Do not invent tasks, people, or metrics not in the context.

${SENECA_DATA_GROUNDING_RULES}

Manager question: "${body.question}"

Return JSON:
{
  "message": "string — your direct answer",
  "insights": [{ "label": "string", "detail": "optional string" }],
  "suggestedActions": [{ "title": "string", "description": "string", "action": "view_overdue_tasks"|"schedule_check_in"|"create_recognition"|"create_follow_up_task"|"build_checklist"|"open_team" }]
}
Include 0-4 insights and 0-3 suggestedActions when helpful.`,
      senecaWorkspaceContextToPrompt(ctx),
    );

    return c.json({
      data: {
        available: true,
        message: out.message?.trim() || "I'm here to help you lead the floor. What would you like to focus on?",
        insights: Array.isArray(out.insights) ? out.insights.slice(0, 6) : [],
        suggestedActions: Array.isArray(out.suggestedActions) ? out.suggestedActions.slice(0, 4) : [],
      },
    });
  } catch (e) {
    const fallback = ruleBasedAskResponse(body.question, ctx);
    return c.json({
      data: {
        available: false,
        message: e instanceof Error ? e.message : fallback.message,
        insights: fallback.insights ?? [],
        suggestedActions: fallback.suggestedActions ?? [],
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
      `Create a manager-led 1:1 check-in template based on this request: "${body.brief}".
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
