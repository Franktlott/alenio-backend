import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistedPlan } from "@/lib/plan-access-copy";
import { isPersistedPaidPlan } from "@/lib/plan-access-copy";
import type { WorkspaceSubscription } from "@/lib/workspace-access-core";

export type Plan = PersistedPlan;

interface SubscriptionStore {
  plan: Plan;
  isPro: boolean; // kept for legacy compatibility
  subscription: { teamId: string; data: WorkspaceSubscription } | null;
  setPlan: (plan: Plan) => void;
  setIsPro: (isPro: boolean) => void;
  setSubscription: (teamId: string, data: WorkspaceSubscription) => void;
  clearSubscription: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set) => ({
      plan: "free",
      isPro: false,
      subscription: null,
      setPlan: (plan) => set({ plan, isPro: false }),
      setIsPro: (isPro) => set({ isPro }),
      setSubscription: (teamId, data) =>
        set({
          subscription: { teamId, data },
          plan: isPersistedPaidPlan(data.plan) ? "team" : "free",
          isPro: false,
        }),
      clearSubscription: () => set({ subscription: null, plan: "free", isPro: false }),
    }),
    {
      name: "alenio-subscription-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Normalize legacy / API plan strings to free | team (team = Pro+ features).
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.plan = isPersistedPaidPlan(state.plan) ? "team" : "free";
      },
    }
  )
);
