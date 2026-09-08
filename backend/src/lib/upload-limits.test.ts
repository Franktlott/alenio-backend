import { describe, expect, test } from "bun:test";
import {
  IMAGE_UPLOAD_MAX_BYTES,
  OTHER_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_MAX_BYTES,
  maxUploadBytesForContentType,
  uploadTooLargeMessage,
} from "./upload-limits";

describe("upload limits", () => {
  test("allows larger chat videos than images and documents", () => {
    expect(maxUploadBytesForContentType("video/mp4")).toBe(
      VIDEO_UPLOAD_MAX_BYTES,
    );
    expect(maxUploadBytesForContentType("image/jpeg")).toBe(
      IMAGE_UPLOAD_MAX_BYTES,
    );
    expect(maxUploadBytesForContentType("application/pdf")).toBe(
      OTHER_UPLOAD_MAX_BYTES,
    );
  });

  test("returns clear user-facing limits", () => {
    expect(uploadTooLargeMessage("video/quicktime")).toBe(
      "Videos must be 25 MB or smaller.",
    );
    expect(uploadTooLargeMessage("image/png")).toBe(
      "Files must be 10 MB or smaller.",
    );
  });
});
