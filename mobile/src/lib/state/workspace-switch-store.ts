import { create } from "zustand";

type WorkspaceSwitchStore = {
  /** User picked a different workspace; overlay timing is active until cleared. */
  sessionActive: boolean;
  showOverlay: boolean;
  overlayStartedAt: number | null;
  switchingToName: string | null;
  startSession: (teamName?: string | null) => void;
  endSession: () => void;
};

export const useWorkspaceSwitchStore = create<WorkspaceSwitchStore>((set) => ({
  sessionActive: false,
  showOverlay: false,
  overlayStartedAt: null,
  switchingToName: null,
  startSession: (teamName) =>
    set({
      sessionActive: true,
      showOverlay: true,
      overlayStartedAt: Date.now(),
      switchingToName: teamName ?? null,
    }),
  endSession: () =>
    set({
      sessionActive: false,
      showOverlay: false,
      overlayStartedAt: null,
      switchingToName: null,
    }),
}));
