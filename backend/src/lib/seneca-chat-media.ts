import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import {
  copyOwnedStorageObjectToUserUploads,
  parseOwnedStorageObjectFromUrl,
  StorageCopyError,
  type CopiedUserUploadResult,
} from "./firebase-storage";

export type SenecaChatMedia = Pick<
  CopiedUserUploadResult,
  "url" | "contentType" | "sizeBytes" | "filename"
>;

export class SenecaChatMediaError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SENECA_GENERATION_NOT_FOUND"
      | "SENECA_GENERATION_FORBIDDEN"
      | "SENECA_GENERATION_SOURCE_INVALID"
      | "SENECA_IMAGE_EXPIRED"
      | "SENECA_IMAGE_URL_INVALID"
      | "SENECA_IMAGE_NOT_FOUND"
      | "SENECA_IMAGE_NOT_IMAGE"
      | "SENECA_IMAGE_SIZE_INVALID"
      | "STORAGE_NOT_CONFIGURED"
      | "SENECA_IMAGE_COPY_FAILED",
    readonly status: 400 | 403 | 404 | 410 | 500 | 503,
  ) {
    super(message);
    this.name = "SenecaChatMediaError";
  }
}

export function isOwnedSenecaImageObjectPath(
  objectPath: string,
  userId: string,
): boolean {
  return objectPath.startsWith(`users/${userId}/seneca-images/`);
}

export function isOwnedDurableChatObjectPath(
  objectPath: string,
  userId: string,
): boolean {
  return objectPath.startsWith(`users/${userId}/uploads/`);
}

type CopyImage = typeof copyOwnedStorageObjectToUserUploads;

export async function copySenecaGenerationToChatMedia(
  params: {
    generationId: string;
    userId: string;
    now?: Date;
  },
  db: PrismaClient = prisma,
  copyImage: CopyImage = copyOwnedStorageObjectToUserUploads,
): Promise<SenecaChatMedia> {
  const generation = await db.senecaGeneration.findUnique({
    where: { id: params.generationId },
    select: {
      id: true,
      userId: true,
      source: true,
      response: true,
      conversation: { select: { expiresAt: true } },
    },
  });
  if (!generation) {
    throw new SenecaChatMediaError(
      "Seneca image generation was not found.",
      "SENECA_GENERATION_NOT_FOUND",
      404,
    );
  }
  if (generation.userId !== params.userId) {
    throw new SenecaChatMediaError(
      "This Seneca image belongs to another user.",
      "SENECA_GENERATION_FORBIDDEN",
      403,
    );
  }
  if (generation.source !== "image" && generation.source !== "image_edit") {
    throw new SenecaChatMediaError(
      "The selected generation is not a Seneca image.",
      "SENECA_GENERATION_SOURCE_INVALID",
      400,
    );
  }
  if (
    generation.conversation?.expiresAt &&
    generation.conversation.expiresAt.getTime() <= (params.now ?? new Date()).getTime()
  ) {
    throw new SenecaChatMediaError(
      "This Seneca image has expired.",
      "SENECA_IMAGE_EXPIRED",
      410,
    );
  }
  const sourceUrl = generation.response?.trim();
  const parsedSource = sourceUrl
    ? parseOwnedStorageObjectFromUrl(sourceUrl)
    : null;
  if (
    !sourceUrl ||
    !parsedSource ||
    !isOwnedSenecaImageObjectPath(parsedSource.objectPath, params.userId)
  ) {
    throw new SenecaChatMediaError(
      "Seneca image source is not a valid owned Firebase image.",
      "SENECA_IMAGE_URL_INVALID",
      400,
    );
  }

  try {
    const copied = await copyImage({
      sourceUrl,
      userId: params.userId,
    });
    const parsedCopy = parseOwnedStorageObjectFromUrl(copied.url);
    if (
      !parsedCopy ||
      !isOwnedDurableChatObjectPath(parsedCopy.objectPath, params.userId) ||
      copied.storagePath !== parsedCopy.objectPath
    ) {
      throw new SenecaChatMediaError(
        "Copied chat image did not use durable Firebase storage.",
        "SENECA_IMAGE_COPY_FAILED",
        500,
      );
    }
    return {
      url: copied.url,
      contentType: copied.contentType,
      sizeBytes: copied.sizeBytes,
      filename: copied.filename,
    };
  } catch (error) {
    if (error instanceof SenecaChatMediaError) throw error;
    if (error instanceof StorageCopyError) {
      const mapped = {
        STORAGE_NOT_CONFIGURED: {
          code: "STORAGE_NOT_CONFIGURED",
          status: 503,
          message: "Image storage is not configured.",
        },
        SOURCE_URL_INVALID: {
          code: "SENECA_IMAGE_URL_INVALID",
          status: 400,
          message: "Seneca image source is invalid.",
        },
        SOURCE_NOT_FOUND: {
          code: "SENECA_IMAGE_NOT_FOUND",
          status: 404,
          message: "Seneca image source no longer exists.",
        },
        SOURCE_NOT_IMAGE: {
          code: "SENECA_IMAGE_NOT_IMAGE",
          status: 400,
          message: "Seneca image source is not an image.",
        },
        SOURCE_SIZE_INVALID: {
          code: "SENECA_IMAGE_SIZE_INVALID",
          status: 400,
          message: "Seneca image source has an invalid size.",
        },
        COPY_FAILED: {
          code: "SENECA_IMAGE_COPY_FAILED",
          status: 500,
          message: "Seneca image could not be copied into chat storage.",
        },
      } as const;
      const detail = mapped[error.code];
      throw new SenecaChatMediaError(detail.message, detail.code, detail.status);
    }
    throw new SenecaChatMediaError(
      "Seneca image could not be copied into chat storage.",
      "SENECA_IMAGE_COPY_FAILED",
      500,
    );
  }
}
