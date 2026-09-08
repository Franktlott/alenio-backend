import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  collectUrls,
  isSenecaStoredImageGenerationSource,
} from "./seneca-conversation-cleanup";
import {
  SENECA_CONVERSATION_RETENTION_MS,
  contextForConversation,
  loadSenecaConversationHistory,
  senecaConversationExpiresAt,
  senecaConversationPreview,
  senecaConversationTitle,
} from "./seneca-conversations";

describe("Seneca conversation retention helpers", () => {
  test("expires exactly seven days after successful activity", () => {
    const now = new Date("2026-08-25T12:34:56.789Z");
    expect(senecaConversationExpiresAt(now).getTime() - now.getTime()).toBe(
      SENECA_CONVERSATION_RETENTION_MS,
    );
  });

  test("builds bounded title and preview text", () => {
    expect(senecaConversationTitle("  Help   me prepare  ")).toBe(
      "Help me prepare",
    );
    expect(senecaConversationTitle("x".repeat(100)).length).toBeLessThanOrEqual(80);
    expect(senecaConversationPreview("x".repeat(200)).length).toBeLessThanOrEqual(
      160,
    );
  });

  test("uses canonical stored messages for an existing conversation", async () => {
    let receivedQuery: unknown;
    const db = {
      senecaConversation: {
        findFirst: async (query: unknown) => {
          receivedQuery = query;
          return {
            messages: [
              { role: "assistant", text: "Most recent answer" },
              { role: "user", text: "Follow-up question" },
              { role: "assistant", text: "Earlier answer" },
            ],
          };
        },
      },
    } as unknown as PrismaClient;

    const messages = await loadSenecaConversationHistory(
      "conversation-1",
      {
        userId: "user-1",
        context: { type: "workspace", workspaceId: "team-1" },
        capabilityMode: "member",
      },
      [{ role: "user", content: "Untrusted client history" }],
      db,
    );

    expect(receivedQuery).toMatchObject({
      where: {
        id: "conversation-1",
        userId: "user-1",
        contextType: "workspace",
        teamId: "team-1",
        capabilityMode: "member",
      },
      select: {
        messages: {
          orderBy: { order: "desc" },
          take: 12,
        },
      },
    });
    expect(messages).toEqual([
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Follow-up question" },
      { role: "assistant", content: "Most recent answer" },
    ]);
  });

  test("uses client history only before a conversation has been saved", async () => {
    const clientMessages = [
      { role: "assistant" as const, content: "Previous answer" },
    ];
    const messages = await loadSenecaConversationHistory(
      undefined,
      {
        userId: "user-1",
        context: { type: "personal" },
        capabilityMode: "personal",
      },
      clientMessages,
      {} as PrismaClient,
    );
    expect(messages).toBe(clientMessages);
  });

  test("rejects malformed persisted contexts", () => {
    expect(
      contextForConversation({ contextType: "personal", teamId: "team-1" }),
    ).toBeNull();
    expect(
      contextForConversation({ contextType: "workspace", teamId: null }),
    ).toBeNull();
    expect(
      contextForConversation({ contextType: "workspace", teamId: "team-1" }),
    ).toEqual({ type: "workspace", workspaceId: "team-1" });
  });

  test("collects nested image URLs without duplicates", () => {
    expect(
      [...collectUrls({
        image: { url: "https://example.test/image.png" },
        repeated: ["https://example.test/image.png"],
        attachment: {
          url: "https://example.test/users/user-1/uploads/document.pdf",
        },
        ignored: "plain text",
      })],
    ).toEqual([
      "https://example.test/image.png",
      "https://example.test/users/user-1/uploads/document.pdf",
    ]);
  });

  test("cleans up generated and edited image generations", () => {
    expect(isSenecaStoredImageGenerationSource("image")).toBe(true);
    expect(isSenecaStoredImageGenerationSource("image_edit")).toBe(true);
    expect(isSenecaStoredImageGenerationSource("ask")).toBe(false);
  });
});
