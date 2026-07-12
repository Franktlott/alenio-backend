import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import {
  dmRealtimeChannel,
  realtimeClient,
  teamRealtimeChannel,
  type RealtimeDmMessageEvent,
  type RealtimeTeamMessageEvent,
} from "@/lib/realtime-client";

export const MESSAGE_PAGE_SIZE = 50;
/** Fallback poll when realtime is disconnected. */
export const MESSAGE_POLL_MS = 3000;
/** Slow safety poll while realtime is connected. */
export const MESSAGE_REALTIME_FALLBACK_POLL_MS = 30000;

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

export function flattenMessagePages<T extends { id: string; createdAt?: string }>(
  pages: unknown[] | undefined,
): T[] {
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
  // Match web: oldest → newest so FlatList shows new messages at the bottom.
  return result.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    const diff = aTime - bTime;
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
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

function appendMessageToPages<T extends { id: string; createdAt?: string }>(
  old: InfiniteData<MessagePage<T>> | undefined,
  message: T,
): InfiniteData<MessagePage<T>> | undefined {
  if (!old?.pages?.length) return old;
  const first = normalizeMessagePage<T>(old.pages[0]);
  if (first.messages.some((m) => m.id === message.id)) return old;
  const nextFirst: MessagePage<T> = {
    ...first,
    messages: [...first.messages, message].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const diff = aTime - bTime;
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    }),
  };
  return { ...old, pages: [nextFirst, ...old.pages.slice(1)] };
}

function useRealtimeConnected() {
  const [connected, setConnected] = useState(realtimeClient.isConnected());
  useEffect(() => realtimeClient.onStatus(setConnected), []);
  return connected;
}

export function usePaginatedTeamMessages<T extends { id: string }>(teamId: string, topicKey: string) {
  const queryClient = useQueryClient();
  const queryKey = ["messages", teamId, topicKey] as const;
  const realtimeConnected = useRealtimeConnected();
  const channel = teamId ? teamRealtimeChannel(teamId, topicKey) : "";

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
    if (!teamId || !channel) return;
    realtimeClient.subscribe([channel]);
    const offMessage = realtimeClient.onMessage((event) => {
      if (event.channel !== "team") return;
      const teamEvent = event as RealtimeTeamMessageEvent;
      if (teamEvent.teamId !== teamId) return;
      const eventTopic = teamEvent.topicId ?? "general";
      if (eventTopic !== topicKey) return;
      const message = teamEvent.message as T;
      if (!message?.id) return;
      queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) =>
        appendMessageToPages(old, message),
      );
      void queryClient.invalidateQueries({ queryKey: ["team-unread-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["messages", teamId, "general", "preview"] });
    });
    return () => {
      offMessage();
      realtimeClient.unsubscribe([channel]);
    };
  }, [teamId, topicKey, channel, queryClient]);

  useEffect(() => {
    if (!teamId) return;
    const intervalMs = realtimeConnected ? MESSAGE_REALTIME_FALLBACK_POLL_MS : MESSAGE_POLL_MS;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = normalizeMessagePage(
            await api.get<MessagePage<T>>(teamMessagesUrl(teamId, topicKey)),
          );
          queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) => {
            if (!old?.pages?.length) return old;
            return { ...old, pages: [latest, ...old.pages.slice(1)] };
          });
        } catch {
          // ignore polling errors
        }
      })();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [teamId, topicKey, queryClient, realtimeConnected]);

  const messages = useMemo(() => flattenMessagePages(query.data?.pages), [query.data?.pages]);

  return { ...query, messages, realtimeConnected };
}

export function usePaginatedDmMessages<T extends { id: string }>(conversationId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["dm-messages", conversationId] as const;
  const realtimeConnected = useRealtimeConnected();
  const channel = conversationId ? dmRealtimeChannel(conversationId) : "";

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
    if (!conversationId || !channel) return;
    realtimeClient.subscribe([channel]);
    const offMessage = realtimeClient.onMessage((event) => {
      if (event.channel !== "dm") return;
      const dmEvent = event as RealtimeDmMessageEvent;
      if (dmEvent.conversationId !== conversationId) return;
      const message = dmEvent.message as T;
      if (!message?.id) return;
      queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) =>
        appendMessageToPages(old, message),
      );
      void queryClient.invalidateQueries({ queryKey: ["dms"] });
      void queryClient.invalidateQueries({ queryKey: ["dm-unread-counts"] });
    });
    return () => {
      offMessage();
      realtimeClient.unsubscribe([channel]);
    };
  }, [conversationId, channel, queryClient]);

  useEffect(() => {
    if (!conversationId) return;
    const intervalMs = realtimeConnected ? MESSAGE_REALTIME_FALLBACK_POLL_MS : MESSAGE_POLL_MS;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = normalizeMessagePage(
            await api.get<MessagePage<T>>(dmMessagesUrl(conversationId)),
          );
          queryClient.setQueryData<InfiniteData<MessagePage<T>>>([...queryKey], (old) => {
            if (!old?.pages?.length) return old;
            return { ...old, pages: [latest, ...old.pages.slice(1)] };
          });
        } catch {
          // ignore polling errors
        }
      })();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [conversationId, queryClient, realtimeConnected]);

  const messages = useMemo(() => flattenMessagePages(query.data?.pages), [query.data?.pages]);

  return { ...query, messages, realtimeConnected };
}

export async function fetchLatestTeamMessagePreview(teamId: string) {
  const params = new URLSearchParams({ topicId: "general", limit: "1" });
  type PreviewMessage = {
    id: string;
    content?: string | null;
    mediaUrl?: string | null;
    createdAt: string;
    senderId?: string;
    sender?: { id: string; name: string | null };
  };
  const page = normalizeMessagePage<PreviewMessage>(
    await api.get<MessagePage<PreviewMessage>>(`/api/teams/${teamId}/messages?${params.toString()}`),
  );
  return page.messages;
}
