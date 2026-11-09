import { create } from "zustand";

type SenecaSheetStore = {
  open: boolean;
  pendingPrompt: string | null;
  pendingConversationId: string | null;
  openSheet: () => void;
  openSheetWithPrompt: (prompt: string) => void;
  clearPendingPrompt: () => void;
  openSheetWithConversation: (conversationId: string) => void;
  clearPendingConversation: () => void;
  closeSheet: () => void;
};

export const useSenecaSheetStore = create<SenecaSheetStore>((set) => ({
  open: false,
  pendingPrompt: null,
  pendingConversationId: null,
  openSheet: () => set({ open: true }),
  openSheetWithPrompt: (prompt) =>
    set({
      open: true,
      pendingPrompt: prompt.trim() || null,
    }),
  clearPendingPrompt: () => set({ pendingPrompt: null }),
  openSheetWithConversation: (conversationId) =>
    set({
      open: true,
      pendingConversationId: conversationId.trim() || null,
    }),
  clearPendingConversation: () => set({ pendingConversationId: null }),
  closeSheet: () => set({ open: false }),
}));

type ProfileSheetStore = {
  open: boolean;
  openSheet: () => void;
  closeSheet: () => void;
};

export const useProfileSheetStore = create<ProfileSheetStore>((set) => ({
  open: false,
  openSheet: () => set({ open: true }),
  closeSheet: () => set({ open: false }),
}));
