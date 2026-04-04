import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TeamStore {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set) => ({
      activeTeamId: null,
      setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
    }),
    {
      name: "alenio-team-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
