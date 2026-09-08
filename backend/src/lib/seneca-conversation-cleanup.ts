import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { deleteStorageObjectByUrlIfOwned } from "./firebase-storage";

export const SENECA_CONVERSATION_CLEANUP_BATCH_SIZE = 25;

export function collectUrls(value: unknown, urls = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls);
    return urls;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectUrls(item, urls);
    }
  }
  return urls;
}

export function isSenecaStoredImageGenerationSource(source: string): boolean {
  return source === "image" || source === "image_edit";
}

export async function deleteSenecaConversation(
  conversationId: string,
  db: PrismaClient = prisma,
): Promise<boolean> {
  const conversation = await db.senecaConversation.findUnique({
    where: { id: conversationId },
    select: {
      messages: { select: { metadata: true } },
      generations: { select: { id: true, source: true, response: true, contextUsed: true } },
    },
  });
  if (!conversation) return false;

  const urls = new Set<string>();
  for (const message of conversation.messages) collectUrls(message.metadata, urls);
  for (const generation of conversation.generations) {
    if (isSenecaStoredImageGenerationSource(generation.source)) {
      collectUrls(generation.response, urls);
      if (generation.contextUsed) {
        try {
          collectUrls(JSON.parse(generation.contextUsed), urls);
        } catch {
          // Legacy metadata may not be JSON.
        }
      }
    }
  }
  for (const url of urls) await deleteStorageObjectByUrlIfOwned(url);

  await db.$transaction(async (tx) => {
    await tx.senecaGeneration.deleteMany({ where: { conversationId } });
    await tx.senecaConversation.deleteMany({ where: { id: conversationId } });
  });
  return true;
}

export async function cleanupExpiredSenecaConversations(
  now = new Date(),
  limit = SENECA_CONVERSATION_CLEANUP_BATCH_SIZE,
  db: PrismaClient = prisma,
): Promise<{ selected: number; deleted: number; failed: number }> {
  const expired = await db.senecaConversation.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
  });
  let deleted = 0;
  let failed = 0;
  for (const row of expired) {
    try {
      if (await deleteSenecaConversation(row.id, db)) deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`[seneca-retention] Failed to delete conversation ${row.id}:`, error);
    }
  }
  return { selected: expired.length, deleted, failed };
}
