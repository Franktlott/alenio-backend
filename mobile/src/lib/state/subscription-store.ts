import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SubscriptionStore {
  isPro: boolean;
  setIsPro: (isPro: boolean) => void;
}

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set) => ({
      isPro: false,
      setIsPro: (isPro) => set({ isPro }),
    }),
    {
      name: "alenio-subscription-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
