import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prisma } from "../prisma";
import { senecaAvailable, senecaJson, senecaUnavailableMessage } from "../lib/seneca-openai";
import { normalizeCheckInTemplateDraft } from "../lib/seneca-normalize";
import { resolveSenecaScope } from "../lib/seneca-scope";
import { askWorkspaceSeneca } from "../lib/seneca-ask-service";
import { authorize, actorFromSession } from "../lib/authorization";

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

export async function handleManagerWorkspaceAsk(c: any) {
  const user = c.get("user") as { id: string };
  const teamId = c.req.param("teamId") as string;
  const body = c.req.valid("json");

  const actor = actorFromSession(user);
  if (!actor) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  const seneca = await authorize({
    actor,
    action: "seneca.use",
    resource: { type: "workspace", id: teamId },
  });
  if (!seneca.allow) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const resolution = await resolveSenecaScope(user.id, {
    type: "workspace",
    workspaceId: teamId,
  });
  if (!resolution.ok) {
    return c.json(
      { error: { message: resolution.message, code: resolution.code } },
      resolution.status,
    );
  }
  if (
    resolution.scope.type !== "workspace" ||
    !resolution.scope.capabilities.canUseManagerContext
  ) {
    return c.json({ error: { message: "Only managers can use Seneca" } }, 403);
  }

  const data = await askWorkspaceSeneca(
    teamId,
    user.id,
    body.question,
    body.messages,
    prisma,
  );
  return c.json({ data });
}

senecaTeamRouter.post("/ask", zValidator("json", askBodySchema), handleManagerWorkspaceAsk);

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
