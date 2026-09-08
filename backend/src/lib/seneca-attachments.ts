import { z } from "zod";
import { getDocumentProxy } from "unpdf";
import {
  parseOwnedStorageObjectFromUrl,
  readStorageObjectByUrl,
  StorageObjectTooLargeError,
} from "./firebase-storage";

export const SENECA_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const SENECA_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SENECA_PDF_MAX_PAGES = 20;
export const SENECA_PDF_MAX_CHARS = 30_000;
export const SENECA_PDF_PARSE_TIMEOUT_MS = 8_000;
export const SENECA_ATTACHMENT_REVIEW_PROMPT =
  "Review this attachment and summarize the key information, risks, and useful next steps.";

export const senecaAttachmentSchema = z
  .object({
    url: z.string().trim().url().max(2048),
    mimeType: z.string().trim().min(1).max(100),
    fileName: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export type SenecaAttachmentInput = z.infer<typeof senecaAttachmentSchema>;
export type SenecaAttachmentMetadata = {
  url: string;
  mimeType: (typeof SENECA_ATTACHMENT_MIME_TYPES)[number];
  fileName: string;
  sizeBytes: number;
};
export type PreparedSenecaAttachment = {
  metadata: SenecaAttachmentMetadata;
  contextText?: string;
  imageDataUrl?: string;
  sourceBytes?: Buffer;
};

export type SenecaAttachmentErrorCode =
  | "ATTACHMENT_URL_FORBIDDEN"
  | "ATTACHMENT_NOT_FOUND"
  | "ATTACHMENT_TYPE_UNSUPPORTED"
  | "ATTACHMENT_TOO_LARGE"
  | "ATTACHMENT_METADATA_MISMATCH"
  | "ATTACHMENT_PDF_INVALID"
  | "ATTACHMENT_STORAGE_ERROR";

export class SenecaAttachmentError extends Error {
  constructor(
    message: string,
    readonly code: SenecaAttachmentErrorCode,
    readonly status: 403 | 404 | 413 | 415 | 422 | 502,
  ) {
    super(message);
    this.name = "SenecaAttachmentError";
  }
}

export function isSupportedSenecaAttachmentMime(
  value: string,
): value is SenecaAttachmentMetadata["mimeType"] {
  return (SENECA_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function isUserUploadObjectPath(objectPath: string, userId: string): boolean {
  return objectPath.startsWith(`users/${userId}/uploads/`);
}

export function resolveUserAttachmentObjectPath(
  url: string,
  userId: string,
): string | null {
  const parsed = parseOwnedStorageObjectFromUrl(url);
  if (!parsed || !isUserUploadObjectPath(parsed.objectPath, userId)) return null;
  return parsed.objectPath;
}

export type BoundedPdfText = {
  text: string;
  totalPages: number;
  pagesRead: number;
  truncated: boolean;
};

export function boundPdfPageText(
  pages: string[],
  totalPages = pages.length,
  maxPages = SENECA_PDF_MAX_PAGES,
  maxChars = SENECA_PDF_MAX_CHARS,
): BoundedPdfText {
  const included: string[] = [];
  let remaining = Math.max(0, maxChars);
  let pagesRead = 0;
  let truncated = totalPages > maxPages;

  for (const page of pages.slice(0, Math.max(0, maxPages))) {
    if (remaining === 0) {
      truncated = true;
      break;
    }
    const separatorLength = included.length > 0 ? 2 : 0;
    if (remaining <= separatorLength) {
      truncated = true;
      break;
    }
    remaining -= separatorLength;
    const normalized = page.replace(/\s+/g, " ").trim();
    const selected = normalized.slice(0, remaining);
    if (selected.length < normalized.length) truncated = true;
    included.push(selected);
    remaining -= selected.length;
    pagesRead += 1;
    if (selected.length < normalized.length) break;
  }

  return {
    text: included.filter(Boolean).join("\n\n"),
    totalPages,
    pagesRead,
    truncated,
  };
}

async function extractPdfWithinLimits(bytes: Buffer): Promise<BoundedPdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    maxImageSize: 16_777_216,
  });
  try {
    const pages: string[] = [];
    const pagesToRead = Math.min(pdf.numPages, SENECA_PDF_MAX_PAGES);
    let remaining = SENECA_PDF_MAX_CHARS;
    for (let pageNumber = 1; pageNumber <= pagesToRead && remaining > 0; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item) || typeof item.str !== "string") continue;
        const fragment = `${item.str} `;
        pageText += fragment.slice(0, Math.max(0, remaining - pageText.length));
        if (pageText.length >= remaining) break;
      }
      pages.push(pageText);
      remaining -= pageText.length;
    }
    return boundPdfPageText(
      pages,
      pdf.numPages,
      SENECA_PDF_MAX_PAGES,
      SENECA_PDF_MAX_CHARS,
    );
  } finally {
    await pdf.cleanup();
  }
}

export async function extractBoundedPdfText(bytes: Buffer): Promise<BoundedPdfText> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extractPdfWithinLimits(bytes),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("PDF extraction timed out")),
          SENECA_PDF_PARSE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type StorageReader = typeof readStorageObjectByUrl;

export async function prepareSenecaAttachment(
  input: SenecaAttachmentInput,
  userId: string,
  readObject: StorageReader = readStorageObjectByUrl,
): Promise<PreparedSenecaAttachment> {
  if (!isSupportedSenecaAttachmentMime(input.mimeType)) {
    throw new SenecaAttachmentError(
      "This attachment type is not supported.",
      "ATTACHMENT_TYPE_UNSUPPORTED",
      415,
    );
  }
  if (input.sizeBytes > SENECA_ATTACHMENT_MAX_BYTES) {
    throw new SenecaAttachmentError(
      "Attachments must be 10 MB or smaller.",
      "ATTACHMENT_TOO_LARGE",
      413,
    );
  }
  if (!resolveUserAttachmentObjectPath(input.url, userId)) {
    throw new SenecaAttachmentError(
      "Attachment URL must reference one of your own uploads.",
      "ATTACHMENT_URL_FORBIDDEN",
      403,
    );
  }

  let stored: Awaited<ReturnType<StorageReader>>;
  try {
    stored = await readObject(input.url, { maxBytes: SENECA_ATTACHMENT_MAX_BYTES });
  } catch (error) {
    if (error instanceof StorageObjectTooLargeError) {
      throw new SenecaAttachmentError(
        "Attachments must be 10 MB or smaller.",
        "ATTACHMENT_TOO_LARGE",
        413,
      );
    }
    throw new SenecaAttachmentError(
      "The attachment could not be read from storage.",
      "ATTACHMENT_STORAGE_ERROR",
      502,
    );
  }
  if (!stored) {
    throw new SenecaAttachmentError(
      "Attachment was not found.",
      "ATTACHMENT_NOT_FOUND",
      404,
    );
  }

  const storedMime = stored.contentType.split(";")[0]!.trim().toLowerCase();
  if (!isSupportedSenecaAttachmentMime(storedMime)) {
    throw new SenecaAttachmentError(
      "The stored attachment type is not supported.",
      "ATTACHMENT_TYPE_UNSUPPORTED",
      415,
    );
  }
  if (storedMime !== input.mimeType || stored.sizeBytes !== input.sizeBytes) {
    throw new SenecaAttachmentError(
      "Attachment metadata does not match the stored file.",
      "ATTACHMENT_METADATA_MISMATCH",
      422,
    );
  }
  if (stored.bytes.length !== stored.sizeBytes) {
    throw new SenecaAttachmentError(
      "Attachment size does not match the stored file.",
      "ATTACHMENT_METADATA_MISMATCH",
      422,
    );
  }

  const metadata: SenecaAttachmentMetadata = {
    url: input.url,
    mimeType: storedMime,
    fileName: input.fileName,
    sizeBytes: stored.sizeBytes,
  };
  if (storedMime.startsWith("image/")) {
    return {
      metadata,
      imageDataUrl: `data:${storedMime};base64,${stored.bytes.toString("base64")}`,
      sourceBytes: stored.bytes,
    };
  }

  try {
    const extracted = await extractBoundedPdfText(stored.bytes);
    const suffix = extracted.truncated
      ? `\n[Extraction limited to ${extracted.pagesRead} page(s) and ${SENECA_PDF_MAX_CHARS} characters.]`
      : "";
    return {
      metadata,
      contextText: `Current-turn PDF attachment "${input.fileName}" (${extracted.totalPages} page(s)):\n${
        extracted.text || "[No extractable text found.]"
      }${suffix}`,
    };
  } catch {
    throw new SenecaAttachmentError(
      "The PDF could not be safely read.",
      "ATTACHMENT_PDF_INVALID",
      422,
    );
  }
}
