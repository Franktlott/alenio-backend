import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Whether Home's get-started card has been waved off. Dismissing collapses it
 * to a one-line prompt rather than removing it, so joining a workspace stays
 * one tap away for someone who changes their mind months later.
 */
interface HomeGetStartedStore {
  dismissedAt: string | null;
  dismiss: () => void;
  restore: () => void;
}

export const useHomeGetStartedStore = create<HomeGetStartedStore>()(
  persist(
    (set) => ({
      dismissedAt: null,
      dismiss: () => set({ dismissedAt: new Date().toISOString() }),
      restore: () => set({ dismissedAt: null }),
    }),
    {
      name: "home-get-started",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** How long the join-or-create pitch leads before the card changes tack. */
export const GET_STARTED_LEAD_DAYS = 7;

/**
 * Temporary: one test account sees the day-seven card straight away, so the
 * state can be reviewed without waiting a week. Delete this and its call.
 */
const SETTLED_PREVIEW_NAMES = ["janell"];

export function isSettledPreviewAccount(
  user: { name?: string | null } | null | undefined,
): boolean {
  const name = user?.name?.trim().toLowerCase();
  if (!name) return false;
  return SETTLED_PREVIEW_NAMES.some((preview) => name.startsWith(preview));
}

export function hasSettledWithoutWorkspace(
  accountCreatedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!accountCreatedAt) return false;
  const created = new Date(accountCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created >= GET_STARTED_LEAD_DAYS * 24 * 60 * 60 * 1000;
}
