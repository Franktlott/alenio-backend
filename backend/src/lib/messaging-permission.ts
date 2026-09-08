import { prisma } from "../prisma";
import { buildDmPairKey } from "./dm-pair-key";
import { isBlockedEitherDirection } from "./relationship-blocks";

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

export type MessagePermissionFacts = {
  sameUser: boolean;
  blocked: boolean;
  reconnectRequired?: boolean;
  recipientPrivacy: MessagePrivacy;
  connected: boolean;
  sharedWorkspace: boolean;
  sharedConversation: boolean;
};

export function evaluateMessagePermission(facts: MessagePermissionFacts): MessagePermission {
  if (facts.sameUser) return { allowed: true, reason: "self" };
  if (facts.blocked) return { allowed: false, reason: "blocked" };
  if (facts.reconnectRequired) return { allowed: false, reason: "not_connected" };
  if (facts.recipientPrivacy === "everyone") return { allowed: true, reason: "open_inbox" };
  if (facts.connected) return { allowed: true, reason: "connected" };
  if (facts.recipientPrivacy === "connections_only") {
    return { allowed: false, reason: "not_connected" };
  }
  if (facts.sharedWorkspace) return { allowed: true, reason: "shared_workspace" };
  if (facts.sharedConversation) return { allowed: true, reason: "shared_group" };
  return { allowed: false, reason: "not_connected" };
}

export type UserSearchMessagePermissionFacts = {
  recipientPrivacy: unknown;
  connected: boolean;
  reconnectRequired?: boolean;
  sharedWorkspace: boolean;
  sharedConversation: boolean;
};

/** Builds a search-row permission without per-result database lookups. */
export function evaluateUserSearchMessagePermission(
  facts: UserSearchMessagePermissionFacts,
): MessagePermission {
  return evaluateMessagePermission({
    sameUser: false,
    blocked: false,
    reconnectRequired: facts.reconnectRequired,
    recipientPrivacy: isMessagePrivacy(facts.recipientPrivacy)
      ? facts.recipientPrivacy
      : DEFAULT_MESSAGE_PRIVACY,
    connected: facts.connected,
    sharedWorkspace: facts.sharedWorkspace,
    sharedConversation: facts.sharedConversation,
  });
}

/** Reuses the sorted-pair trick from dmPairKey so a Connection row is order-independent. */
export function buildConnectionPairKey(userIdA: string, userIdB: string): string {
  return buildDmPairKey(userIdA, userIdB);
}

/** True if either person has blocked the other. Blocking is directional but bidirectional in effect. */
export async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  return isBlockedEitherDirection(userIdA, userIdB);
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
  if (senderId === recipientId) {
    return evaluateMessagePermission({
      sameUser: true,
      blocked: false,
      recipientPrivacy: DEFAULT_MESSAGE_PRIVACY,
      connected: false,
      sharedWorkspace: false,
      sharedConversation: false,
    });
  }

  const [blocked, recipient, connection, sharedWorkspace, sharedConversation] = await Promise.all([
    isBlockedEitherWay(senderId, recipientId),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { messagePrivacy: true },
    }),
    prisma.connection.findUnique({
      where: { pairKey: buildConnectionPairKey(senderId, recipientId) },
      select: { status: true },
    }),
    shareWorkspace(senderId, recipientId),
    shareConversation(senderId, recipientId),
  ]);
  const privacy: MessagePrivacy = isMessagePrivacy(recipient?.messagePrivacy)
    ? recipient.messagePrivacy
    : DEFAULT_MESSAGE_PRIVACY;
  return evaluateMessagePermission({
    sameUser: false,
    blocked,
    reconnectRequired: connection?.status === "reconnect_required",
    recipientPrivacy: privacy,
    connected: connection?.status === "accepted",
    sharedWorkspace,
    sharedConversation,
  });
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
