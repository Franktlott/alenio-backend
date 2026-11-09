import { describe, expect, test } from "bun:test";
import type {
  SenecaConversationMessage,
  SenecaConversationSummary,
} from "./seneca-api";
import {
  formatSenecaConversationWhen,
  formatSenecaExpiry,
  formatSenecaUpdatedAt,
  mapSenecaConversationMessages,
  recentSenecaConversations,
} from "./seneca-conversation-presentation";

const baseMessage = {
  createdAt: "2026-08-25T12:00:00.000Z",
};

describe("Seneca retained conversation presentation", () => {
  test("sorts messages and safely restores supported metadata", () => {
    const messages: SenecaConversationMessage[] = [
      {
        ...baseMessage,
        id: "assistant-image",
        order: 3,
        role: "assistant",
        text: "Here is your image.",
        metadata: {
          kind: "image",
          generationId: "generation-1",
          url: "https://example.com/image.png",
          prompt: "A calm meeting room",
          revisedPrompt: null,
          width: 1024,
          height: 1024,
          mimeType: "image/png",
        },
      },
      {
        ...baseMessage,
        id: "user",
        order: 1,
        role: "user",
        text: "Help me prepare",
        metadata: {
          kind: "attachment",
          attachment: {
            url: "https://example.com/brief.pdf",
            mimeType: "application/pdf",
            fileName: "team-brief.pdf",
            sizeBytes: 2048,
          },
        },
      },
      {
        ...baseMessage,
        id: "assistant-ask",
        order: 2,
        role: "assistant",
        text: "Start with the desired outcome.",
        metadata: {
          kind: "ask",
          planOneOnOne: {
            memberUserId: "member-1",
            memberName: "Jordan",
            startDate: "2026-08-26T14:00:00.000Z",
            durationMinutes: 30,
            dateLabel: "Tomorrow",
            timeLabel: "10:00 AM",
          },
          createTask: { title: 42 },
        },
      },
    ];

    const mapped = mapSenecaConversationMessages(messages);

    expect(mapped.map((message) => message.id)).toEqual([
      "user",
      "assistant-ask",
      "assistant-image",
    ]);
    expect(mapped[1]?.planProposal?.memberName).toBe("Jordan");
    expect(mapped[1]?.createTaskProposal).toBeUndefined();
    expect(mapped[2]?.generatedImage?.generationId).toBe("generation-1");
    expect(mapped[0]?.attachment?.fileName).toBe("team-brief.pdf");
  });

  test("ignores image metadata on user messages", () => {
    const mapped = mapSenecaConversationMessages([
      {
        ...baseMessage,
        id: "user-image",
        order: 1,
        role: "user",
        text: "A mountain sunrise",
        metadata: {
          kind: "image_prompt",
          url: "https://example.com/not-an-assistant-image.png",
        },
      },
    ]);

    expect(mapped[0]).toEqual({
      id: "user-image",
      role: "user",
      text: "A mountain sunrise",
    });
  });

  test("restores an edited image turn from persisted metadata", () => {
    const mapped = mapSenecaConversationMessages([
      {
        ...baseMessage,
        id: "edit-source",
        order: 1,
        role: "user",
        text: "Recolor the wall blue",
        metadata: {
          kind: "attachment",
          operation: "image_edit",
          attachment: {
            url: "https://example.com/source.png",
            mimeType: "image/png",
            fileName: "office-source.png",
            sizeBytes: 4096,
          },
        },
      },
      {
        ...baseMessage,
        id: "edit-output",
        order: 2,
        role: "assistant",
        text: "Edited the attached image from your instructions.",
        metadata: {
          kind: "image",
          operation: "image_edit",
          generationId: "edit-generation-1",
          url: "https://example.com/edited.png",
          prompt: "Recolor the wall blue",
          revisedPrompt: null,
          width: 1024,
          height: 1024,
          mimeType: "image/png",
        },
      },
    ]);

    expect(mapped[0]?.attachment?.fileName).toBe("office-source.png");
    expect(mapped[1]?.generatedImage?.url).toBe(
      "https://example.com/edited.png",
    );
  });

  test("ignores malformed or unsupported attachment metadata", () => {
    const mapped = mapSenecaConversationMessages([
      {
        ...baseMessage,
        id: "bad-attachment",
        order: 1,
        role: "user",
        text: "Review this",
        metadata: {
          kind: "attachment",
          attachment: {
            url: "https://example.com/file.gif",
            mimeType: "image/gif",
            fileName: "file.gif",
            sizeBytes: 100,
          },
        },
      },
    ]);

    expect(mapped[0]?.attachment).toBeUndefined();
  });

  test("labels conversation times for the resume card", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(formatSenecaConversationWhen("2026-08-25T11:45:00.000Z", now)).toBe(
      "15m ago",
    );
    expect(formatSenecaConversationWhen("2026-08-25T08:00:00.000Z", now)).toBe(
      "4h ago",
    );
    expect(formatSenecaConversationWhen("2026-08-24T23:30:00.000Z", now)).toBe(
      "Yesterday",
    );
    expect(formatSenecaConversationWhen("2026-08-20T12:00:00.000Z", now)).toBe(
      "Aug 20",
    );
    expect(formatSenecaConversationWhen("not-a-date", now)).toBe("Recently");
  });

  test("formats updated and expiry labels with invalid-date fallbacks", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");

    expect(formatSenecaUpdatedAt("2026-08-25T11:45:00.000Z", now)).toBe(
      "15m ago",
    );
    expect(formatSenecaUpdatedAt("not-a-date", now)).toBe("Recently");
    expect(formatSenecaExpiry("not-a-date")).toBe(
      "Retained for a limited time",
    );
    expect(formatSenecaExpiry("2026-09-24T12:00:00.000Z")).toContain(
      "Available until",
    );
  });

  test("presents at most the newest three conversations without mutating input", () => {
    const summaries = [
      ["older", "2026-08-22T12:00:00.000Z"],
      ["newest", "2026-08-25T12:00:00.000Z"],
      ["middle", "2026-08-24T12:00:00.000Z"],
      ["oldest", "2026-08-20T12:00:00.000Z"],
    ].map(
      ([id, updatedAt]): SenecaConversationSummary => ({
        id: id ?? "",
        contextType: "personal",
        capabilityMode: null,
        teamId: null,
        title: id ?? "",
        preview: `${id} preview`,
        createdAt: updatedAt ?? "",
        updatedAt: updatedAt ?? "",
        expiresAt: "2026-09-01T12:00:00.000Z",
      }),
    );

    expect(recentSenecaConversations(summaries).map(({ id }) => id)).toEqual([
      "newest",
      "middle",
      "older",
    ]);
    expect(summaries.map(({ id }) => id)).toEqual([
      "older",
      "newest",
      "middle",
      "oldest",
    ]);
  });
});
