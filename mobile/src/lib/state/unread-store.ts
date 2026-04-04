import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UnreadStore {
  lastReadIds: Record<string, string>;
  markAsRead: (convId: string, messageId: string) => void;
}

export const useUnreadStore = create<UnreadStore>()(
  persist(
    (set) => ({
      lastReadIds: {},
      markAsRead: (convId, messageId) =>
        set((s) => ({ lastReadIds: { ...s.lastReadIds, [convId]: messageId } })),
    }),
    {
      name: "unread-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
