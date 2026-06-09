import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { prismaRouteError } from "../lib/prisma-errors";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const oneOnOneMeetingsRouter = new Hono<{ Variables: Variables }>();
oneOnOneMeetingsRouter.use("*", authGuard);

type TemplateField = {
  id: string;
  label: string;
  type: string;
  order: number;
  required?: boolean;
  ratingMax?: number;
};

async function getMembership(
  c: { get: (key: "user" | "session") => unknown },
  teamId: string,
) {
  const user = c.get("user") as { id?: string } | null;
  const session = c.get("session") as { user?: { id?: string } } | null;
  const ids = [...new Set([user?.id, session?.user?.id].filter((x): x is string => typeof x === "string" && x.length > 0))];
  for (const userId of ids) {
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
    });
    if (membership) return membership;
  }
  return null;
}

function parseJsonArray(raw: string): TemplateField[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateField[]) : [];
  } catch {
    return [];
  }
}

function parseResponses(raw: string): Record<string, string | number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string | number>;
  } catch {
    return {};
  }
}

function canCreateMeeting(membership: { role: string }, memberUserId: string, userId: string) {
  if (memberUserId === userId) return true;
  return membership.role === "owner" || membership.role === "team_leader";
}

function serializeMeeting(meeting: {
  id: string;
  teamId: string;
  memberUserId: string;
  templateId: string | null;
  templateTitle: string;
  templateFields: string;
  responses: string;
  createdById: string;
  createdAt: Date;
  createdBy?: { id: string; name: string; email: string; image: string | null };
}) {
  return {
    id: meeting.id,
    teamId: meeting.teamId,
    memberUserId: meeting.memberUserId,
    templateId: meeting.templateId,
    templateTitle: meeting.templateTitle,
    templateFields: parseJsonArray(meeting.templateFields),
    responses: parseResponses(meeting.responses),
    createdById: meeting.createdById,
    createdAt: meeting.createdAt.toISOString(),
    createdBy: meeting.createdBy,
  };
}

function validateResponses(fields: TemplateField[], responses: Record<string, string | number>) {
  for (const field of fields) {
    const value = responses[field.id];
    if (field.required) {
      if (field.type === "rating") {
        const num = typeof value === "number" ? value : Number(value);
        if (!Number.isFinite(num) || num < 1) {
          return `${field.label} is required.`;
        }
      } else if (value === undefined || value === null || String(value).trim() === "") {
        return `${field.label} is required.`;
      }
    }
    if (field.type === "rating" && value !== undefined && value !== "") {
      const num = typeof value === "number" ? value : Number(value);
      const max = field.ratingMax ?? 5;
      if (!Number.isFinite(num) || num < 1 || num > max) {
        return `${field.label} must be between 1 and ${max}.`;
      }
    }
  }
  return null;
}

const createMeetingSchema = z.object({
  templateId: z.string().min(1),
  responses: z.record(z.string(), z.union([z.string(), z.number()])),
});

// GET /api/teams/:teamId/members/:memberUserId/one-on-ones
oneOnOneMeetingsRouter.get("/:memberUserId/one-on-ones", async (c) => {
  const teamId = c.req.param("teamId") as string;
  const memberUserId = c.req.param("memberUserId") as string;

  const membership = await getMembership(c, teamId);
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const targetMember = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: memberUserId, teamId } },
  });
  if (!targetMember) {
    return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const meetings = await prisma.oneOnOneMeeting.findMany({
      where: { teamId, memberUserId },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return c.json({ data: meetings.map(serializeMeeting) });
  } catch (err) {
    return prismaRouteError(c, err, "[one-on-one-meetings] GET failed");
  }
});

// POST /api/teams/:teamId/members/:memberUserId/one-on-ones
oneOnOneMeetingsRouter.post(
  "/:memberUserId/one-on-ones",
  zValidator("json", createMeetingSchema),
  async (c) => {
    const user = c.get("user")!;
    const teamId = c.req.param("teamId") as string;
    const memberUserId = c.req.param("memberUserId") as string;

    const membership = await getMembership(c, teamId);
    if (!membership) {
      return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
    }

    if (!canCreateMeeting(membership, memberUserId, user.id)) {
      return c.json({ error: { message: "You cannot create a 1:1 for this member", code: "FORBIDDEN" } }, 403);
    }

    const targetMember = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: memberUserId, teamId } },
    });
    if (!targetMember) {
      return c.json({ error: { message: "Member not found", code: "NOT_FOUND" } }, 404);
    }

    const body = c.req.valid("json");
    const template = await prisma.oneOnOneTemplate.findFirst({
      where: { id: body.templateId, teamId },
    });
    if (!template) {
      return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
    }

    const fields = parseJsonArray(template.fields);
    const validationError = validateResponses(fields, body.responses);
    if (validationError) {
      return c.json({ error: { message: validationError, code: "VALIDATION_ERROR" } }, 400);
    }

    const meeting = await prisma.oneOnOneMeeting.create({
      data: {
        teamId,
        memberUserId,
        templateId: template.id,
        templateTitle: template.title,
        templateFields: template.fields,
        responses: JSON.stringify(body.responses),
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return c.json({ data: serializeMeeting(meeting) }, 201);
  },
);

export { oneOnOneMeetingsRouter };
