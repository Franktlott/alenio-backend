import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UnreadStore {
  lastReadIds: Record<string, string>;
  markAsRead: (convId: string, messageId: string) => void;
}

/** Resolve DM last-read id. Supports legacy `conv:` keys from older builds. */
export function getDmLastReadId(lastReadIds: Record<string, string>, conversationId: string): string {
  return lastReadIds[conversationId] || lastReadIds[`conv:${conversationId}`] || "";
}

/** Map conversation ids → last-read message ids for the unread-counts API (raw ids only). */
export function buildDmLastReadMap(
  conversations: { id: string }[],
  lastReadIds: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(conversations.map((c) => [c.id, getDmLastReadId(lastReadIds, c.id)]));
}

export function getDmUnreadCount(counts: Record<string, number>, conversationId: string): number {
  return counts[conversationId] ?? counts[`conv:${conversationId}`] ?? 0;
}

export const useUnreadStore = create<UnreadStore>()(
  persist(
    (set) => ({
      lastReadIds: {},
      markAsRead: (convId, messageId) =>
        set((s) => {
          const next = { ...s.lastReadIds, [convId]: messageId };
          // Prefer raw conversation ids; drop legacy `conv:` duplicate if present.
          if (!convId.startsWith("conv:") && !convId.startsWith("team:") && !convId.startsWith("topic:")) {
            delete next[`conv:${convId}`];
          }
          return { lastReadIds: next };
        }),
    }),
    {
      name: "unread-store",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
