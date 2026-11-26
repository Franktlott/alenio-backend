import type { PrismaClient } from "@prisma/client";
import type { AlenioPostAudience } from "../types";
import {
  activitySourceFromAudience,
  inferActivityAudience,
} from "./activity-audience";
import {
  visibleNetworkAuthorCutoffs,
  type NetworkAuthorCutoff,
} from "./network-updates-policy";

export const PERSONAL_FEED_TYPES = [
  "post",
  "celebration",
  "task_milestone",
  "member_joined",
] as const;

export const PERSONAL_FEED_DAYS = 30;
export const NETWORK_POST_TYPE = "network_post";
export const ALENIO_POST_TYPE = "alenio_post";
export const ALENIO_POST_AUDIENCES = [
  "all",
  "workspace_members",
  "non_workspace_members",
] as const satisfies readonly AlenioPostAudience[];

export type PersonalFeedSource = "network" | "public" | "workspace" | "alenio";

export type PersonalFeedCursor = {
  createdAt: string;
  id: string;
};

export type PersonalFeedItem = {
  id: string;
  source: PersonalFeedSource;
  sourceLabel: string;
  teamId: string | null;
  type: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  user: { id: string; name: string; image: string | null } | null;
  reactions: Record<
    string,
    { count: number; userIds: string[]; users: { id: string; name: string }[] }
  >;
  commentCount: number;
  commentsLocked: boolean;
  alenioAudience: AlenioPostAudience | null;
  canDelete: boolean;
};

type ReactionRow = {
  emoji: string;
  userId: string;
  user: { id: string; name: string };
};

const reactionUserSelect = { id: true, name: true } as const;

export const personalFeedActivityInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: reactionUserSelect } } },
  _count: { select: { comments: true } },
  team: { select: { id: true, name: true } },
} as const;

export function encodePersonalFeedCursor(value: PersonalFeedCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodePersonalFeedCursor(
  value: string | undefined,
): PersonalFeedCursor | null | undefined {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as PersonalFeedCursor;
    const date = new Date(parsed.createdAt);
    if (!parsed.id || !Number.isFinite(date.getTime())) return undefined;
    return { createdAt: date.toISOString(), id: parsed.id };
  } catch {
    return undefined;
  }
}

export function parseFeedMetadata(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function mapFeedReactions(reactions: ReactionRow[]) {
  return reactions.reduce(
    (
      result: Record<
        string,
        { count: number; userIds: string[]; users: { id: string; name: string }[] }
      >,
      reaction,
    ) => {
      if (!result[reaction.emoji]) {
        result[reaction.emoji] = { count: 0, userIds: [], users: [] };
      }
      result[reaction.emoji]!.count += 1;
      result[reaction.emoji]!.userIds.push(reaction.userId);
      result[reaction.emoji]!.users.push(reaction.user);
      return result;
    },
    {},
  );
}

/** Prisma where fragment: network-scoped feed rows (audience or legacy). */
export function networkAudienceVisibilityWhere(
  networkVisibility: Record<string, unknown>,
) {
  return {
    OR: [
      { audienceKind: "network" },
      {
        audienceKind: null,
        teamId: null,
        type: NETWORK_POST_TYPE,
      },
    ],
    AND: [networkVisibility],
  };
}

/**
 * Member public posts: every signed-in viewer, except blocked authors / hidden rows.
 * Kept separate from network visibility so strangers are not connection-gated.
 */
export function publicAudienceVisibilityWhere(
  viewerId: string,
  blockedAuthorIds: string[],
) {
  return {
    audienceKind: "public",
    type: NETWORK_POST_TYPE,
    AND: [
      {
        OR: [
          { userId: viewerId },
          {
            AND: [
              ...(blockedAuthorIds.length > 0
                ? [{ userId: { notIn: blockedAuthorIds } }]
                : []),
              { hides: { none: { viewerId } } },
            ],
          },
        ],
      },
    ],
  };
}

/** Prisma where fragment: workspace-scoped feed rows for the viewer's teams. */
export function workspaceAudienceVisibilityWhere(teamIds: string[]) {
  return {
    OR: [
      {
        audienceKind: "workspace",
        audienceTeamId: { in: teamIds },
        type: { in: [...PERSONAL_FEED_TYPES] },
      },
      {
        audienceKind: null,
        teamId: { in: teamIds },
        type: { in: [...PERSONAL_FEED_TYPES] },
      },
    ],
  };
}

/** Normalizes legacy or invalid platform-post targets to the safe legacy default. */
export function normalizeAlenioPostAudience(
  value: string | null | undefined,
): AlenioPostAudience {
  return ALENIO_POST_AUDIENCES.includes(value as AlenioPostAudience)
    ? (value as AlenioPostAudience)
    : "all";
}

/** Prisma where fragment: platform Alenio posts visible to this viewer segment. */
export function alenioAudienceVisibilityWhere(
  hasWorkspaceMembership: boolean,
) {
  return {
    AND: [
      {
        OR: [
          { audienceKind: "alenio", type: ALENIO_POST_TYPE },
          { audienceKind: null, teamId: null, type: ALENIO_POST_TYPE },
        ],
      },
      {
        OR: [
          { alenioAudience: null },
          { alenioAudience: "all" },
          {
            alenioAudience: hasWorkspaceMembership
              ? "workspace_members"
              : "non_workspace_members",
          },
        ],
      },
    ],
  };
}

export function serializePersonalFeedItem(
  activity: {
    id: string;
    teamId: string | null;
    type: string;
    metadata: string | null;
    createdAt: Date;
    userId: string | null;
    audienceKind?: string | null;
    audienceTeamId?: string | null;
    alenioAudience?: string | null;
    commentsLocked?: boolean;
    user: { id: string; name: string; image: string | null } | null;
    reactions: ReactionRow[];
    _count: { comments: number };
    team: { id: string; name: string } | null;
  },
  viewerId: string,
): PersonalFeedItem {
  const audience = inferActivityAudience(activity);
  const { source, sourceLabel } = activitySourceFromAudience(
    audience,
    activity.team?.name,
  );
  const isAlenio = source === "alenio" || activity.type === ALENIO_POST_TYPE;
  return {
    id: activity.id,
    source,
    sourceLabel,
    // Prefer the membership team, then explicit audience, then joined team row —
    // detail routes need a teamId to open workspace threads.
    teamId:
      activity.teamId ??
      audience.audienceTeamId ??
      activity.team?.id ??
      null,
    type: activity.type,
    createdAt: activity.createdAt.toISOString(),
    metadata: parseFeedMetadata(activity.metadata),
    user: isAlenio
      ? { id: "alenio", name: "Alenio", image: null }
      : activity.user,
    reactions: mapFeedReactions(activity.reactions),
    commentCount: activity._count.comments,
    commentsLocked: activity.commentsLocked ?? false,
    alenioAudience: isAlenio
      ? normalizeAlenioPostAudience(activity.alenioAudience)
      : null,
    // Platform posts are removed from Admin, not by members in the feed.
    canDelete: isAlenio ? false : activity.userId === viewerId,
  };
}

export async function loadVisibleNetworkAuthorCutoffs(
  db: PrismaClient,
  viewerId: string,
): Promise<NetworkAuthorCutoff[]> {
  const [connections, blocks] = await Promise.all([
    db.connection.findMany({
      where: {
        status: "accepted",
        OR: [{ requesterId: viewerId }, { recipientId: viewerId }],
      },
      select: {
        requesterId: true,
        recipientId: true,
        status: true,
        updatedAt: true,
      },
    }),
    db.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  return visibleNetworkAuthorCutoffs(viewerId, connections, blocks);
}

export async function getPersonalFeedPage(
  db: PrismaClient,
  viewerId: string,
  options: {
    limit: number;
    cursor: PersonalFeedCursor | null;
  },
): Promise<{ items: PersonalFeedItem[]; nextCursor: string | null }> {
  const feedStart = new Date(
    Date.now() - PERSONAL_FEED_DAYS * 24 * 60 * 60 * 1000,
  );
  const [memberships, authorCutoffs, blocks] = await Promise.all([
    db.teamMember.findMany({
      where: { userId: viewerId },
      select: { teamId: true },
    }),
    loadVisibleNetworkAuthorCutoffs(db, viewerId),
    db.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const teamIds = memberships.map((row) => row.teamId);
  const hasWorkspaceMembership = teamIds.length > 0;
  const blockedAuthorIds = [
    ...new Set(
      blocks.flatMap((row) =>
        row.blockerId === viewerId
          ? [row.blockedId]
          : row.blockedId === viewerId
            ? [row.blockerId]
            : [],
      ),
    ),
  ];
  const cursorDate = options.cursor
    ? new Date(options.cursor.createdAt)
    : null;

  const cursorBoundary =
    cursorDate && options.cursor
      ? {
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: options.cursor.id } },
          ],
        }
      : {};

  const networkVisibility = {
    OR: [
      { userId: viewerId },
      ...authorCutoffs.map(({ authorId, visibleFrom }) => ({
        AND: [
          { userId: authorId },
          { createdAt: { gte: visibleFrom } },
          { hides: { none: { viewerId } } },
        ],
      })),
    ],
  };

  const activities = await db.teamActivity.findMany({
    where: {
      createdAt: { gte: feedStart },
      AND: [
        {
          OR: [
            networkAudienceVisibilityWhere(networkVisibility),
            publicAudienceVisibilityWhere(viewerId, blockedAuthorIds),
            alenioAudienceVisibilityWhere(hasWorkspaceMembership),
            ...(teamIds.length
              ? [workspaceAudienceVisibilityWhere(teamIds)]
              : []),
          ],
        },
        ...(Object.keys(cursorBoundary).length ? [cursorBoundary] : []),
      ],
    },
    include: personalFeedActivityInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit + 1,
  });

  const hasMore = activities.length > options.limit;
  const page = activities.slice(0, options.limit);
  const last = page.at(-1);

  return {
    items: page.map((activity) => serializePersonalFeedItem(activity, viewerId)),
    nextCursor:
      hasMore && last
        ? encodePersonalFeedCursor({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          })
        : null,
  };
}
