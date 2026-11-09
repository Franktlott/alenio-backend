import { describe, expect, test } from "bun:test";
import { uploadFileExtension } from "./upload-file-normalization";

describe("attachment upload filename normalization", () => {
  test("prefers the declared supported MIME type", () => {
    expect(uploadFileExtension("brief.bin", "application/pdf")).toBe("pdf");
    expect(uploadFileExtension("photo.bin", "image/webp")).toBe("webp");
  });

  test("uses a safe filename extension fallback", () => {
    expect(uploadFileExtension("notes.txt?download=1", "text/plain")).toBe(
      "txt",
    );
    expect(uploadFileExtension("attachment", "application/octet-stream")).toBe(
      "bin",
    );
  });
});
