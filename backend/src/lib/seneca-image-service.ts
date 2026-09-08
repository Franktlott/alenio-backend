import type { PrismaClient } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";
import type { SenecaGeneratedImage } from "../types";
import {
  isFirebaseStorageConfigured,
  uploadFileToFirebaseStorage,
} from "./firebase-storage";
import type { PreparedSenecaAttachment } from "./seneca-attachments";
import {
  moderateSenecaImage,
  moderateSenecaOutputImage,
} from "./seneca-image-safety";
import { senecaAvailable, senecaOpenAiKey } from "./seneca-openai";

export const SENECA_IMAGE_SIZES = [
  "1024x1024",
  "1536x1024",
  "1024x1536",
] as const;

export type SenecaImageSize = (typeof SENECA_IMAGE_SIZES)[number];

type GenerateParams = {
  userId: string;
  ownerType: "PERSONAL" | "WORKSPACE";
  ownerId: string;
  prompt: string;
  size?: SenecaImageSize;
};

type EditParams = Omit<GenerateParams, "size"> & {
  attachment: PreparedSenecaAttachment;
};

export type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
};

export class SenecaImageError extends Error {
  constructor(
    message: string,
    readonly code:
      | "IMAGE_UNAVAILABLE"
      | "STORAGE_NOT_CONFIGURED"
      | "IMAGE_QUOTA_REACHED"
      | "IMAGE_RATE_LIMITED"
      | "IMAGE_REJECTED"
      | "IMAGE_SOURCE_INVALID"
      | "IMAGE_PROVIDER_ERROR",
    readonly status: 400 | 429 | 502 | 503,
  ) {
    super(message);
    this.name = "SenecaImageError";
  }
}

export function utcDayStart(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export const SENECA_IMAGE_LIMITS = {
  personal: 3,
  pro: 10,
  operations: 20,
} as const;

export const SENECA_IMAGE_WINDOW_HOURS = 24;
export const SENECA_IMAGE_BURST_SECONDS = 15;

type ImageSubscription = {
  plan: string;
  status: string;
};

type SenecaImageQuota = {
  limit: number;
  remaining: number;
  windowHours: number;
};

export function rollingImageWindowStart(
  now = new Date(),
  hours = SENECA_IMAGE_WINDOW_HOURS,
): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

export function senecaImageLimitForSubscriptions(
  subscriptions: ImageSubscription[],
): number {
  let limit: number = SENECA_IMAGE_LIMITS.personal;
  for (const subscription of subscriptions) {
    if (!["active", "trialing"].includes(subscription.status.toLowerCase())) {
      continue;
    }
    const plan = subscription.plan.toLowerCase();
    if (plan === "operations") return SENECA_IMAGE_LIMITS.operations;
    if (plan === "team" || plan === "pro") {
      limit = Math.max(limit, SENECA_IMAGE_LIMITS.pro);
    }
  }
  return limit;
}

export function dimensionsForImageSize(size: SenecaImageSize): {
  width: number;
  height: number;
} {
  const [width, height] = size.split("x");
  return {
    width: Number(width ?? "1024"),
    height: Number(height ?? "1024"),
  };
}

export function hasReachedSenecaImageQuota(
  used: number,
  limit: number,
): boolean {
  return used >= limit;
}

export function senecaImageDailyLimit(raw = env.SENECA_IMAGE_DAILY_LIMIT): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.min(parsed, 100)
    : 5;
}

export function extractOpenAiImage(
  value: OpenAiImageResponse,
): { base64: string; revisedPrompt: string | null } | null {
  const first = value.data?.[0];
  if (!first?.b64_json?.trim()) return null;
  return {
    base64: first.b64_json,
    revisedPrompt: first.revised_prompt?.trim() || null,
  };
}

export function extractPngDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 24 ||
    signature.some((value, index) => bytes[index] !== value) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR"
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

export function mapOpenAiImageProviderError(
  status: number,
  detail: string,
): Pick<SenecaImageError, "message" | "code" | "status"> {
  const rejected =
    status === 400 && /moderation|safety|policy|content/i.test(detail);
  return rejected
    ? {
        message:
          "That image request could not be generated. Try a different description.",
        code: "IMAGE_REJECTED",
        status: 400,
      }
    : {
        message: "Seneca could not generate that image right now.",
        code: "IMAGE_PROVIDER_ERROR",
        status: 502,
      };
}

export function buildOpenAiImageEditFormData(params: {
  prompt: string;
  sourceBytes: Buffer;
  sourceMimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceFileName: string;
  model?: string;
}): FormData {
  const form = new FormData();
  form.append("model", params.model ?? env.OPENAI_IMAGE_MODEL);
  form.append(
    "image",
    new File([params.sourceBytes], params.sourceFileName, {
      type: params.sourceMimeType,
    }),
  );
  form.append("prompt", params.prompt);
  form.append("n", "1");
  form.append("size", "auto");
  form.append("quality", "low");
  form.append("output_format", "png");
  form.append("background", "auto");
  form.append("moderation", "auto");
  return form;
}

async function providerErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null;
  return [body?.error?.code, body?.error?.message].filter(Boolean).join(" ");
}

async function imageSubscriptionsForQuota(
  params: Pick<GenerateParams, "userId" | "ownerType" | "ownerId">,
  db: PrismaClient,
): Promise<ImageSubscription[]> {
  if (params.ownerType === "WORKSPACE") {
    const subscription = await db.teamSubscription.findUnique({
      where: { teamId: params.ownerId },
      select: { plan: true, status: true },
    });
    return subscription ? [subscription] : [];
  }
  return db.teamSubscription.findMany({
    where: {
      team: {
        members: {
          some: { userId: params.userId },
        },
      },
    },
    select: { plan: true, status: true },
  });
}

async function assertSenecaImageQuota(
  params: Pick<GenerateParams, "userId" | "ownerType" | "ownerId">,
  db: PrismaClient,
  now = new Date(),
): Promise<SenecaImageQuota> {
  const subscriptions = await imageSubscriptionsForQuota(params, db);
  const limit = senecaImageLimitForSubscriptions(subscriptions);
  const commonWhere = {
    userId: params.userId,
    source: { in: ["image", "image_edit"] as string[] },
  };
  const [usedInWindow, recentGeneration] = await Promise.all([
    db.senecaGeneration.count({
      where: {
        ...commonWhere,
        createdAt: { gte: rollingImageWindowStart(now) },
      },
    }),
    db.senecaGeneration.findFirst({
      where: {
        ...commonWhere,
        createdAt: {
          gte: new Date(now.getTime() - SENECA_IMAGE_BURST_SECONDS * 1000),
        },
      },
      select: { id: true },
    }),
  ]);
  if (recentGeneration) {
    throw new SenecaImageError(
      `Please wait ${SENECA_IMAGE_BURST_SECONDS} seconds before creating another image.`,
      "IMAGE_RATE_LIMITED",
      429,
    );
  }
  if (hasReachedSenecaImageQuota(usedInWindow, limit)) {
    throw new SenecaImageError(
      `You have reached your limit of ${limit} images in 24 hours.`,
      "IMAGE_QUOTA_REACHED",
      429,
    );
  }
  return {
    limit,
    remaining: Math.max(0, limit - usedInWindow - 1),
    windowHours: SENECA_IMAGE_WINDOW_HOURS,
  };
}

export async function generateSenecaImage(
  params: GenerateParams,
  db: PrismaClient = prisma,
): Promise<SenecaGeneratedImage> {
  if (!senecaAvailable()) {
    throw new SenecaImageError(
      "Image generation is not configured on this server.",
      "IMAGE_UNAVAILABLE",
      503,
    );
  }
  if (!isFirebaseStorageConfigured()) {
    throw new SenecaImageError(
      "Image storage is not configured.",
      "STORAGE_NOT_CONFIGURED",
      503,
    );
  }

  const quota = await assertSenecaImageQuota(params, db);
  await moderateSenecaImage({
    userId: params.userId,
    operation: "image_generation_prompt",
    text: params.prompt,
  });

  const size = params.size ?? "1024x1024";
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${senecaOpenAiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: params.prompt,
      n: 1,
      size,
      quality: "low",
      output_format: "png",
      background: "auto",
      moderation: "auto",
    }),
  });

  if (!response.ok) {
    const detail = await providerErrorMessage(response);
    const mapped = mapOpenAiImageProviderError(response.status, detail);
    throw new SenecaImageError(mapped.message, mapped.code, mapped.status);
  }

  const provider = (await response.json()) as OpenAiImageResponse;
  const generated = extractOpenAiImage(provider);
  if (!generated) {
    throw new SenecaImageError(
      "Seneca returned an empty image.",
      "IMAGE_PROVIDER_ERROR",
      502,
    );
  }

  const bytes = Buffer.from(generated.base64, "base64");
  await moderateSenecaOutputImage({
    userId: params.userId,
    operation: "image_generation_output",
    bytes,
  });
  const file = new File([bytes], `seneca-${Date.now()}.png`, {
    type: "image/png",
  });
  const uploaded = await uploadFileToFirebaseStorage({
    userId: params.userId,
    file,
    slot: "seneca_image",
  });
  const generation = await db.senecaGeneration.create({
    data: {
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      userId: params.userId,
      source: "image",
      model: env.OPENAI_IMAGE_MODEL,
      question: params.prompt,
      response: uploaded.url,
      contextUsed: JSON.stringify({
        size,
        revisedPrompt: generated.revisedPrompt,
      }),
      latencyMs: Date.now() - started,
    },
    select: { id: true },
  });
  const dimensions = dimensionsForImageSize(size);

  return {
    generationId: generation.id,
    url: uploaded.url,
    prompt: params.prompt,
    revisedPrompt: generated.revisedPrompt,
    width: dimensions.width,
    height: dimensions.height,
    mimeType: "image/png",
    quota,
  };
}

export async function editSenecaImage(
  params: EditParams,
  db: PrismaClient = prisma,
): Promise<SenecaGeneratedImage> {
  if (!senecaAvailable()) {
    throw new SenecaImageError(
      "Image editing is not configured on this server.",
      "IMAGE_UNAVAILABLE",
      503,
    );
  }
  if (!isFirebaseStorageConfigured()) {
    throw new SenecaImageError(
      "Image storage is not configured.",
      "STORAGE_NOT_CONFIGURED",
      503,
    );
  }
  const sourceMimeType = params.attachment.metadata.mimeType;
  if (
    sourceMimeType === "application/pdf" ||
    !params.attachment.sourceBytes?.length
  ) {
    throw new SenecaImageError(
      "A valid JPEG, PNG, or WebP source image is required.",
      "IMAGE_SOURCE_INVALID",
      400,
    );
  }

  const quota = await assertSenecaImageQuota(params, db);
  await moderateSenecaImage({
    userId: params.userId,
    operation: "image_edit_input",
    text: params.prompt,
    imageDataUrl:
      params.attachment.imageDataUrl ??
      `data:${sourceMimeType};base64,${params.attachment.sourceBytes.toString("base64")}`,
    ownedGenericAttachmentUrl: params.attachment.metadata.url,
  });
  const started = Date.now();
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${senecaOpenAiKey()}` },
    body: buildOpenAiImageEditFormData({
      prompt: params.prompt,
      sourceBytes: params.attachment.sourceBytes,
      sourceMimeType,
      sourceFileName: params.attachment.metadata.fileName,
    }),
  });
  if (!response.ok) {
    const detail = await providerErrorMessage(response);
    const mapped = mapOpenAiImageProviderError(response.status, detail);
    throw new SenecaImageError(mapped.message, mapped.code, mapped.status);
  }

  const provider = (await response.json()) as OpenAiImageResponse;
  const edited = extractOpenAiImage(provider);
  if (!edited) {
    throw new SenecaImageError(
      "Seneca returned an empty edited image.",
      "IMAGE_PROVIDER_ERROR",
      502,
    );
  }
  const bytes = Buffer.from(edited.base64, "base64");
  const dimensions = extractPngDimensions(bytes);
  if (!dimensions) {
    throw new SenecaImageError(
      "Seneca returned an invalid edited image.",
      "IMAGE_PROVIDER_ERROR",
      502,
    );
  }
  await moderateSenecaOutputImage({
    userId: params.userId,
    operation: "image_edit_output",
    bytes,
  });
  const file = new File([bytes], `seneca-edit-${Date.now()}.png`, {
    type: "image/png",
  });
  const uploaded = await uploadFileToFirebaseStorage({
    userId: params.userId,
    file,
    slot: "seneca_image",
  });
  const generation = await db.senecaGeneration.create({
    data: {
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      userId: params.userId,
      source: "image_edit",
      model: env.OPENAI_IMAGE_MODEL,
      question: params.prompt,
      response: uploaded.url,
      contextUsed: JSON.stringify({
        operation: "image_edit",
        sourceAttachment: params.attachment.metadata,
        size: "auto",
        revisedPrompt: edited.revisedPrompt,
      }),
      latencyMs: Date.now() - started,
    },
    select: { id: true },
  });

  return {
    generationId: generation.id,
    url: uploaded.url,
    prompt: params.prompt,
    revisedPrompt: edited.revisedPrompt,
    width: dimensions.width,
    height: dimensions.height,
    mimeType: "image/png",
    quota,
  };
}
