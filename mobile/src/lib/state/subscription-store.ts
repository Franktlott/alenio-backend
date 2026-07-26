import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistedPlan } from "@/lib/plan-access-copy";
import { isPersistedPaidPlan } from "@/lib/plan-access-copy";

export type Plan = PersistedPlan;

interface SubscriptionStore {
  plan: Plan;
  isPro: boolean; // kept for legacy compatibility
  setPlan: (plan: Plan) => void;
  setIsPro: (isPro: boolean) => void;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set) => ({
      plan: "free",
      isPro: false,
      setPlan: (plan) => set({ plan, isPro: false }),
      setIsPro: (isPro) => set({ isPro }),
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
