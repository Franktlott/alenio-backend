import { deleteStorageObjectByUrlIfOwned } from "./firebase-storage";
import { resolveUserAttachmentObjectPath } from "./seneca-attachments";
import { senecaOpenAiKey } from "./seneca-openai";

export const SENECA_SAFETY_MODEL = "omni-moderation-latest";
export const SENECA_SAFETY_BLOCK_MESSAGE =
  "This image request can’t be processed because it doesn’t meet workplace safety standards.";
export const SENECA_SAFETY_UNAVAILABLE_MESSAGE =
  "Seneca can’t safely process images right now. Please try again later.";

export type SenecaSafetyOperation =
  | "image_generation_prompt"
  | "image_edit_input"
  | "vision_ask_input"
  | "image_generation_output"
  | "image_edit_output";

export type SenecaSafetyErrorCode =
  | "SENECA_IMAGE_SAFETY_BLOCKED"
  | "SENECA_IMAGE_SAFETY_EXPLICIT"
  | "SENECA_IMAGE_SAFETY_SEXUAL_MINORS"
  | "SENECA_IMAGE_SAFETY_UNAVAILABLE";

export class SenecaSafetyError extends Error {
  constructor(
    message: string,
    readonly code: SenecaSafetyErrorCode,
    readonly status: 400 | 503,
    readonly confirmedRejection: boolean,
  ) {
    super(message);
    this.name = "SenecaSafetyError";
  }
}

type ModerationInput =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type SenecaModerationPayload = {
  model: typeof SENECA_SAFETY_MODEL;
  input: ModerationInput[];
};

export type ParsedSenecaModeration = {
  flagged: boolean;
  blockedCategoryKeys: string[];
};

type ModerationFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;
type DeleteOwnedUpload = typeof deleteStorageObjectByUrlIfOwned;
type SafetyAudit = (entry: {
  event: "seneca_image_safety_blocked";
  userId: string;
  operation: SenecaSafetyOperation;
  blockedCategoryKeys: string[];
  timestamp: string;
}) => void;

type SafetyDependencies = {
  fetchImpl?: ModerationFetch;
  deleteOwnedUpload?: DeleteOwnedUpload;
  audit?: SafetyAudit;
};

export function buildSenecaModerationPayload(params: {
  text?: string;
  imageDataUrl?: string;
}): SenecaModerationPayload {
  const input: ModerationInput[] = [];
  if (params.text?.trim()) input.push({ type: "text", text: params.text });
  if (params.imageDataUrl?.trim()) {
    input.push({
      type: "image_url",
      image_url: { url: params.imageDataUrl },
    });
  }
  return { model: SENECA_SAFETY_MODEL, input };
}

export function parseSenecaModerationResponse(
  value: unknown,
): ParsedSenecaModeration | null {
  if (!value || typeof value !== "object") return null;
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length < 1) return null;
  const first = results[0];
  if (!first || typeof first !== "object") return null;
  const flagged = (first as { flagged?: unknown }).flagged;
  const categories = (first as { categories?: unknown }).categories;
  if (
    typeof flagged !== "boolean" ||
    !categories ||
    typeof categories !== "object" ||
    Array.isArray(categories)
  ) {
    return null;
  }
  const entries = Object.entries(categories);
  if (entries.some(([, blocked]) => typeof blocked !== "boolean")) return null;
  const blockedCategoryKeys = entries
    .filter(([, blocked]) => blocked)
    .map(([key]) => key)
    .sort();
  return { flagged, blockedCategoryKeys };
}

export function safetyCodeForBlockedCategories(
  keys: readonly string[],
): SenecaSafetyErrorCode {
  if (keys.includes("sexual/minors")) {
    return "SENECA_IMAGE_SAFETY_SEXUAL_MINORS";
  }
  if (keys.includes("sexual")) return "SENECA_IMAGE_SAFETY_EXPLICIT";
  return "SENECA_IMAGE_SAFETY_BLOCKED";
}

function unavailableError(): SenecaSafetyError {
  return new SenecaSafetyError(
    SENECA_SAFETY_UNAVAILABLE_MESSAGE,
    "SENECA_IMAGE_SAFETY_UNAVAILABLE",
    503,
    false,
  );
}

async function requestModeration(
  payload: SenecaModerationPayload,
  fetchImpl: ModerationFetch,
): Promise<ParsedSenecaModeration> {
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${senecaOpenAiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw unavailableError();
  }
  if (!response.ok) throw unavailableError();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw unavailableError();
  }
  const parsed = parseSenecaModerationResponse(body);
  if (!parsed) throw unavailableError();
  return parsed;
}

export async function moderateSenecaImage(params: {
  userId: string;
  operation: SenecaSafetyOperation;
  text?: string;
  imageDataUrl?: string;
  ownedGenericAttachmentUrl?: string;
}, dependencies: SafetyDependencies = {}): Promise<void> {
  const payload = buildSenecaModerationPayload(params);
  if (payload.input.length === 0) throw unavailableError();

  const result = await requestModeration(payload, dependencies.fetchImpl ?? fetch);
  if (!result.flagged) return;

  const blockedCategoryKeys =
    result.blockedCategoryKeys.length > 0
      ? result.blockedCategoryKeys
      : ["unknown"];
  (dependencies.audit ?? ((entry) => console.warn(entry)))({
    event: "seneca_image_safety_blocked",
    userId: params.userId,
    operation: params.operation,
    blockedCategoryKeys,
    timestamp: new Date().toISOString(),
  });

  const attachmentUrl = params.ownedGenericAttachmentUrl;
  if (
    attachmentUrl &&
    resolveUserAttachmentObjectPath(attachmentUrl, params.userId)
  ) {
    await (dependencies.deleteOwnedUpload ?? deleteStorageObjectByUrlIfOwned)(
      attachmentUrl,
    );
  }

  throw new SenecaSafetyError(
    SENECA_SAFETY_BLOCK_MESSAGE,
    safetyCodeForBlockedCategories(blockedCategoryKeys),
    400,
    true,
  );
}

export async function moderateSenecaOutputImage(params: {
  userId: string;
  operation: "image_generation_output" | "image_edit_output";
  bytes: Uint8Array;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
}, dependencies: SafetyDependencies = {}): Promise<void> {
  const mimeType = params.mimeType ?? "image/png";
  const imageDataUrl = `data:${mimeType};base64,${Buffer.from(params.bytes).toString("base64")}`;
  await moderateSenecaImage(
    {
      userId: params.userId,
      operation: params.operation,
      imageDataUrl,
    },
    dependencies,
  );
}
