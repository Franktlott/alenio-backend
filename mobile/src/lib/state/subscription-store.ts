import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Plan = "free" | "team";

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
      // Normalize legacy "pro" value to "team" when reading from AsyncStorage
      onRehydrateStorage: () => (state) => {
        if (state && (state.plan as string) === "pro") {
          state.plan = "team";
        }
      },
    }
  )
);
