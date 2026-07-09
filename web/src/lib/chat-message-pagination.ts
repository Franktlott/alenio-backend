export type MessagePage<T> = {
  messages: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

/** Accepts paginated API pages and legacy plain message arrays from older cache entries. */
export function normalizeMessageList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const page = raw as Partial<MessagePage<T>>;
    return Array.isArray(page.messages) ? page.messages : [];
  }
  return [];
}

export function extractMessagePage<T>(raw: unknown): MessagePage<T> {
  if (Array.isArray(raw)) {
    return { messages: raw as T[], hasMore: false, nextCursor: null };
  }
  if (raw && typeof raw === "object") {
    const page = raw as Partial<MessagePage<T>>;
    return {
      messages: Array.isArray(page.messages) ? page.messages : [],
      hasMore: Boolean(page.hasMore),
      nextCursor: page.nextCursor ?? null,
    };
  }
  return { messages: [], hasMore: false, nextCursor: null };
}
