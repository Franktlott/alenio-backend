import { describe, expect, test } from "bun:test";
import {
  extensionForMimeType,
  normalizeImageMime,
  normalizePickedFilename,
  requiresJpegTranscode,
} from "./file-picker-normalization";

describe("attachment file picker normalization", () => {
  test("normalizes HEIC images to a supported JPEG upload", () => {
    expect(normalizeImageMime("image/heic")).toBe("image/jpeg");
    expect(requiresJpegTranscode("image/heic", "coaching.heic")).toBe(true);
    expect(requiresJpegTranscode("image/jpeg", "coaching.HEIC")).toBe(true);
    expect(requiresJpegTranscode("image/jpeg", "coaching.jpg")).toBe(false);
    expect(normalizePickedFilename("coaching.heic", "image/jpeg")).toBe(
      "coaching.jpg",
    );
  });

  test("keeps PDF filenames and supplies safe fallbacks", () => {
    expect(extensionForMimeType("application/pdf")).toBe("pdf");
    expect(normalizePickedFilename("team brief.PDF", "application/pdf")).toBe(
      "team brief.pdf",
    );
    expect(
      normalizePickedFilename(undefined, "application/pdf", "document"),
    ).toMatch(/^document-\d+\.pdf$/);
  });
});
