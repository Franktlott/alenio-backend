import { prisma } from "../prisma";

/**
 * Account-level activity types, kept deliberately few. Connection requests,
 * declines, removals, blocks and profile views are intentionally never logged.
 */
export const ACCOUNT_ACTIVITY_TYPES = [
  "connection_accepted",
  "workspace_invitation_received",
  "mention_in_conversation",
] as const;

export type AccountActivityType = (typeof ACCOUNT_ACTIVITY_TYPES)[number];

export function isAccountActivityType(value: unknown): value is AccountActivityType {
  return typeof value === "string" && (ACCOUNT_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export type AccountActivityInput = {
  userId: string;
  type: AccountActivityType;
  content: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes a TeamActivity row with no teamId, so it belongs to the person and
 * survives leaving every workspace. Never throws: activity is not worth failing
 * the action that produced it.
 */
export async function recordAccountActivity(input: AccountActivityInput): Promise<void> {
  try {
    await prisma.teamActivity.create({
      data: {
        teamId: null,
        userId: input.userId,
        type: input.type,
        metadata: JSON.stringify({ content: input.content, ...(input.metadata ?? {}) }),
      },
    });
  } catch (err) {
    console.warn("[account-activity] failed to record", input.type, err);
  }
}
