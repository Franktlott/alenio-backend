import { useEffect, useMemo } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_POLL_MS = 3000;

export type MessagePage<T> = {
  messages: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

/** Accepts paginated API pages and legacy plain message arrays from older cache entries. */
export function normalizeMessagePage<T>(raw: unknown): MessagePage<T> {
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

export function flattenMessagePages<T extends { id: string }>(pages: unknown[] | undefined): T[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const result: T[] = [];
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const page = normalizeMessagePage<T>(pages[i]);
    for (const msg of page.messages) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      result.push(msg);
    }
  }
  return result;
}

function teamMessagesUrl(teamId: string, topicKey: string, before?: string) {
  const params = new URLSearchParams({ topicId: topicKey, limit: String(MESSAGE_PAGE_SIZE) });
  if (before) params.set("before", before);
  return `/api/teams/${teamId}/messages?${params.toString()}`;
}

function dmMessagesUrl(conversationId: string, before?: string) {
  const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });
  if (before) params.set("before", before);
  return `/api/dms/${conversationId}/messages?${params.toString()}`;
}

export function usePaginatedTeamMessages<T extends { id: string }>(teamId: string, topicKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ["messages", teamId, topicKey] as const;

  const query = useInfiniteQuery({
    queryKey: [...queryKey],
    enabled: !!teamId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      normalizeMessagePage(await api.get<MessagePage<T>>(teamMessagesUrl(teamId, topicKey, pageParam))),
    getNextPageParam: (lastPage) => {
      const page = normalizeMessagePage<T>(lastPage);
      return page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    },
  });

  useEffect(() => {
    if (!teamId) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = normalizeMessagePage(
            await api.get<MessagePage<T>>(teamMessagesUrl(teamId, topicKey))
          );
          queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) => {
            if (!old?.pages?.length) return old;
            return { ...old, pages: [latest, ...old.pages.slice(1)] };
          });
        } catch {
          // ignore polling errors
        }
      })();
    }, MESSAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [teamId, topicKey, queryClient]);

  const messages = useMemo(() => flattenMessagePages(query.data?.pages), [query.data?.pages]);

  return { ...query, messages };
}

export function usePaginatedDmMessages<T extends { id: string }>(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["dm-messages", conversationId] as const;

  const query = useInfiniteQuery({
    queryKey: [...queryKey],
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      normalizeMessagePage(await api.get<MessagePage<T>>(dmMessagesUrl(conversationId, pageParam))),
    getNextPageParam: (lastPage) => {
      const page = normalizeMessagePage<T>(lastPage);
      return page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = normalizeMessagePage(
            await api.get<MessagePage<T>>(dmMessagesUrl(conversationId))
          );
          queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) => {
            if (!old?.pages?.length) return old;
            return { ...old, pages: [latest, ...old.pages.slice(1)] };
          });
        } catch {
          // ignore polling errors
        }
      })();
    }, MESSAGE_POLL_MS);
    return () => clearInterval(timer);
  }, [conversationId, queryClient]);

  const messages = useMemo(() => flattenMessagePages(query.data?.pages), [query.data?.pages]);

  return { ...query, messages };
}

export async function fetchLatestTeamMessagePreview(teamId: string) {
  const params = new URLSearchParams({ topicId: "general", limit: "1" });
  const page = normalizeMessagePage<{ id: string }>(
    await api.get<MessagePage<{ id: string }>>(`/api/teams/${teamId}/messages?${params.toString()}`)
  );
  return page.messages;
}
