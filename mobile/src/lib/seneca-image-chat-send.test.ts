import { describe, expect, test } from "bun:test";
import {
  SenecaImageSendError,
  sendSenecaImageWithDurableRetry,
  type DurableSenecaImageMedia,
} from "./seneca-image-chat-helpers";

const durableMedia: DurableSenecaImageMedia = {
  url: "https://media.alenio.example/images/generated.png",
  contentType: "image/png",
  sizeBytes: 2048,
  filename: "generated.png",
};

describe("Seneca durable image send", () => {
  test("identifies durable-copy failures before attempting delivery", async () => {
    let deliveryCalls = 0;
    try {
      await sendSenecaImageWithDurableRetry(
        {
          generationId: "expired-generation",
          conversationId: "conversation-1",
          caption: "",
        },
        {
          copyMedia: async () => {
            throw new Error("Generation expired");
          },
          sendMessage: async () => {
            deliveryCalls += 1;
          },
        },
      );
      throw new Error("Expected image copy to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SenecaImageSendError);
      expect((error as SenecaImageSendError).stage).toBe("copy");
    }
    expect(deliveryCalls).toBe(0);
  });

  test("retains the durable copy when message delivery fails", async () => {
    let retained: DurableSenecaImageMedia | null = null;
    let copyCalls = 0;

    await expect(
      sendSenecaImageWithDurableRetry(
        {
          generationId: "generation-1",
          conversationId: "conversation-1",
          caption: "Ready",
          onDurableMedia: (media) => {
            retained = media;
          },
        },
        {
          copyMedia: async () => {
            copyCalls += 1;
            return durableMedia;
          },
          sendMessage: async () => {
            throw new Error("Message delivery failed");
          },
        },
      ),
    ).rejects.toThrow("Message delivery failed");

    expect(copyCalls).toBe(1);
    expect(retained).toEqual(durableMedia);
  });

  test("reuses retained media on retry instead of creating another copy", async () => {
    let copyCalls = 0;
    const result = await sendSenecaImageWithDurableRetry(
      {
        generationId: "generation-1",
        conversationId: "conversation-1",
        caption: "  Ready  ",
        durableMedia,
      },
      {
        copyMedia: async () => {
          copyCalls += 1;
          return durableMedia;
        },
        sendMessage: async (_conversationId, payload) => payload,
      },
    );

    expect(copyCalls).toBe(0);
    expect(result.message).toEqual({
      content: "Ready",
      mediaUrl: durableMedia.url,
      mediaType: "image",
    });
  });
});
