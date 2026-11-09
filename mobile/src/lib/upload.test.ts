import { describe, expect, test } from "bun:test";
import {
  normalizeImageMime,
  normalizePickedFilename,
} from "./file-picker-normalization";
import { uploadFileExtension } from "./upload-file-normalization";

describe("attachment picker normalization", () => {
  test("normalizes supported image and document names", () => {
    expect(normalizeImageMime("image/heic")).toBe("image/jpeg");
    expect(normalizePickedFilename("scan.tmp", "application/pdf")).toBe(
      "scan.pdf",
    );
    expect(normalizePickedFilename("photo.jpeg", "image/webp")).toBe(
      "photo.webp",
    );
  });
});

describe("upload file URI normalization", () => {
  test("uses MIME type instead of arbitrary source URI extension", () => {
    expect(uploadFileExtension("quarterly report.pdf", "application/pdf")).toBe(
      "pdf",
    );
    expect(uploadFileExtension("asset-without-extension", "image/webp")).toBe(
      "webp",
    );
    expect(uploadFileExtension("wrong.jpg", "image/png")).toBe("png");
  });

  test("falls back to a safe filename extension for unknown MIME types", () => {
    expect(uploadFileExtension("archive.custom?download=1", "")).toBe("custom");
    expect(uploadFileExtension("no-extension", "")).toBe("bin");
  });
});
