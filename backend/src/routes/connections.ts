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
  shareWorkspace,
} from "../lib/messaging-permission";
import { isUniqueConstraintError } from "../lib/username";
import { recordAccountActivity } from "../lib/account-activity";
import { countMutualConnections } from "../lib/public-profile";
import {
  buildConnectionSuggestions,
  CONNECTION_SUGGESTION_DEFAULT_LIMIT,
  CONNECTION_SUGGESTION_DISMISSAL_DAYS,
  CONNECTION_SUGGESTION_MAX_LIMIT,
  CONNECTION_SUGGESTION_MUTUAL_PREVIEW_LIMIT,
  type ConnectionSuggestionCandidate,
} from "../lib/connection-suggestions";
import { isConnectionActiveNow } from "../lib/presence";
import { buildDmPairKey } from "../lib/dm-pair-key";
import {
  CONNECTION_RELEVANCE_WINDOW_DAYS,
  rankConnectionsByRelevance,
} from "../lib/connection-relevance";
import {
  CONNECTION_REQUEST_COOLDOWN_CODE,
  DECLINED_CONNECTION_COOLDOWN_DAYS,
  decideConnectionRequest,
  type ConnectionRequestState,
} from "../lib/connection-request-policy";
import { serializeWorkplaceConnectedUser } from "../lib/workplace-connected";
import { getBidirectionalBlockStatus } from "../lib/relationship-blocks";

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
  profileTitle: true,
  _count: { select: { teamMembers: true } },
} as const;

const connectionListPersonSelect = {
  ...personSelect,
  lastActiveAt: true,
  showActiveStatus: true,
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
  if (connection.status === "reconnect_required") return "none";
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
      requester: { select: connectionListPersonSelect },
      recipient: { select: connectionListPersonSelect },
    },
    orderBy: { updatedAt: "desc" },
  });

  const acceptedPersonIds = rows
    .filter((row) => row.status === "accepted")
    .map((row) => (row.requesterId === user.id ? row.recipientId : row.requesterId));
  const dmPairKeys = acceptedPersonIds.map((personId) => buildDmPairKey(user.id, personId));
  const [blockRows, membershipRows, dmConversations] =
    acceptedPersonIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.userBlock.findMany({
            where: {
              OR: [
                { blockerId: user.id, blockedId: { in: acceptedPersonIds } },
                { blockedId: user.id, blockerId: { in: acceptedPersonIds } },
              ],
            },
            select: { blockerId: true, blockedId: true },
          }),
          prisma.teamMember.findMany({
            where: { userId: { in: [user.id, ...acceptedPersonIds] } },
            select: {
              userId: true,
              teamId: true,
              team: { select: { name: true } },
            },
          }),
          prisma.conversation.findMany({
            where: { isGroup: false, dmPairKey: { in: dmPairKeys } },
            select: { id: true, dmPairKey: true },
          }),
        ]);
  const recentMessageCutoff = new Date(
    Date.now() - CONNECTION_RELEVANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  // Conversation IDs must be resolved first, then one grouped query supplies
  // count + latest activity for every DM. This remains constant-query, not N+1.
  const recentMessageGroups =
    dmConversations.length === 0
      ? []
      : await prisma.directMessage.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: dmConversations.map((conversation) => conversation.id) },
            createdAt: { gte: recentMessageCutoff },
          },
          _count: { _all: true },
          _max: { createdAt: true },
        });
  const blockedPersonIds = new Set(
    blockRows.map((row) => (row.blockerId === user.id ? row.blockedId : row.blockerId)),
  );
  const viewerTeamIds = new Set(
    membershipRows
      .filter((membership) => membership.userId === user.id)
      .map((membership) => membership.teamId),
  );
  const sharedWorkspaceCountByPerson = new Map<string, number>();
  const sharedWorkspaceNamesByPerson = new Map<string, string[]>();
  for (const membership of membershipRows) {
    if (membership.userId !== user.id && viewerTeamIds.has(membership.teamId)) {
      sharedWorkspaceCountByPerson.set(
        membership.userId,
        (sharedWorkspaceCountByPerson.get(membership.userId) ?? 0) + 1,
      );
      const names = sharedWorkspaceNamesByPerson.get(membership.userId) ?? [];
      if (!names.includes(membership.team.name)) names.push(membership.team.name);
      sharedWorkspaceNamesByPerson.set(membership.userId, names);
    }
  }
  const dmPairKeyByConversationId = new Map(
    dmConversations.flatMap((conversation) =>
      conversation.dmPairKey ? [[conversation.id, conversation.dmPairKey] as const] : [],
    ),
  );
  const recentDmByPairKey = new Map(
    recentMessageGroups.flatMap((group) => {
      const pairKey = dmPairKeyByConversationId.get(group.conversationId);
      return pairKey
        ? [[
            pairKey,
            {
              count: group._count._all,
              lastMessageAt: group._max.createdAt,
            },
          ] as const]
        : [];
    }),
  );

  const accepted = [];
  const incoming: unknown[] = [];
  const outgoing: unknown[] = [];

  for (const row of rows) {
    const isRequester = row.requesterId === user.id;
    const person = isRequester ? row.recipient : row.requester;
    const { lastActiveAt, showActiveStatus, ...personWithCount } = person;
    const publicPerson = serializeWorkplaceConnectedUser(personWithCount);
    const entry = {
      id: row.id,
      person: publicPerson,
      status: describeConnectionStatus(user.id, row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    if (row.status === "accepted") {
      const dmSignals = recentDmByPairKey.get(buildDmPairKey(user.id, person.id));
      accepted.push({
        candidateId: person.id,
        activeNow: isConnectionActiveNow({
          connectionAccepted: true,
          blockedEitherWay: blockedPersonIds.has(person.id),
          showActiveStatus,
          lastActiveAt,
        }),
        lastDirectMessageAt: dmSignals?.lastMessageAt ?? null,
        recentDirectMessageCount: dmSignals?.count ?? 0,
        connectionUpdatedAt: row.updatedAt,
        sharedWorkspaceCount: sharedWorkspaceCountByPerson.get(person.id) ?? 0,
        entry,
      });
    } else if (row.status === "pending") (isRequester ? outgoing : incoming).push(entry);
  }

  const rankedAccepted = rankConnectionsByRelevance(accepted, { viewerId: user.id }).map(
    ({ entry, activeNow, sharedWorkspaceCount }) => ({
      ...entry,
      activeNow,
      sharesWorkspace: sharedWorkspaceCount > 0,
      sharedWorkspaceNames:
        sharedWorkspaceNamesByPerson.get(entry.person.id) ?? [],
    }),
  );

  return c.json({ data: { accepted: rankedAccepted, incoming, outgoing } });
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
    const dismissalCutoff = new Date(
      Date.now() - CONNECTION_SUGGESTION_DISMISSAL_DAYS * 24 * 60 * 60 * 1000,
    );
    const [connectionRows, blockRows, dismissalRows] = await Promise.all([
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
      prisma.connectionSuggestionDismissal.findMany({
        where: {
          dismisserId: user.id,
          suggestedUserId: { in: candidateIds },
          dismissedAt: { gte: dismissalCutoff },
        },
        select: { suggestedUserId: true, dismissedAt: true },
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
    const dismissedAtByPersonId = new Map(
      dismissalRows.map((row) => [row.suggestedUserId, row.dismissedAt]),
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

    const previewMutualIds = [
      ...new Set(
        [...mutualIdsByCandidate.values()].flatMap((mutualIds) =>
          [...mutualIds].slice(0, CONNECTION_SUGGESTION_MUTUAL_PREVIEW_LIMIT),
        ),
      ),
    ];
    const mutualPeopleById = new Map(
      (previewMutualIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: previewMutualIds } },
            select: { id: true, name: true, image: true },
          })
      ).map((person) => [person.id, person]),
    );

    const candidates: ConnectionSuggestionCandidate[] = people.map((person) => {
      const connection = connectionsByPerson.get(person.id);
      const mutualIds = [...(mutualIdsByCandidate.get(person.id) ?? [])];
      return {
        person: {
          id: person.id,
          name: person.name,
          username: person.username,
          image: person.image,
          profileTitle: person.profileTitle,
          isWorkplaceConnected: person._count.teamMembers > 0,
        },
        sharedWorkspaces: person.teamMembers.map((membership) => ({
          id: membership.team.id,
          name: membership.team.name,
          role: membership.role,
          joinedAt: membership.joinedAt,
        })),
        mutualConnections: mutualIds.length,
        mutualPreview: mutualIds
          .slice(0, CONNECTION_SUGGESTION_MUTUAL_PREVIEW_LIMIT)
          .flatMap((mutualId) => {
            const mutual = mutualPeopleById.get(mutualId);
            return mutual ? [{ id: mutual.id, name: mutual.name, image: mutual.image }] : [];
          }),
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
        dismissedAtByPersonId,
      }),
    });
  },
);

// POST /api/connections/suggestions/dismiss — hide a suggestion for 90 days
connectionsRouter.post(
  "/suggestions/dismiss",
  zValidator("json", targetSchema),
  async (c) => {
    const user = c.get("user")!;
    const { userId } = c.req.valid("json");

    if (userId === user.id) {
      return c.json(
        { error: { message: "You cannot dismiss yourself.", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) {
      return c.json(
        { error: { message: "Person not found.", code: "NOT_FOUND" } },
        404,
      );
    }

    const dismissedAt = new Date();
    await prisma.connectionSuggestionDismissal.upsert({
      where: {
        dismisserId_suggestedUserId: {
          dismisserId: user.id,
          suggestedUserId: userId,
        },
      },
      create: {
        dismisserId: user.id,
        suggestedUserId: userId,
        dismissedAt,
      },
      update: { dismissedAt },
    });

    const dismissedUntil = new Date(
      dismissedAt.getTime() +
        CONNECTION_SUGGESTION_DISMISSAL_DAYS * 24 * 60 * 60 * 1000,
    );
    return c.json({
      data: {
        userId,
        dismissedAt: dismissedAt.toISOString(),
        dismissedUntil: dismissedUntil.toISOString(),
        cooldownDays: CONNECTION_SUGGESTION_DISMISSAL_DAYS,
      },
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

  const [connection, blockStatus, permission] = await Promise.all([
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(user.id, userId) },
      select: { requesterId: true, recipientId: true, status: true },
    }),
    getBidirectionalBlockStatus(user.id, userId),
    canMessage(user.id, userId),
  ]);

  return c.json({
    data: {
      status: describeConnectionStatus(user.id, connection),
      isBlockedByMe: blockStatus.blockedByMe,
      isBlockedByThem: blockStatus.blockedByThem,
      blockStatus: blockStatus.status,
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

  const [connection, blockStatus, permission, personConnectionCount, viewerConnectionRows, personConnectionRows] =
    await Promise.all([
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(user.id, userId) },
      select: { requesterId: true, recipientId: true, status: true },
    }),
    getBidirectionalBlockStatus(user.id, userId),
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
      isWorkplaceConnected: person._count.teamMembers > 0,
      emailVerified: person.emailVerified,
      memberSince: person.createdAt,
      profileTitle: person.profileTitle,
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
      isBlockedByMe: blockStatus.blockedByMe,
      isBlockedByThem: blockStatus.blockedByThem,
      blockStatus: blockStatus.status,
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

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, image: true },
  });
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
  // TeamMember overlap is the sole workspace trust signal. Organization
  // membership, historical membership, and workspace ownership are not used.
  const sharesWorkspace = await shareWorkspace(user.id, userId);
  const result = await applyConnectionRequest({
    requesterId: user.id,
    targetId: userId,
    pairKey,
    sharesWorkspace,
  });

  if (result.cooldown) {
    return c.json(
      {
        error: {
          message: "This connection request was recently declined. Try again after the cooldown.",
          code: CONNECTION_REQUEST_COOLDOWN_CODE,
          remainingSeconds: result.remainingSeconds,
          retryAt: result.retryAt.toISOString(),
          cooldownDays: DECLINED_CONNECTION_COOLDOWN_DAYS,
        },
      },
      409,
    );
  }
  if (result.changed && result.status === "pending_outgoing") {
    const requesterName = user.name?.trim() || "Someone";
    const recipientName = target.name?.trim() || "Someone";
    await Promise.all([
      recordAccountActivity({
        userId: user.id,
        type: "connection_request_sent",
        content: `You sent ${recipientName} a connection request`,
        metadata: {
          actorUserId: target.id,
          actorName: recipientName,
          actorImage: target.image,
        },
      }),
      recordAccountActivity({
        userId: target.id,
        type: "connection_request_received",
        content: `${requesterName} sent you a connection request`,
        metadata: {
          actorUserId: user.id,
          actorName: requesterName,
          actorImage: user.image ?? null,
        },
      }),
    ]);
  }
  return c.json({ data: { status: result.status } }, result.created ? 201 : 200);
});

type RequestConnectionResult =
  | {
      cooldown: false;
      status: "connected" | "pending_outgoing";
      created: boolean;
      changed: boolean;
    }
  | {
      cooldown: true;
      remainingSeconds: number;
      retryAt: Date;
    };

async function applyConnectionRequest(input: {
  requesterId: string;
  targetId: string;
  pairKey: string;
  sharesWorkspace: boolean;
}): Promise<RequestConnectionResult> {
  // A retry loop turns a unique create race into the same state transition as
  // the normal path. Compare-and-set updates ensure only the request that
  // actually changes a row emits acceptance activity.
  for (;;) {
    const existing = await prisma.connection.findUnique({ where: { pairKey: input.pairKey } });
    const state: ConnectionRequestState = !existing
      ? "none"
      : existing.status === "accepted"
        ? "accepted"
        : existing.status === "pending"
          ? existing.recipientId === input.requesterId
            ? "pending_incoming"
            : "pending_outgoing"
          : existing.status === "reconnect_required"
            ? "reconnect_required"
          : "declined";
    const decision = decideConnectionRequest(state, input.sharesWorkspace, {
      declinedAt: state === "declined" ? existing?.updatedAt : null,
    });

    if (decision.action === "blocked") {
      return {
        cooldown: true,
        remainingSeconds: decision.remainingSeconds,
        retryAt: decision.retryAt,
      };
    }

    if (decision.action === "none") {
      return {
        cooldown: false,
        status: decision.responseStatus,
        created: false,
        changed: false,
      };
    }

    if (decision.action === "create") {
      try {
        await prisma.connection.create({
          data: {
            requesterId: input.requesterId,
            recipientId: input.targetId,
            status: decision.nextStatus,
            pairKey: input.pairKey,
          },
        });
        if (decision.nextStatus === "accepted") {
          await notifyConnectionAccepted(input.requesterId, input.targetId);
        }
        return {
          cooldown: false,
          status: decision.responseStatus,
          created: true,
          changed: true,
        };
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        continue;
      }
    }

    if (!existing) continue;
    const nextDirection = decision.resetDirection
      ? { requesterId: input.requesterId, recipientId: input.targetId }
      : {};
    const changed = await prisma.connection.updateMany({
      where: {
        id: existing.id,
        status: existing.status,
        requesterId: existing.requesterId,
        recipientId: existing.recipientId,
      },
      data: {
        ...nextDirection,
        status: decision.nextStatus,
      },
    });
    if (changed.count === 0) continue;

    if (decision.nextStatus === "accepted") {
      await notifyConnectionAccepted(
        decision.resetDirection ? input.requesterId : existing.requesterId,
        decision.resetDirection ? input.targetId : existing.recipientId,
      );
    }
    return {
      cooldown: false,
      status: decision.responseStatus,
      created: false,
      changed: true,
    };
  }
}

// POST /api/connections/accept — recipient accepts a pending request
connectionsRouter.post("/accept", zValidator("json", targetSchema), async (c) => {
  const user = c.get("user")!;
  const { userId } = c.req.valid("json");
  const pairKey = buildConnectionPairKey(user.id, userId);

  const existing = await prisma.connection.findUnique({ where: { pairKey } });
  if (!existing || existing.status !== "pending" || existing.recipientId !== user.id) {
    return c.json({ error: { message: "No pending request to accept", code: "NOT_FOUND" } }, 404);
  }

  const changed = await prisma.connection.updateMany({
    where: {
      id: existing.id,
      status: "pending",
      requesterId: existing.requesterId,
      recipientId: existing.recipientId,
    },
    data: { status: "accepted" },
  });
  if (changed.count === 1) {
    await notifyConnectionAccepted(existing.requesterId, existing.recipientId);
  } else {
    const raced = await prisma.connection.findUnique({
      where: { pairKey },
      select: { status: true },
    });
    if (raced?.status !== "accepted") {
      return c.json({ error: { message: "No pending request to accept", code: "NOT_FOUND" } }, 404);
    }
  }

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

  const existingBlock = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: userId } },
    select: { id: true },
  });
  if (!existingBlock) {
    return c.json({ data: { status: "none" as const } });
  }

  await prisma.$transaction([
    prisma.userBlock.deleteMany({
      where: { blockerId: user.id, blockedId: userId },
    }),
    prisma.connection.upsert({
      where: { pairKey: buildConnectionPairKey(user.id, userId) },
      create: {
        requesterId: user.id,
        recipientId: userId,
        pairKey: buildConnectionPairKey(user.id, userId),
        status: "reconnect_required",
      },
      update: { status: "reconnect_required" },
    }),
  ]);
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
  return c.json({
    data: rows.map((row) => ({
      id: row.id,
      person: serializeWorkplaceConnectedUser(row.blocked),
      createdAt: row.createdAt,
    })),
  });
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
      metadata: { actorUserId: recipientId },
    }),
    recordAccountActivity({
      userId: recipientId,
      type: "connection_accepted",
      content: `You are now connected with ${requester?.name ?? "someone"}`,
      metadata: { actorUserId: requesterId },
    }),
  ]);
}

export { connectionsRouter };
