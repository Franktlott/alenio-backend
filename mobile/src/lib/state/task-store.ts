import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface TaskStore {
  acknowledgedCounts: Record<string, number>; // teamId -> last acknowledged task count
  acknowledgedEventCounts: Record<string, number>; // teamId -> last acknowledged calendar event count
  acknowledge: (teamId: string, count: number) => void;
  acknowledgeEvents: (teamId: string, count: number) => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set) => ({
      acknowledgedCounts: {},
      acknowledgedEventCounts: {},
      acknowledge: (teamId, count) =>
        set((s) => ({ acknowledgedCounts: { ...s.acknowledgedCounts, [teamId]: count } })),
      acknowledgeEvents: (teamId, count) =>
        set((s) => ({ acknowledgedEventCounts: { ...s.acknowledgedEventCounts, [teamId]: count } })),
    }),
    {
      name: "task-store",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
