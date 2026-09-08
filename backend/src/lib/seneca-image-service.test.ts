import { describe, expect, test } from "bun:test";
import {
  buildOpenAiImageEditFormData,
  dimensionsForImageSize,
  extractOpenAiImage,
  extractPngDimensions,
  hasReachedSenecaImageQuota,
  mapOpenAiImageProviderError,
  rollingImageWindowStart,
  senecaImageDailyLimit,
  senecaImageLimitForSubscriptions,
  utcDayStart,
} from "./seneca-image-service";

describe("Seneca image service", () => {
  test("calculates persistent daily quota boundaries", () => {
    expect(hasReachedSenecaImageQuota(4, 5)).toBe(false);
    expect(hasReachedSenecaImageQuota(5, 5)).toBe(true);
    expect(hasReachedSenecaImageQuota(6, 5)).toBe(true);
    expect(senecaImageDailyLimit("12")).toBe(12);
    expect(senecaImageDailyLimit("invalid")).toBe(5);
  });

  test("uses a UTC day boundary for quota queries", () => {
    expect(utcDayStart(new Date("2026-08-25T22:30:00-04:00")).toISOString()).toBe(
      "2026-08-26T00:00:00.000Z",
    );
  });

  test("uses plan-aware image limits", () => {
    expect(senecaImageLimitForSubscriptions([])).toBe(3);
    expect(
      senecaImageLimitForSubscriptions([
        { plan: "team", status: "active" },
      ]),
    ).toBe(10);
    expect(
      senecaImageLimitForSubscriptions([
        { plan: "team", status: "active" },
        { plan: "operations", status: "trialing" },
      ]),
    ).toBe(20);
    expect(
      senecaImageLimitForSubscriptions([
        { plan: "operations", status: "expired" },
      ]),
    ).toBe(3);
  });

  test("uses a rolling 24-hour quota window", () => {
    expect(
      rollingImageWindowStart(
        new Date("2026-08-26T06:30:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-25T06:30:00.000Z");
  });

  test("accepts image output and rejects empty provider responses", () => {
    expect(
      extractOpenAiImage({
        data: [{ b64_json: "aW1hZ2U=", revised_prompt: "  A calm office  " }],
      }),
    ).toEqual({
      base64: "aW1hZ2U=",
      revisedPrompt: "A calm office",
    });
    expect(extractOpenAiImage({ data: [] })).toBeNull();
  });

  test("maps supported sizes to stable dimensions", () => {
    expect(dimensionsForImageSize("1024x1536")).toEqual({
      width: 1024,
      height: 1536,
    });
  });

  test("builds the multipart image edit payload with source File", () => {
    const form = buildOpenAiImageEditFormData({
      prompt: "Change the flowers to green",
      sourceBytes: Buffer.from("source-image"),
      sourceMimeType: "image/webp",
      sourceFileName: "flowers.webp",
      model: "gpt-image-test",
    });
    const source = form.get("image");
    expect(form.get("model")).toBe("gpt-image-test");
    expect(form.get("prompt")).toBe("Change the flowers to green");
    expect(form.get("size")).toBe("auto");
    expect(form.get("output_format")).toBe("png");
    expect(source).toBeInstanceOf(File);
    expect((source as File).name).toBe("flowers.webp");
    expect((source as File).type).toBe("image/webp");
  });

  test("extracts edited PNG dimensions and rejects invalid bytes", () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    Buffer.from("IHDR").copy(png, 12);
    png.writeUInt32BE(1536, 16);
    png.writeUInt32BE(1024, 20);
    expect(extractPngDimensions(png)).toEqual({ width: 1536, height: 1024 });
    expect(extractPngDimensions(Buffer.from("not-png"))).toBeNull();
  });

  test("maps moderation failures separately from provider failures", () => {
    expect(
      mapOpenAiImageProviderError(400, "content_policy_violation moderation"),
    ).toMatchObject({ code: "IMAGE_REJECTED", status: 400 });
    expect(mapOpenAiImageProviderError(500, "upstream timeout")).toMatchObject({
      code: "IMAGE_PROVIDER_ERROR",
      status: 502,
    });
  });
});
