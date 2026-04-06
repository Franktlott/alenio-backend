import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const pollsRouter = new Hono<{ Variables: Variables }>();
pollsRouter.use("*", authGuard);

// GET /api/teams/:teamId/polls — fetch active polls, lazily delete expired (>24h after endsAt)
pollsRouter.get("/:teamId/polls", async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
  });
  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

  // Auto-delete polls that ended more than 24h ago
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.poll.deleteMany({ where: { teamId, endsAt: { lt: cutoff } } });

  const polls = await prisma.poll.findMany({
    where: { teamId },
    include: {
      createdBy: { select: { id: true, name: true, image: true } },
      options: {
        include: {
          votes: { select: { userId: true } },
        },
      },
      votes: { select: { userId: true, optionId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ data: polls });
});

// POST /api/teams/:teamId/polls — create a poll
pollsRouter.post(
  "/:teamId/polls",
  zValidator("json", z.object({
    question: z.string().min(1).max(500),
    options: z.array(z.string().min(1).max(200)).min(2).max(6),
    durationHours: z.number().int().min(1).max(168), // 1h to 7 days
  })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const { question, options, durationHours } = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

    const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    const poll = await prisma.poll.create({
      data: {
        teamId,
        createdById: user.id,
        question,
        endsAt,
        options: {
          create: options.map((text) => ({ text })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
        options: { include: { votes: { select: { userId: true } } } },
        votes: { select: { userId: true, optionId: true } },
      },
    });

    return c.json({ data: poll }, 201);
  }
);

// POST /api/teams/:teamId/polls/:pollId/vote — vote or change vote
pollsRouter.post(
  "/:teamId/polls/:pollId/vote",
  zValidator("json", z.object({ optionId: z.string() })),
  async (c) => {
    const user = c.get("user")!;
    const { teamId, pollId } = c.req.param();
    const { optionId } = c.req.valid("json");

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    });
    if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);

    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { options: true } });
    if (!poll || poll.teamId !== teamId) return c.json({ error: { message: "Poll not found", code: "NOT_FOUND" } }, 404);
    if (new Date() > poll.endsAt) return c.json({ error: { message: "Poll has ended", code: "POLL_ENDED" } }, 400);

    const validOption = poll.options.find((o) => o.id === optionId);
    if (!validOption) return c.json({ error: { message: "Invalid option", code: "VALIDATION_ERROR" } }, 400);

    // Upsert: change vote if already voted
    await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: user.id } },
      create: { pollId, optionId, userId: user.id },
      update: { optionId },
    });

    const updated = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        createdBy: { select: { id: true, name: true, image: true } },
        options: { include: { votes: { select: { userId: true } } } },
        votes: { select: { userId: true, optionId: true } },
      },
    });

    return c.json({ data: updated });
  }
);

// DELETE /api/teams/:teamId/polls/:pollId — creator or owner/team_leader can delete
pollsRouter.delete("/:teamId/polls/:pollId", async (c) => {
  const user = c.get("user")!;
  const { teamId, pollId } = c.req.param();

  const [membership, poll] = await Promise.all([
    prisma.teamMember.findUnique({ where: { userId_teamId: { userId: user.id, teamId } } }),
    prisma.poll.findUnique({ where: { id: pollId } }),
  ]);

  if (!membership) return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  if (!poll || poll.teamId !== teamId) return c.json({ error: { message: "Poll not found", code: "NOT_FOUND" } }, 404);

  const canDelete =
    poll.createdById === user.id ||
    ["owner", "team_leader"].includes(membership.role);

  if (!canDelete) return c.json({ error: { message: "Not allowed", code: "FORBIDDEN" } }, 403);

  await prisma.poll.delete({ where: { id: pollId } });
  return new Response(null, { status: 204 });
});

export { pollsRouter };
