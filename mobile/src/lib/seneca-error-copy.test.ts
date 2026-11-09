import { describe, expect, test } from "bun:test";
import { senecaFriendlyErrorMessage } from "./seneca-error-copy";

describe("Seneca error copy", () => {
  test("replaces provider payloads with useful image guidance", () => {
    expect(
      senecaFriendlyErrorMessage(
        new Error(
          'Seneca request failed (400): {"error":{"message":"You uploaded an unsupported image."}}',
        ),
      ),
    ).toBe(
      "I couldn’t read that image. Please choose a JPG, PNG, or WebP image and try again.",
    );
  });

  test("does not expose unknown provider JSON", () => {
    expect(
      senecaFriendlyErrorMessage(
        new Error('Request failed: {"error":{"code":"provider_error"}}'),
      ),
    ).toBe("I couldn’t complete that request right now. Please try again.");
  });

  test("uses professional workplace safety copy", () => {
    expect(
      senecaFriendlyErrorMessage({
        body: {
          error: {
            code: "SENECA_IMAGE_SAFETY_EXPLICIT",
          },
        },
      }),
    ).toBe(
      "I can’t process that image or request because it doesn’t meet Alenio’s workplace safety standards.",
    );
  });

  test("explains rolling image quota and burst limits", () => {
    expect(
      senecaFriendlyErrorMessage({
        body: { error: { code: "IMAGE_RATE_LIMITED" } },
      }),
    ).toBe("Please wait a few seconds before creating another image.");
    expect(
      senecaFriendlyErrorMessage({
        body: { error: { code: "IMAGE_QUOTA_REACHED" } },
      }),
    ).toContain("current 24-hour window");
  });
});
