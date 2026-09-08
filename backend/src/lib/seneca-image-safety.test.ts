import { beforeAll, describe, expect, test } from "bun:test";
import {
  SENECA_SAFETY_BLOCK_MESSAGE,
  buildSenecaModerationPayload,
  moderateSenecaImage,
  moderateSenecaOutputImage,
  parseSenecaModerationResponse,
  safetyCodeForBlockedCategories,
} from "./seneca-image-safety";

const USER_ID = "safety-user";
const BUCKET = "alenio-safety-test.appspot.com";
const OWN_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
  `users/${USER_ID}/uploads/123-source.png`,
)}?alt=media&token=secret`;

beforeAll(() => {
  process.env.FIREBASE_STORAGE_BUCKET = BUCKET;
});

function moderationResponse(params: {
  flagged: boolean;
  categories?: Record<string, boolean>;
}): Response {
  return new Response(
    JSON.stringify({
      results: [
        {
          flagged: params.flagged,
          categories: params.categories ?? {
            sexual: false,
            "sexual/minors": false,
            violence: false,
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("Seneca image safety parsing and payloads", () => {
  test("builds text-only and multimodal Moderations API payloads", () => {
    expect(buildSenecaModerationPayload({ text: "draw a team meeting" })).toEqual({
      model: "omni-moderation-latest",
      input: [{ type: "text", text: "draw a team meeting" }],
    });
    expect(
      buildSenecaModerationPayload({
        text: "summarize",
        imageDataUrl: "data:image/png;base64,aW1hZ2U=",
      }),
    ).toEqual({
      model: "omni-moderation-latest",
      input: [
        { type: "text", text: "summarize" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,aW1hZ2U=" },
        },
      ],
    });
  });

  test("strictly parses moderation results and category booleans", () => {
    expect(
      parseSenecaModerationResponse({
        results: [
          {
            flagged: true,
            categories: { violence: true, sexual: false },
            category_scores: { violence: 0.99 },
          },
        ],
      }),
    ).toEqual({ flagged: true, blockedCategoryKeys: ["violence"] });
    expect(parseSenecaModerationResponse({ results: [] })).toBeNull();
    expect(
      parseSenecaModerationResponse({
        results: [{ flagged: "yes", categories: {} }],
      }),
    ).toBeNull();
    expect(
      parseSenecaModerationResponse({
        results: [{ flagged: false, categories: { violence: 0 } }],
      }),
    ).toBeNull();
  });

  test("maps explicit sexual and minors categories to stable codes", () => {
    expect(safetyCodeForBlockedCategories(["sexual"])).toBe(
      "SENECA_IMAGE_SAFETY_EXPLICIT",
    );
    expect(safetyCodeForBlockedCategories(["sexual", "sexual/minors"])).toBe(
      "SENECA_IMAGE_SAFETY_SEXUAL_MINORS",
    );
    expect(safetyCodeForBlockedCategories(["violence"])).toBe(
      "SENECA_IMAGE_SAFETY_BLOCKED",
    );
  });
});

describe("Seneca image safety integration boundaries", () => {
  test("deletes an owned generic source only after confirmed rejection", async () => {
    const deleted: string[] = [];
    const audits: unknown[] = [];
    await expect(
      moderateSenecaImage(
        {
          userId: USER_ID,
          operation: "image_edit_input",
          text: "unsafe edit",
          imageDataUrl: "data:image/png;base64,aW1hZ2U=",
          ownedGenericAttachmentUrl: OWN_URL,
        },
        {
          fetchImpl: async () =>
            moderationResponse({
              flagged: true,
              categories: { sexual: true, "sexual/minors": false },
            }),
          deleteOwnedUpload: async (url) => {
            if (url) deleted.push(url);
          },
          audit: (entry) => audits.push(entry),
        },
      ),
    ).rejects.toMatchObject({
      message: SENECA_SAFETY_BLOCK_MESSAGE,
      code: "SENECA_IMAGE_SAFETY_EXPLICIT",
      status: 400,
      confirmedRejection: true,
    });
    expect(deleted).toEqual([OWN_URL]);
    expect(audits).toEqual([
      expect.objectContaining({
        event: "seneca_image_safety_blocked",
        userId: USER_ID,
        operation: "image_edit_input",
        blockedCategoryKeys: ["sexual"],
      }),
    ]);
    expect(JSON.stringify(audits)).not.toContain("unsafe edit");
    expect(JSON.stringify(audits)).not.toContain(OWN_URL);
  });

  test("fails closed without deleting source on provider or response errors", async () => {
    let deletes = 0;
    const deleteOwnedUpload = async () => {
      deletes += 1;
    };
    for (const fetchImpl of [
      async () => {
        throw new Error("network down");
      },
      async () => new Response("bad gateway", { status: 502 }),
      async () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
    ]) {
      await expect(
        moderateSenecaImage(
          {
            userId: USER_ID,
            operation: "vision_ask_input",
            text: "question",
            imageDataUrl: "data:image/png;base64,aW1hZ2U=",
            ownedGenericAttachmentUrl: OWN_URL,
          },
          { fetchImpl, deleteOwnedUpload },
        ),
      ).rejects.toMatchObject({
        code: "SENECA_IMAGE_SAFETY_UNAVAILABLE",
        status: 503,
        confirmedRejection: false,
      });
    }
    expect(deletes).toBe(0);
  });

  test("moderates output bytes as an image before upload boundaries", async () => {
    let requestBody: unknown;
    await moderateSenecaOutputImage(
      {
        userId: USER_ID,
        operation: "image_generation_output",
        bytes: Buffer.from("generated-image"),
      },
      {
        fetchImpl: async (_url, init) => {
          requestBody = JSON.parse(String(init?.body));
          return moderationResponse({ flagged: false });
        },
      },
    );
    expect(requestBody).toEqual({
      model: "omni-moderation-latest",
      input: [
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${Buffer.from("generated-image").toString("base64")}`,
          },
        },
      ],
    });
  });
});
