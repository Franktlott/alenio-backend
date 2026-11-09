import type { DiscoverStatus } from "./discover-document";

export type PublicationInput = {
  status: DiscoverStatus;
  publishedAt?: string | null;
  scheduledAt?: string | null;
};

export type PublicationResult =
  | { ok: true; status: DiscoverStatus; publishedAt: Date | null; scheduledAt: Date | null }
  | { ok: false; message: string };

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Draft and archived are never public.
 * Published is public once publishedAt has arrived.
 * Scheduled is public once scheduledAt has arrived, with no background job.
 */
export function discoverArticleIsLive(
  article: { status: string; publishedAt: Date | null; scheduledAt: Date | null },
  now: Date,
): boolean {
  if (article.status === "published") {
    return article.publishedAt != null && article.publishedAt.getTime() <= now.getTime();
  }
  if (article.status === "scheduled") {
    return article.scheduledAt != null && article.scheduledAt.getTime() <= now.getTime();
  }
  return false;
}

export function liveInstant(
  article: { status: string; publishedAt: Date | null; scheduledAt: Date | null },
): Date | null {
  if (article.status === "published") return article.publishedAt;
  if (article.status === "scheduled") return article.scheduledAt;
  return null;
}

export function resolvePublication(input: PublicationInput, now: Date): PublicationResult {
  if (input.status === "draft" || input.status === "unpublished") {
    return { ok: true, status: input.status, publishedAt: null, scheduledAt: null };
  }
  if (input.status === "archived") {
    const publishedAt = parseInstant(input.publishedAt);
    if (input.publishedAt && !publishedAt) {
      return { ok: false, message: "Published date is not valid." };
    }
    return { ok: true, status: "archived", publishedAt, scheduledAt: null };
  }
  if (input.status === "scheduled") {
    const scheduledAt = parseInstant(input.scheduledAt);
    if (!scheduledAt) return { ok: false, message: "Choose a date and time to schedule this article." };
    return { ok: true, status: "scheduled", publishedAt: null, scheduledAt };
  }
  const publishedAt = parseInstant(input.publishedAt) ?? now;
  if (input.publishedAt && !parseInstant(input.publishedAt)) {
    return { ok: false, message: "Published date is not valid." };
  }
  if (publishedAt.getTime() > now.getTime()) {
    return { ok: true, status: "scheduled", publishedAt: null, scheduledAt: publishedAt };
  }
  return { ok: true, status: "published", publishedAt, scheduledAt: null };
}

export function liveArticleWhere(now: Date) {
  return {
    OR: [
      { status: "published" as const, publishedAt: { lte: now } },
      { status: "scheduled" as const, scheduledAt: { lte: now } },
    ],
  };
}
