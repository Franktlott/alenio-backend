import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseGoFrontendSettings } from "./go-frontend-settings";
import {
  deleteStorageObjectByPath,
  listUserUploadObjects,
  parseOwnedStorageObjectFromUrl,
} from "./firebase-storage";

/** Grace period so in-progress compose / retries are not deleted. */
export const ORPHAN_UPLOAD_MIN_AGE_DAYS = 7;
/** Safety cap per run so cleanup cannot starve the API process. */
export const ORPHAN_UPLOAD_MAX_DELETE_PER_RUN = 400;

/**
 * Feed / update posts that store media under users/.../uploads/ in metadata.
 * Workspace `post` and Alenio posts must be included — protecting only
 * `network_post` let orphan cleanup delete live workspace photos.
 */
export const ORPHAN_PROTECTED_ACTIVITY_TYPES = [
  "network_post",
  "post",
  "alenio_post",
] as const;

function addUrl(paths: Set<string>, url: string | null | undefined) {
  if (!url?.trim()) return;
  const parsed = parseOwnedStorageObjectFromUrl(url);
  if (parsed?.objectPath) paths.add(parsed.objectPath);
}

function addJsonUrlList(paths: Set<string>, value: unknown) {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (typeof entry === "string") addUrl(paths, entry);
  }
}

export function collectUploadObjectPathsFromValue(
  value: unknown,
  paths = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    addUrl(paths, value);
    return paths;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectUploadObjectPathsFromValue(entry, paths);
    return paths;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectUploadObjectPathsFromValue(entry, paths);
    }
  }
  return paths;
}

/**
 * Collect Storage object paths still referenced by live app data.
 * Generic chat/task uploads live under users/.../uploads/.
 */
export async function collectReferencedUploadObjectPaths(): Promise<Set<string>> {
  const paths = new Set<string>();

  const [
    messages,
    directMessages,
    tasks,
    templates,
    series,
    conversations,
    topics,
    users,
    teams,
    calendarEvents,
    walkResponses,
    senecaMessages,
    profilePhotos,
    networkPosts,
    discoverArticles,
    homeInsightCards,
  ] = await Promise.all([
    prisma.message.findMany({
      where: { mediaUrl: { not: null } },
      select: { mediaUrl: true },
    }),
    prisma.directMessage.findMany({
      where: { mediaUrl: { not: null } },
      select: { mediaUrl: true },
    }),
    prisma.task.findMany({
      where: { attachmentUrl: { not: null } },
      select: { attachmentUrl: true },
    }),
    prisma.taskTemplate.findMany({
      where: { attachmentUrl: { not: null } },
      select: { attachmentUrl: true },
    }),
    prisma.recurrenceSeries.findMany({
      where: { attachmentUrl: { not: null } },
      select: { attachmentUrl: true },
    }),
    prisma.conversation.findMany({
      where: { image: { not: null } },
      select: { image: true },
    }),
    prisma.topic.findMany({
      where: { image: { not: null } },
      select: { image: true },
    }),
    prisma.user.findMany({
      where: { image: { not: null } },
      select: { image: true },
    }),
    prisma.team.findMany({
      select: { image: true, coverImage: true, goFrontendSettings: true },
    }),
    prisma.calendarEvent
      .findMany({
        where: { image: { not: null } },
        select: { image: true },
      })
      .catch(() => [] as Array<{ image: string | null }>),
    prisma.walkItemResponse.findMany({
      where: { photoUrls: { not: Prisma.DbNull } },
      select: { photoUrls: true, response: true },
    }),
    prisma.senecaConversationMessage.findMany({
      where: { conversation: { expiresAt: { gt: new Date() } } },
      select: { metadata: true },
    }),
    prisma.userProfilePhoto.findMany({ select: { url: true } }),
    prisma.teamActivity.findMany({
      where: {
        type: { in: [...ORPHAN_PROTECTED_ACTIVITY_TYPES] },
        metadata: { not: null },
      },
      select: { metadata: true },
    }),
    // Legacy Discover covers may still live under users/.../uploads/. New uploads use
    // content/discover/ (outside this sweep). Keep old paths referenced until re-uploaded.
    prisma.discoverArticle
      .findMany({
        select: { coverImageUrl: true, content: true, pendingDraft: true },
      })
      .catch(() => [] as Array<{ coverImageUrl: string | null; content: unknown; pendingDraft: unknown }>),
    prisma.homeInsightCard
      .findMany({
        where: { imageUrl: { not: null } },
        select: { imageUrl: true },
      })
      .catch(() => [] as Array<{ imageUrl: string | null }>),
  ]);

  for (const row of messages) addUrl(paths, row.mediaUrl);
  for (const row of directMessages) addUrl(paths, row.mediaUrl);
  for (const row of tasks) addUrl(paths, row.attachmentUrl);
  for (const row of templates) addUrl(paths, row.attachmentUrl);
  for (const row of series) addUrl(paths, row.attachmentUrl);
  for (const row of conversations) addUrl(paths, row.image);
  for (const row of topics) addUrl(paths, row.image);
  for (const row of users) addUrl(paths, row.image);
  for (const row of profilePhotos) addUrl(paths, row.url);

  for (const team of teams) {
    addUrl(paths, team.image);
    addUrl(paths, team.coverImage);
    const settings = parseGoFrontendSettings(team.goFrontendSettings);
    addUrl(paths, settings.heroImageUrl);
  }
  for (const row of calendarEvents) addUrl(paths, row.image);

  for (const row of walkResponses) {
    addJsonUrlList(paths, row.photoUrls);
    if (row.response && typeof row.response === "object" && !Array.isArray(row.response)) {
      const nested = (row.response as { photoUrls?: unknown }).photoUrls;
      addJsonUrlList(paths, nested);
    }
  }
  for (const row of senecaMessages) {
    collectUploadObjectPathsFromValue(row.metadata, paths);
  }
  for (const row of networkPosts) {
    if (!row.metadata) continue;
    try {
      collectUploadObjectPathsFromValue(JSON.parse(row.metadata), paths);
    } catch {
      // Malformed legacy metadata cannot safely reference a storage object.
    }
  }
  for (const row of discoverArticles) {
    addUrl(paths, row.coverImageUrl);
    collectUploadObjectPathsFromValue(row.content, paths);
    collectUploadObjectPathsFromValue(row.pendingDraft, paths);
  }
  for (const row of homeInsightCards) addUrl(paths, row.imageUrl);

  return paths;
}

export type OrphanUploadCleanupResult = {
  scanned: number;
  referencedSkipped: number;
  tooNewSkipped: number;
  deleted: number;
  errors: number;
};

/**
 * Deletes unreferenced user upload objects older than the grace period.
 * Only paths under users/.../uploads/ are considered. Profile/team/Go/Discover/
 * Home Insight content slots are never touched. Referenced feed media includes
 * workspace posts, network posts, and Alenio posts.
 */
export async function cleanupOrphanUserUploads(options?: {
  olderThanDays?: number;
  maxDelete?: number;
  dryRun?: boolean;
}): Promise<OrphanUploadCleanupResult> {
  const olderThanDays = options?.olderThanDays ?? ORPHAN_UPLOAD_MIN_AGE_DAYS;
  const maxDelete = options?.maxDelete ?? ORPHAN_UPLOAD_MAX_DELETE_PER_RUN;
  const dryRun = options?.dryRun ?? false;
  const cutoffMs = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const result: OrphanUploadCleanupResult = {
    scanned: 0,
    referencedSkipped: 0,
    tooNewSkipped: 0,
    deleted: 0,
    errors: 0,
  };

  const [objects, referenced] = await Promise.all([
    listUserUploadObjects(),
    collectReferencedUploadObjectPaths(),
  ]);

  for (const object of objects) {
    result.scanned += 1;
    if (referenced.has(object.objectPath)) {
      result.referencedSkipped += 1;
      continue;
    }
    if (!object.uploadedAtMs || object.uploadedAtMs > cutoffMs) {
      result.tooNewSkipped += 1;
      continue;
    }
    if (result.deleted >= maxDelete) break;

    if (dryRun) {
      result.deleted += 1;
      continue;
    }

    const ok = await deleteStorageObjectByPath(object.bucketId, object.objectPath);
    if (ok) result.deleted += 1;
    else result.errors += 1;
  }

  return result;
}
