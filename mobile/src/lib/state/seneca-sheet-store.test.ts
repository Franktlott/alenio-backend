import { beforeEach, describe, expect, test } from "bun:test";
import { useSenecaSheetStore } from "./seneca-sheet-store";

describe("Seneca sheet prompt handoff", () => {
  beforeEach(() => {
    useSenecaSheetStore.setState({
      open: false,
      pendingPrompt: null,
      pendingConversationId: null,
    });
  });

  test("opens the sheet with a trimmed pending prompt", () => {
    useSenecaSheetStore
      .getState()
      .openSheetWithPrompt("  Help me coach with better questions.  ");

    expect(useSenecaSheetStore.getState().open).toBe(true);
    expect(useSenecaSheetStore.getState().pendingPrompt).toBe(
      "Help me coach with better questions.",
    );
  });

  test("clears a consumed prompt without closing the sheet", () => {
    useSenecaSheetStore.getState().openSheetWithPrompt("A useful prompt");
    useSenecaSheetStore.getState().clearPendingPrompt();

    expect(useSenecaSheetStore.getState().open).toBe(true);
    expect(useSenecaSheetStore.getState().pendingPrompt).toBeNull();
  });

  test("does not queue an empty prompt", () => {
    useSenecaSheetStore.getState().openSheetWithPrompt("   ");

    expect(useSenecaSheetStore.getState().open).toBe(true);
    expect(useSenecaSheetStore.getState().pendingPrompt).toBeNull();
  });

  test("queues a conversation to resume when the sheet opens", () => {
    useSenecaSheetStore
      .getState()
      .openSheetWithConversation("  conversation-42  ");

    expect(useSenecaSheetStore.getState().open).toBe(true);
    expect(useSenecaSheetStore.getState().pendingConversationId).toBe(
      "conversation-42",
    );

    useSenecaSheetStore.getState().clearPendingConversation();
    expect(useSenecaSheetStore.getState().open).toBe(true);
    expect(useSenecaSheetStore.getState().pendingConversationId).toBeNull();
  });
});
