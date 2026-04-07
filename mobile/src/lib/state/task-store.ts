import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TaskStore {
  acknowledgedCounts: Record<string, number>; // teamId -> last acknowledged task count
  acknowledge: (teamId: string, count: number) => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      acknowledgedCounts: {},
      acknowledge: (teamId, count) =>
        set((s) => ({ acknowledgedCounts: { ...s.acknowledgedCounts, [teamId]: count } })),
    }),
    {
      name: "task-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
