import { beforeAll, describe, expect, test } from "bun:test";
import { buildSenecaUserContent } from "./seneca-openai";
import { collectUploadObjectPathsFromValue } from "./orphan-upload-cleanup";
import {
  SENECA_ATTACHMENT_MAX_BYTES,
  SENECA_ATTACHMENT_REVIEW_PROMPT,
  SENECA_PDF_MAX_CHARS,
  SENECA_PDF_MAX_PAGES,
  boundPdfPageText,
  isSupportedSenecaAttachmentMime,
  isUserUploadObjectPath,
  prepareSenecaAttachment,
  resolveUserAttachmentObjectPath,
} from "./seneca-attachments";

const BUCKET = "alenio-test.appspot.com";
const USER_ID = "user-1";
const OWN_PATH = `users/${USER_ID}/uploads/123-document.pdf`;
const OWN_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
  OWN_PATH,
)}?alt=media&token=test`;

beforeAll(() => {
  process.env.FIREBASE_STORAGE_BUCKET = BUCKET;
});

describe("Seneca attachment ownership and validation", () => {
  test("accepts only supported attachment MIME types", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]) {
      expect(isSupportedSenecaAttachmentMime(mime)).toBe(true);
    }
    expect(isSupportedSenecaAttachmentMime("image/gif")).toBe(false);
    expect(isSupportedSenecaAttachmentMime("text/html")).toBe(false);
  });

  test("requires the authenticated user's generic upload path", () => {
    expect(isUserUploadObjectPath(OWN_PATH, USER_ID)).toBe(true);
    expect(isUserUploadObjectPath("users/user-2/uploads/file.pdf", USER_ID)).toBe(false);
    expect(isUserUploadObjectPath(`users/${USER_ID}/profile/avatar`, USER_ID)).toBe(false);
    expect(resolveUserAttachmentObjectPath(OWN_URL, USER_ID)).toBe(OWN_PATH);
    expect(resolveUserAttachmentObjectPath("https://example.com/file.pdf", USER_ID)).toBeNull();
  });

  test("verifies declared MIME and size against stored metadata", async () => {
    const bytes = Buffer.from("image-bytes");
    const prepared = await prepareSenecaAttachment(
      {
        url: OWN_URL,
        mimeType: "image/png",
        fileName: "proof.png",
        sizeBytes: bytes.length,
      },
      USER_ID,
      async () => ({ bytes, contentType: "image/png", sizeBytes: bytes.length }),
    );
    expect(prepared.metadata).toEqual({
      url: OWN_URL,
      mimeType: "image/png",
      fileName: "proof.png",
      sizeBytes: bytes.length,
    });
    expect(prepared.imageDataUrl).toBe(
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    expect(prepared.sourceBytes).toEqual(bytes);

    await expect(
      prepareSenecaAttachment(
        {
          url: OWN_URL,
          mimeType: "image/png",
          fileName: "proof.png",
          sizeBytes: bytes.length + 1,
        },
        USER_ID,
        async () => ({ bytes, contentType: "image/png", sizeBytes: bytes.length }),
      ),
    ).rejects.toMatchObject({
      code: "ATTACHMENT_METADATA_MISMATCH",
      status: 422,
    });
  });

  test("rejects oversized declarations with a typed 413", async () => {
    await expect(
      prepareSenecaAttachment(
        {
          url: OWN_URL,
          mimeType: "application/pdf",
          fileName: "large.pdf",
          sizeBytes: SENECA_ATTACHMENT_MAX_BYTES + 1,
        },
        USER_ID,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "ATTACHMENT_TOO_LARGE",
        status: 413,
      }),
    );
  });

  test("returns a typed error for an unreadable PDF", async () => {
    const bytes = Buffer.from("not-a-pdf");
    await expect(
      prepareSenecaAttachment(
        {
          url: OWN_URL,
          mimeType: "application/pdf",
          fileName: "broken.pdf",
          sizeBytes: bytes.length,
        },
        USER_ID,
        async () => ({
          bytes,
          contentType: "application/pdf",
          sizeBytes: bytes.length,
        }),
      ),
    ).rejects.toMatchObject({ code: "ATTACHMENT_PDF_INVALID", status: 422 });
  });
});

describe("Seneca attachment prompt bounds and payloads", () => {
  test("uses a visible default prompt for attachment-only requests", () => {
    expect(SENECA_ATTACHMENT_REVIEW_PROMPT).toContain("Review this attachment");
  });

  test("bounds PDF page count and extracted characters", () => {
    const pages = Array.from({ length: SENECA_PDF_MAX_PAGES + 5 }, () =>
      "x".repeat(2_000),
    );
    const result = boundPdfPageText(pages);
    expect(result.pagesRead).toBeLessThanOrEqual(SENECA_PDF_MAX_PAGES);
    expect(result.text.length).toBeLessThanOrEqual(SENECA_PDF_MAX_CHARS);
    expect(result.truncated).toBe(true);
  });

  test("preserves text payloads and adds only the current image data URL", () => {
    expect(buildSenecaUserContent("hello")).toBe("hello");
    expect(buildSenecaUserContent("review", "data:image/png;base64,abc")).toEqual([
      { type: "text", text: "review" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc", detail: "auto" },
      },
    ]);
  });

  test("recognizes attachment URLs nested in conversation metadata", () => {
    expect(
      [...collectUploadObjectPathsFromValue({
        kind: "attachment",
        attachment: { url: OWN_URL },
      })],
    ).toEqual([OWN_PATH]);
  });
});
