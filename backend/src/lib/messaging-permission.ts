import { prisma } from "../prisma";
import { buildDmPairKey } from "./dm-pair-key";

export const MESSAGE_PRIVACY_VALUES = ["everyone", "connections_and_shared", "connections_only"] as const;
export type MessagePrivacy = (typeof MESSAGE_PRIVACY_VALUES)[number];

export const DEFAULT_MESSAGE_PRIVACY: MessagePrivacy = "connections_and_shared";

export function isMessagePrivacy(value: unknown): value is MessagePrivacy {
  return typeof value === "string" && (MESSAGE_PRIVACY_VALUES as readonly string[]).includes(value);
}

export type MessagePermissionReason =
  | "self"
  | "blocked"
  | "connected"
  | "shared_workspace"
  | "shared_group"
  | "open_inbox"
  | "not_connected";

export type MessagePermission = {
  allowed: boolean;
  reason: MessagePermissionReason;
};

/** Reuses the sorted-pair trick from dmPairKey so a Connection row is order-independent. */
export function buildConnectionPairKey(userIdA: string, userIdB: string): string {
  return buildDmPairKey(userIdA, userIdB);
}

/** True if either person has blocked the other. Blocking is directional but bidirectional in effect. */
export async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return block !== null;
}

export async function areConnected(userIdA: string, userIdB: string): Promise<boolean> {
  const connection = await prisma.connection.findUnique({
    where: { pairKey: buildConnectionPairKey(userIdA, userIdB) },
    select: { status: true },
  });
  return connection?.status === "accepted";
}

export async function shareWorkspace(userIdA: string, userIdB: string): Promise<boolean> {
  const shared = await prisma.teamMember.findFirst({
    where: {
      userId: userIdA,
      team: { members: { some: { userId: userIdB } } },
    },
    select: { id: true },
  });
  return shared !== null;
}

export async function shareConversation(userIdA: string, userIdB: string): Promise<boolean> {
  const shared = await prisma.conversationParticipant.findFirst({
    where: {
      userId: userIdA,
      conversation: { participants: { some: { userId: userIdB } } },
    },
    select: { id: true },
  });
  return shared !== null;
}

/**
 * Whether `senderId` may start or continue a conversation with `recipientId`.
 *
 * Evaluated in order: block, then the recipient's stated preference. A Connection is
 * never required where another real relationship already exists, so coworkers and
 * existing group members keep messaging exactly as they do today.
 */
export async function canMessage(senderId: string, recipientId: string): Promise<MessagePermission> {
  if (senderId === recipientId) return { allowed: true, reason: "self" };

  if (await isBlockedEitherWay(senderId, recipientId)) {
    return { allowed: false, reason: "blocked" };
  }

  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { messagePrivacy: true },
  });
  const privacy: MessagePrivacy = isMessagePrivacy(recipient?.messagePrivacy)
    ? recipient.messagePrivacy
    : DEFAULT_MESSAGE_PRIVACY;

  if (privacy === "everyone") return { allowed: true, reason: "open_inbox" };

  if (await areConnected(senderId, recipientId)) {
    return { allowed: true, reason: "connected" };
  }

  if (privacy === "connections_only") {
    return { allowed: false, reason: "not_connected" };
  }

  if (await shareWorkspace(senderId, recipientId)) {
    return { allowed: true, reason: "shared_workspace" };
  }
  if (await shareConversation(senderId, recipientId)) {
    return { allowed: true, reason: "shared_group" };
  }

  return { allowed: false, reason: "not_connected" };
}

export function messagePermissionErrorMessage(reason: MessagePermissionReason): string {
  if (reason === "blocked") return "You can no longer message this person.";
  return "Connect with this person before messaging them.";
}

/** Evaluates several recipients at once, returning only those the sender may not message. */
export async function findUnmessageableUserIds(
  senderId: string,
  recipientIds: string[],
): Promise<string[]> {
  const unique = Array.from(new Set(recipientIds.filter((id) => id && id !== senderId)));
  const results = await Promise.all(
    unique.map(async (id) => ({ id, permission: await canMessage(senderId, id) })),
  );
  return results.filter((row) => !row.permission.allowed).map((row) => row.id);
}
