import { describe, expect, test } from "bun:test";
import type { Conversation } from "./types";
import {
  buildSenecaImageMessagePayload,
  filterSenecaConversations,
  normalizeSenecaImageCaption,
  sendSenecaImageWithDurableRetry,
  senecaConversationLabel,
  SenecaImageSendError,
} from "./seneca-image-chat-helpers";

function conversation(
  id: string,
  overrides: Partial<Conversation> = {},
): Conversation {
  return {
    id,
    isGroup: false,
    type: "DIRECT",
    createdAt: "2026-08-25T12:00:00.000Z",
    updatedAt: "2026-08-25T12:00:00.000Z",
    recipient: {
      id: `recipient-${id}`,
      name: id,
      email: `${id}@example.com`,
      image: null,
    },
    lastMessage: null,
    ...overrides,
  };
}

describe("Seneca image conversation helpers", () => {
  test("labels direct and named or unnamed group conversations", () => {
    expect(senecaConversationLabel(conversation("Ava"), "me")).toBe("Ava");
    expect(
      senecaConversationLabel(
        conversation("group", { isGroup: true, type: "GROUP", name: "Launch crew" }),
        "me",
      ),
    ).toBe("Launch crew");
    expect(
      senecaConversationLabel(
        conversation("unnamed", {
          isGroup: true,
          type: "GROUP",
          name: " ",
          participants: [
            { id: "me", name: "Me", email: null, image: null, role: "member" },
            { id: "1", name: "Mina", email: null, image: null, role: "member" },
            { id: "2", name: "Theo", email: null, image: null, role: "member" },
          ],
        }),
        "me",
      ),
    ).toBe("Mina, Theo");
  });

  test("filters by conversation label and participant details without reordering", () => {
    const conversations = [
      conversation("Ava"),
      conversation("launch", {
        isGroup: true,
        type: "GROUP",
        name: "Launch crew",
        participants: [
          { id: "1", name: "Jordan Lee", email: "jordan@example.com", image: null, role: "member" },
        ],
      }),
      conversation("Morgan"),
    ];

    expect(filterSenecaConversations(conversations, "launch", "me").map((item) => item.id)).toEqual([
      "launch",
    ]);
    expect(filterSenecaConversations(conversations, "jordan", "me").map((item) => item.id)).toEqual([
      "launch",
    ]);
    expect(filterSenecaConversations(conversations, "", "me").map((item) => item.id)).toEqual([
      "Ava",
      "launch",
      "Morgan",
    ]);
  });
});

describe("Seneca image message payload", () => {
  test("normalizes optional captions", () => {
    expect(normalizeSenecaImageCaption("  Team update  ")).toBe("Team update");
    expect(normalizeSenecaImageCaption("   ")).toBeUndefined();
  });

  test("uses only the durable media URL in the chat message", () => {
    expect(
      buildSenecaImageMessagePayload("https://media.alenio.example/durable/image.png", "  Ready  "),
    ).toEqual({
      content: "Ready",
      mediaUrl: "https://media.alenio.example/durable/image.png",
      mediaType: "image",
    });
    expect(
      buildSenecaImageMessagePayload("https://media.alenio.example/durable/image.png", ""),
    ).toEqual({
      mediaUrl: "https://media.alenio.example/durable/image.png",
      mediaType: "image",
    });
  });

  test("reuses the durable copy when message delivery is retried", async () => {
    const media = {
      url: "https://media.alenio.example/durable/image.png",
      contentType: "image/png",
      sizeBytes: 2048,
      filename: "seneca.png",
    };
    let copyCalls = 0;
    let durableForRetry = null as typeof media | null;

    await expect(
      sendSenecaImageWithDurableRetry(
        {
          generationId: "generation-1",
          conversationId: "conversation-1",
          caption: "Great work",
          onDurableMedia: (value) => {
            durableForRetry = value;
          },
        },
        {
          copyMedia: async () => {
            copyCalls += 1;
            return media;
          },
          sendMessage: async () => {
            throw new Error("offline");
          },
        },
      ),
    ).rejects.toBeInstanceOf(SenecaImageSendError);

    const result = await sendSenecaImageWithDurableRetry(
      {
        generationId: "generation-1",
        conversationId: "conversation-1",
        caption: "Great work",
        durableMedia: durableForRetry,
      },
      {
        copyMedia: async () => {
          copyCalls += 1;
          return media;
        },
        sendMessage: async (_conversationId, payload) => payload,
      },
    );

    expect(copyCalls).toBe(1);
    expect(result.message).toEqual({
      content: "Great work",
      mediaUrl: media.url,
      mediaType: "image",
    });
  });
});
