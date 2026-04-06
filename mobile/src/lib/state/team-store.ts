import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TeamStore {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      activeTeamId: null,
      setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: "alenio-team-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ activeTeamId: state.activeTeamId }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
