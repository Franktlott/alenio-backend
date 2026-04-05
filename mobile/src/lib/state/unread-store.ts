import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UnreadStore {
  lastReadIds: Record<string, string>;
  lastSeenIds: Record<string, string>;
  unreadCounts: Record<string, number>;
  markAsRead: (convId: string, messageId: string) => void;
  updateSeen: (convId: string, messageId: string, isFromOther: boolean) => void;
}

export const useUnreadStore = create<UnreadStore>()(
  persist(
    (set) => ({
      lastReadIds: {},
      lastSeenIds: {},
      unreadCounts: {},
      markAsRead: (convId, messageId) =>
        set((s) => ({
          lastReadIds: { ...s.lastReadIds, [convId]: messageId },
          unreadCounts: { ...s.unreadCounts, [convId]: 0 },
        })),
      updateSeen: (convId, messageId, isFromOther) =>
        set((s) => {
          const isNew = s.lastSeenIds[convId] !== messageId;
          const isUnread = s.lastReadIds[convId] !== messageId;
          const shouldIncrement = isNew && isFromOther && isUnread;
          return {
            lastSeenIds: { ...s.lastSeenIds, [convId]: messageId },
            unreadCounts: shouldIncrement
              ? { ...s.unreadCounts, [convId]: (s.unreadCounts[convId] ?? 0) + 1 }
              : s.unreadCounts,
          };
        }),
    }),
    {
      name: "unread-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
