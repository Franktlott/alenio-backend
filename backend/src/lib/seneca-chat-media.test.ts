import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  buildCopiedUserUploadMetadata,
  buildUserUploadStoragePath,
  StorageCopyError,
} from "./firebase-storage";
import {
  copySenecaGenerationToChatMedia,
  isOwnedDurableChatObjectPath,
  isOwnedSenecaImageObjectPath,
  SenecaChatMediaError,
} from "./seneca-chat-media";
import { collectUrls } from "./seneca-conversation-cleanup";

const BUCKET = "alenio-test.appspot.com";
const USER_ID = "user-1";
const SOURCE_PATH = `users/${USER_ID}/seneca-images/123-seneca.png`;
const COPY_PATH = `users/${USER_ID}/uploads/456-copy-seneca.png`;

function storageUrl(path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=test`;
}

function dbWithGeneration(
  generation: {
    id: string;
    userId: string | null;
    source: string;
    response: string | null;
    conversation: { expiresAt: Date } | null;
  } | null,
): PrismaClient {
  return {
    senecaGeneration: {
      findUnique: async () => generation,
    },
  } as unknown as PrismaClient;
}

const previousBucket = process.env.FIREBASE_STORAGE_BUCKET;

beforeAll(() => {
  process.env.FIREBASE_STORAGE_BUCKET = BUCKET;
});

afterAll(() => {
  if (previousBucket === undefined) delete process.env.FIREBASE_STORAGE_BUCKET;
  else process.env.FIREBASE_STORAGE_BUCKET = previousBucket;
});

describe("Seneca chat media", () => {
  test("rejects other-user and non-image generations before storage copy", async () => {
    let copied = false;
    const copy = async () => {
      copied = true;
      throw new Error("should not copy");
    };

    await expect(
      copySenecaGenerationToChatMedia(
        { generationId: "gen-1", userId: USER_ID },
        dbWithGeneration({
          id: "gen-1",
          userId: "user-2",
          source: "image",
          response: storageUrl(`users/user-2/seneca-images/source.png`),
          conversation: null,
        }),
        copy,
      ),
    ).rejects.toMatchObject({ code: "SENECA_GENERATION_FORBIDDEN", status: 403 });

    await expect(
      copySenecaGenerationToChatMedia(
        { generationId: "gen-2", userId: USER_ID },
        dbWithGeneration({
          id: "gen-2",
          userId: USER_ID,
          source: "ask",
          response: storageUrl(SOURCE_PATH),
          conversation: null,
        }),
        copy,
      ),
    ).rejects.toMatchObject({
      code: "SENECA_GENERATION_SOURCE_INVALID",
      status: 400,
    });
    expect(copied).toBe(false);
  });

  test("rejects external, wrong-slot, and expired image sources", async () => {
    for (const [response, expectedCode] of [
      ["https://example.test/image.png", "SENECA_IMAGE_URL_INVALID"],
      [storageUrl(`users/${USER_ID}/uploads/not-a-generation.png`), "SENECA_IMAGE_URL_INVALID"],
    ] as const) {
      await expect(
        copySenecaGenerationToChatMedia(
          { generationId: "gen-1", userId: USER_ID },
          dbWithGeneration({
            id: "gen-1",
            userId: USER_ID,
            source: "image_edit",
            response,
            conversation: null,
          }),
        ),
      ).rejects.toMatchObject({ code: expectedCode });
    }

    await expect(
      copySenecaGenerationToChatMedia(
        {
          generationId: "gen-expired",
          userId: USER_ID,
          now: new Date("2026-08-26T00:00:00Z"),
        },
        dbWithGeneration({
          id: "gen-expired",
          userId: USER_ID,
          source: "image",
          response: storageUrl(SOURCE_PATH),
          conversation: { expiresAt: new Date("2026-08-25T23:59:59Z") },
        }),
      ),
    ).rejects.toMatchObject({ code: "SENECA_IMAGE_EXPIRED", status: 410 });
  });

  test("copies to the durable upload path and returns verified metadata", async () => {
    let copiedSource = "";
    const result = await copySenecaGenerationToChatMedia(
      {
        generationId: "gen-1",
        userId: USER_ID,
        now: new Date("2026-08-31T00:00:00Z"),
      },
      dbWithGeneration({
        id: "gen-1",
        userId: USER_ID,
        source: "image",
        response: storageUrl(SOURCE_PATH),
        conversation: { expiresAt: new Date("2026-09-01T00:00:00Z") },
      }),
      async ({ sourceUrl, userId }) => {
        copiedSource = sourceUrl;
        expect(userId).toBe(USER_ID);
        return {
          url: storageUrl(COPY_PATH),
          contentType: "image/png",
          sizeBytes: 2048,
          filename: "copy-seneca.png",
          storagePath: COPY_PATH,
        };
      },
    );

    expect(copiedSource).toBe(storageUrl(SOURCE_PATH));
    expect(result).toEqual({
      url: storageUrl(COPY_PATH),
      contentType: "image/png",
      sizeBytes: 2048,
      filename: "copy-seneca.png",
    });
  });

  test("maps a missing Firebase source to a typed not-found error", async () => {
    await expect(
      copySenecaGenerationToChatMedia(
        { generationId: "gen-1", userId: USER_ID },
        dbWithGeneration({
          id: "gen-1",
          userId: USER_ID,
          source: "image",
          response: storageUrl(SOURCE_PATH),
          conversation: null,
        }),
        async () => {
          throw new StorageCopyError("gone", "SOURCE_NOT_FOUND");
        },
      ),
    ).rejects.toEqual(
      new SenecaChatMediaError(
        "Seneca image source no longer exists.",
        "SENECA_IMAGE_NOT_FOUND",
        404,
      ),
    );
  });

  test("maps non-image and invalid-size source metadata to typed errors", async () => {
    const generation = dbWithGeneration({
      id: "gen-1",
      userId: USER_ID,
      source: "image",
      response: storageUrl(SOURCE_PATH),
      conversation: null,
    });
    for (const [storageCode, expectedCode] of [
      ["SOURCE_NOT_IMAGE", "SENECA_IMAGE_NOT_IMAGE"],
      ["SOURCE_SIZE_INVALID", "SENECA_IMAGE_SIZE_INVALID"],
    ] as const) {
      await expect(
        copySenecaGenerationToChatMedia(
          { generationId: "gen-1", userId: USER_ID },
          generation,
          async () => {
            throw new StorageCopyError("invalid metadata", storageCode);
          },
        ),
      ).rejects.toMatchObject({ code: expectedCode, status: 400 });
    }
  });

  test("builds copy path and metadata for orphan/reference cleanup", () => {
    expect(
      buildUserUploadStoragePath({
        userId: USER_ID,
        filename: "seneca image.png",
        nowMs: 456,
        objectId: "copy",
      }),
    ).toBe(`users/${USER_ID}/uploads/456-copy-seneca_image.png`);
    expect(
      buildCopiedUserUploadMetadata({
        contentType: "image/png",
        userId: USER_ID,
        filename: "seneca.png",
        sourcePath: SOURCE_PATH,
        downloadToken: "token",
        sourceMetadata: { generatedBy: "seneca" },
      }),
    ).toEqual({
      contentType: "image/png",
      metadata: {
        generatedBy: "seneca",
        firebaseStorageDownloadTokens: "token",
        uploadedByUserId: USER_ID,
        originalFilename: "seneca.png",
        copiedFromStoragePath: SOURCE_PATH,
      },
    });
  });

  test("keeps Seneca cleanup and durable chat objects lifecycle-separated", () => {
    const originalUrl = storageUrl(SOURCE_PATH);
    const copiedUrl = storageUrl(COPY_PATH);
    expect(isOwnedSenecaImageObjectPath(SOURCE_PATH, USER_ID)).toBe(true);
    expect(isOwnedDurableChatObjectPath(COPY_PATH, USER_ID)).toBe(true);
    expect(SOURCE_PATH).not.toBe(COPY_PATH);

    const generationCleanupUrls = collectUrls(originalUrl);
    expect(generationCleanupUrls.has(originalUrl)).toBe(true);
    expect(generationCleanupUrls.has(copiedUrl)).toBe(false);
  });
});
