import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { SenecaContext } from "@/lib/seneca-api";
import { PERSONAL_SENECA_CONTEXT } from "@/lib/seneca-context";

type SenecaContextStore = {
  context: SenecaContext;
  setContext: (context: SenecaContext) => void;
};

export const useSenecaContextStore = create<SenecaContextStore>()(
  persist(
    (set) => ({
      context: PERSONAL_SENECA_CONTEXT,
      setContext: (context) => set({ context }),
    }),
    {
      name: "alenio-seneca-context",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ context: state.context }),
    },
  ),
);
