import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import {
  buildConnectionPairKey,
  canMessage,
  isBlockedEitherWay,
  messagePermissionErrorMessage,
} from "../lib/messaging-permission";
import { isUniqueConstraintError } from "../lib/username";
import { recordAccountActivity } from "../lib/account-activity";
import { countMutualConnections } from "../lib/public-profile";
import {
  buildConnectionSuggestions,
  CONNECTION_SUGGESTION_DEFAULT_LIMIT,
  CONNECTION_SUGGESTION_MAX_LIMIT,
  type ConnectionSuggestionCandidate,
} from "../lib/connection-suggestions";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const connectionsRouter = new Hono<{ Variables: Variables }>();
connectionsRouter.use("*", authGuard);

/** Everything a client needs to render a person row without a second lookup. */
const personSelect = {
  id: true,
  name: true,
  username: true,
  image: true,
} as const;

export type ConnectionStatus =
  | "none"
  | "pending_outgoing"
  | "pending_incoming"
  | "connected"
  | "declined"
  | "blocked";

type ConnectionRow = {
  requesterId: string;
  recipientId: string;
  status: string;
};

export function describeConnectionStatus(
  viewerId: string,
  connection: ConnectionRow | null | undefined,
): ConnectionStatus {
  if (!connection) return "none";
  if (connection.status === "accepted") return "connected";
  if (connection.status === "declined") return "declined";
  return connection.requesterId === viewerId ? "pending_outgoing" : "pending_incoming";
}

const targetSchema = z.object({ userId: z.string().min(1) });
const suggestionsQuerySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

// GET /api/connections — accepted connections plus both pending queues
connectionsRouter.get("/", async (c) => {
  const user = c.get("user")!;

  const rows = await prisma.connection.findMany({
    where: { OR: [{ requesterId: user.id }, { recipientId: user.id }] },
    include: {
      requester: { select: personSelect },
      recipient: { select: personSelect },
    },
    orderBy: { updatedAt: "desc" },
  });

  const accepted: unknown[] = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];

  for (const row of rows) {
    const isRequester = row.requesterId === user.id;
    const person = isRequester ? row.recipient : row.requester;
    const entry = {
      id: row.id,
      person,
      status: describeConnectionStatus(user.id, row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    if (row.status === "accepted") accepted.push(entry);
    else if (row.status === "pending") (isRequester ? outgoing : incoming).push(entry);
  }

  return c.json({ data: { accepted, incoming, outgoing } });
});

// GET /api/connections/suggestions — evidence-backed people the viewer may know
connectionsRouter.get(
  "/suggestions",
  zValidator("query", suggestionsQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const query = c.req.valid("query");
    const limit = Math.min(
      query.limit ?? CONNECTION_SUGGESTION_DEFAULT_LIMIT,
      CONNECTION_SUGGESTION_MAX_LIMIT,
    );

    const [viewerMemberships, viewerOrganizationMemberships, viewerAcceptedRows] =
      await Promise.all([
        prisma.teamMember.findMany({
          where: { userId: user.id },
          select: {
            teamId: true,
            role: true,
            joinedAt: true,
            team: { select: { id: true, name: true } },
          },
        }),
        prisma.organizationMembership.findMany({
          where: { userId: user.id },
          select: { organizationId: true },
        }),
        prisma.connection.findMany({
          where: {
            status: "accepted",
            OR: [{ requesterId: user.id }, { recipientId: user.id }],
          },
          select: { requesterId: true, recipientId: true },
        }),
      ]);

    if (
      query.teamId &&
      !viewerMemberships.some((membership) => membership.teamId === query.teamId)
    ) {
      return c.json(
        {
          error: {
            message: "You must belong to the requested workspace.",
            code: "WORKSPACE_ACCESS_DENIED",
          },
        },
        403,
      );
    }

    const sharedTeamIds = viewerMemberships.map((membership) => membership.teamId);
    const sharedOrganizationIds = viewerOrganizationMemberships.map(
      (membership) => membership.organizationId,
    );
    const viewerConnectionIds = viewerAcceptedRows.map((row) =>
      row.requesterId === user.id ? row.recipientId : row.requesterId,
    );
    const viewerConnectionIdSet = new Set(viewerConnectionIds);

    const mutualEvidenceRows =
      viewerConnectionIds.length === 0
        ? []
        : await prisma.connection.findMany({
            where: {
              status: "accepted",
              OR: [
                { requesterId: { in: viewerConnectionIds } },
                { recipientId: { in: viewerConnectionIds } },
              ],
            },
            select: { requesterId: true, recipientId: true },
          });

    const mutualCandidateIds = new Set<string>();
    for (const row of mutualEvidenceRows) {
      if (viewerConnectionIdSet.has(row.requesterId)) mutualCandidateIds.add(row.recipientId);
      if (viewerConnectionIdSet.has(row.recipientId)) mutualCandidateIds.add(row.requesterId);
    }
    mutualCandidateIds.delete(user.id);

    const evidenceFilters = [
      ...(sharedTeamIds.length > 0
        ? [{ teamMembers: { some: { teamId: { in: sharedTeamIds } } } }]
        : []),
      ...(sharedOrganizationIds.length > 0
        ? [
            {
              organizationMemberships: {
                some: { organizationId: { in: sharedOrganizationIds } },
              },
            },
          ]
        : []),
      ...(mutualCandidateIds.size > 0 ? [{ id: { in: [...mutualCandidateIds] } }] : []),
    ];

    if (evidenceFilters.length === 0) return c.json({ data: [] });

    const people = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        OR: evidenceFilters,
      },
      select: {
        ...personSelect,
        teamMembers: {
          where: { teamId: { in: sharedTeamIds } },
          select: {
            role: true,
            joinedAt: true,
            team: { select: { id: true, name: true } },
          },
        },
        organizationMemberships: {
          where: { organizationId: { in: sharedOrganizationIds } },
          select: { organizationId: true },
        },
      },
    });

    if (people.length === 0) return c.json({ data: [] });

    const candidateIds = people.map((person) => person.id);
    const [connectionRows, blockRows] = await Promise.all([
      prisma.connection.findMany({
        where: {
          OR: [
            { requesterId: user.id, recipientId: { in: candidateIds } },
            { recipientId: user.id, requesterId: { in: candidateIds } },
          ],
        },
        select: {
          requesterId: true,
          recipientId: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: user.id, blockedId: { in: candidateIds } },
            { blockedId: user.id, blockerId: { in: candidateIds } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const connectionsByPerson = new Map(
      connectionRows.map((row) => [
        row.requesterId === user.id ? row.recipientId : row.requesterId,
        row,
      ]),
    );
    const blockedPersonIds = new Set(
      blockRows.map((row) => (row.blockerId === user.id ? row.blockedId : row.blockerId)),
    );
    const candidateIdSet = new Set(candidateIds);
    const mutualIdsByCandidate = new Map<string, Set<string>>();
    const addMutual = (candidateId: string, mutualId: string) => {
      const mutualIds = mutualIdsByCandidate.get(candidateId) ?? new Set<string>();
      mutualIds.add(mutualId);
      mutualIdsByCandidate.set(candidateId, mutualIds);
    };
    for (const row of mutualEvidenceRows) {
      if (candidateIdSet.has(row.requesterId) && viewerConnectionIdSet.has(row.recipientId)) {
        addMutual(row.requesterId, row.recipientId);
      }
      if (candidateIdSet.has(row.recipientId) && viewerConnectionIdSet.has(row.requesterId)) {
        addMutual(row.recipientId, row.requesterId);
      }
    }

    const candidates: ConnectionSuggestionCandidate[] = people.map((person) => {
      const connection = connectionsByPerson.get(person.id);
      return {
        person: {
          id: person.id,
          name: person.name,
          username: person.username,
          image: person.image,
        },
        sharedWorkspaces: person.teamMembers.map((membership) => ({
          id: membership.team.id,
          name: membership.team.name,
          role: membership.role,
          joinedAt: membership.joinedAt,
        })),
        mutualConnections: mutualIdsByCandidate.get(person.id)?.size ?? 0,
        sharesOrganization: person.organizationMemberships.length > 0,
        connection: connection
          ? { status: connection.status, updatedAt: connection.updatedAt }
          : null,
        blocked: blockedPersonIds.has(person.id),
      };
    });

    return c.json({
      data: buildConnectionSuggestions({
        candidates,
        currentTeamId: query.teamId,
        limit,
      }),
    });
  },
);

// GET /api/connections/status?userId= — single-pair status for a profile screen
connectionsRouter.get("/status", async (c) => {
  const user = c.get("user")!;
  const userId = c.req.query("userId")?.trim();
  if (!userId) {
    return c.json({ error: { message: "userId is required", code: "VALIDATION_ERROR" } }, 400);
  }

  const [connection, blocked, permission] = await Promise.all([
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(user.id, userId) },
      select: { requesterId: true, recipientId: true, status: true },
    }),
    prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: userId } },
      select: { id: true },
    }),
    canMessage(user.id, userId),
  ]);

  return c.json({
    data: {
      status: describeConnectionStatus(user.id, connection),
      isBlockedByMe: blocked !== null,
      canMessage: permission.allowed,
    },
  });
});

// GET /api/connections/person/:userId — workspace-free public profile for person.tsx
connectionsRouter.get("/person/:userId", async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.param();

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...personSelect,
      emailVerified: true,
      createdAt: true,
      profileWebsite: true,
      profileLocation: true,
      profileBio: true,
      teamMembers: {
        where: { team: { members: { some: { userId: user.id } } } },
        select: {
          role: true,
          joinedAt: true,
          team: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
  if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);

  const [connection, blocked, permission, personConnectionCount, viewerConnectionRows, personConnectionRows] =
    await Promise.all([
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(user.id, userId) },
      select: { requesterId: true, recipientId: true, status: true },
    }),
    prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: userId } },
      select: { id: true },
    }),
    canMessage(user.id, userId),
    prisma.connection.count({
      where: {
        status: "accepted",
        OR: [{ requesterId: userId }, { recipientId: userId }],
      },
    }),
    prisma.connection.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: user.id }, { recipientId: user.id }],
      },
      select: { requesterId: true, recipientId: true },
    }),
    prisma.connection.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: userId }, { recipientId: userId }],
      },
      select: { requesterId: true, recipientId: true },
    }),
  ]);

  return c.json({
    data: {
      id: person.id,
      name: person.name,
      username: person.username,
      image: person.image,
      emailVerified: person.emailVerified,
      memberSince: person.createdAt,
      profileWebsite: person.profileWebsite,
      profileLocation: person.profileLocation,
      profileBio: person.profileBio,
      stats: {
        connections: personConnectionCount,
        workspaces: person.teamMembers.length,
        mutualConnections:
          person.id === user.id
            ? 0
            : countMutualConnections(
                user.id,
                person.id,
                viewerConnectionRows,
                personConnectionRows,
              ),
      },
      // Only workspaces the viewer also belongs to: never a directory of someone's employers.
      sharedWorkspaces: person.teamMembers.map((row) => ({
        ...row.team,
        role: row.role,
        joinedAt: row.joinedAt,
      })),
      connectionStatus: describeConnectionStatus(user.id, connection),
      isBlockedByMe: blocked !== null,
      canMessage: permission.allowed,
      isSelf: person.id === user.id,
    },
  });
});

// POST /api/connections/request — send or re-send a connection request
connectionsRouter.post("/request", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");

  if (userId === user.id) {
    return c.json({ error: { message: "You cannot connect with yourself.", code: "VALIDATION_ERROR" } }, 400);
  }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  if (await isBlockedEitherWay(user.id, userId)) {
    return c.json(
      { error: { message: messagePermissionErrorMessage("blocked"), code: "MESSAGING_BLOCKED" } },
      403,
    );
  }

  const pairKey = buildConnectionPairKey(user.id, userId);
  const existing = await prisma.connection.findUnique({ where: { pairKey } });

  if (existing) {
    if (existing.status === "accepted") {
      return c.json({ data: { status: "connected" as const } });
    }
    if (existing.status === "pending") {
      // Requesting someone who already asked you is an accept, which is what the user means.
      if (existing.recipientId === user.id) {
        const accepted = await prisma.connection.update({
          where: { pairKey },
          data: { status: "accepted" },
        });
        await notifyConnectionAccepted(accepted.requesterId, accepted.recipientId);
        return c.json({ data: { status: "connected" as const } });
      }
      return c.json({ data: { status: "pending_outgoing" as const } });
    }
    // A previous decline is replaced by the new request, with direction reset.
    await prisma.connection.update({
      where: { pairKey },
      data: { requesterId: user.id, recipientId: userId, status: "pending" },
    });
    return c.json({ data: { status: "pending_outgoing" as const } });
  }

  try {
    await prisma.connection.create({
      data: { requesterId: user.id, recipientId: userId, status: "pending", pairKey },
    });
  } catch (err) {
    // Both sides pressed Connect at once; the unique pairKey settles it.
    if (!isUniqueConstraintError(err)) throw err;
    const raced = await prisma.connection.findUnique({
      where: { pairKey },
      select: { requesterId: true, recipientId: true, status: true },
    });
    return c.json({ data: { status: describeConnectionStatus(user.id, raced) } });
  }

  return c.json({ data: { status: "pending_outgoing" as const } }, 201);
});

// POST /api/connections/accept — recipient accepts a pending request
connectionsRouter.post("/accept", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");
  const pairKey = buildConnectionPairKey(user.id, userId);

  const existing = await prisma.connection.findUnique({ where: { pairKey } });
  if (!existing || existing.status !== "pending" || existing.recipientId !== user.id) {
    return c.json({ error: { message: "No pending request to accept", code: "NOT_FOUND" } }, 404);
  }

  await prisma.connection.update({ where: { pairKey }, data: { status: "accepted" } });
  await notifyConnectionAccepted(existing.requesterId, existing.recipientId);

  return c.json({ data: { status: "connected" as const } });
});

// POST /api/connections/decline — recipient declines; the row is kept so it cannot be re-sent instantly
connectionsRouter.post("/decline", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");
  const pairKey = buildConnectionPairKey(user.id, userId);

  const existing = await prisma.connection.findUnique({ where: { pairKey } });
  if (!existing || existing.status !== "pending" || existing.recipientId !== user.id) {
    return c.json({ error: { message: "No pending request to decline", code: "NOT_FOUND" } }, 404);
  }

  await prisma.connection.update({ where: { pairKey }, data: { status: "declined" } });
  return c.json({ data: { status: "declined" as const } });
});

// DELETE /api/connections — cancel an outgoing request or remove an existing connection
connectionsRouter.delete("/", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");
  const pairKey = buildConnectionPairKey(user.id, userId);

  const existing = await prisma.connection.findUnique({ where: { pairKey } });
  if (!existing) return c.json({ data: { status: "none" as const } });
  if (existing.requesterId !== user.id && existing.recipientId !== user.id) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  // Cancel and remove are both a plain delete: no tombstone, no history.
  await prisma.connection.delete({ where: { pairKey } });
  return c.json({ data: { status: "none" as const } });
});

// POST /api/connections/block — block a person and drop any connection between you
connectionsRouter.post("/block", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");

  if (userId === user.id) {
    return c.json({ error: { message: "You cannot block yourself.", code: "VALIDATION_ERROR" } }, 400);
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: userId } },
      create: { blockerId: user.id, blockedId: userId },
      update: {},
    }),
    // Blocking ends the personal relationship. It deliberately does not touch
    // TeamMember, task assignment or workspace rosters, which belong to the employer.
    prisma.connection.deleteMany({ where: { pairKey: buildConnectionPairKey(user.id, userId) } }),
  ]);

  return c.json({ data: { status: "blocked" as const } });
});

// DELETE /api/connections/block — unblock (does not restore the old connection)
connectionsRouter.delete("/block", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");

  await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
  return c.json({ data: { status: "none" as const } });
});

// GET /api/connections/blocked — the blocked list for the privacy settings screen
connectionsRouter.get("/blocked", async (c) => {
  const user = c.get("user")!;
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: user.id },
    include: { blocked: { select: personSelect } },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: rows.map((row) => ({ id: row.id, person: row.blocked, createdAt: row.createdAt })) });
});

/** Only acceptance is worth an activity row; requests, declines and removals are not. */
async function notifyConnectionAccepted(requesterId: string, recipientId: string): Promise<void> {
  const [requester, recipient] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: recipientId }, select: { name: true } }),
  ]);

  await Promise.all([
    recordAccountActivity({
      userId: requesterId,
      type: "connection_accepted",
      content: `${recipient?.name ?? "Someone"} accepted your connection request`,
    }),
    recordAccountActivity({
      userId: recipientId,
      type: "connection_accepted",
      content: `You are now connected with ${requester?.name ?? "someone"}`,
    }),
  ]);
}

export { connectionsRouter };
