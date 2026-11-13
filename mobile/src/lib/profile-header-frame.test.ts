// @ts-expect-error Bun's test types are intentionally outside the Expo app tsconfig.
import { describe, expect, test } from "bun:test";
import {
  clampHeaderOffset,
  compressedHeaderHeight,
  coverHeaderPlacement,
  headerBannerHeight,
  headerBannerIsCompressed,
  headerCropRect,
  imageMatchesHeaderFrame,
  profileHeaderFrameAspect,
  HEADER_ASPECT,
  HEADER_BANNER_MAX,
  HEADER_BANNER_MIN,
  HEADER_SIZE_NOTE,
} from "./profile-header-frame";

describe("profile header framing", () => {
  test("uses one banner shape on every screen", () => {
    expect(profileHeaderFrameAspect(390, 59)).toBe(HEADER_ASPECT);
    expect(profileHeaderFrameAspect(1180, 24)).toBe(HEADER_ASPECT);
  });

  test("keeps phone banners near the crop aspect and wide banners capped", () => {
    expect(headerBannerHeight(390)).toBe(
      Math.round(Math.min(HEADER_BANNER_MAX, Math.max(HEADER_BANNER_MIN, 390 / HEADER_ASPECT))),
    );
    expect(headerBannerHeight(320)).toBe(
      Math.round(Math.min(HEADER_BANNER_MAX, Math.max(HEADER_BANNER_MIN, 320 / HEADER_ASPECT))),
    );
    expect(headerBannerHeight(260)).toBe(HEADER_BANNER_MIN);
    expect(headerBannerHeight(1180)).toBe(HEADER_BANNER_MAX);
    expect(headerBannerHeight(0)).toBe(0);
    /** Soft max keeps even phone widths slightly under a pure 2.2 band. */
    expect(headerBannerIsCompressed(390)).toBe(true);
    expect(headerBannerIsCompressed(1180)).toBe(true);
    expect(headerBannerIsCompressed(300)).toBe(false);
  });

  test("short landscape windows cap height without collapsing the band", () => {
    const landscape = headerBannerHeight(844, {
      windowHeight: 390,
      topInset: 0,
    });
    expect(landscape).toBeLessThanOrEqual(Math.round(390 * 0.28));
    expect(landscape).toBeGreaterThanOrEqual(96);
    expect(landscape).toBeLessThan(HEADER_BANNER_MAX);
  });

  test("skips editing when the photo is already the header shape", () => {
    const frame = profileHeaderFrameAspect(390, 59);
    expect(imageMatchesHeaderFrame(frame * 900, 900, frame)).toBe(true);
    expect(imageMatchesHeaderFrame(900, 1600, frame)).toBe(false);
    expect(imageMatchesHeaderFrame(0, 100, frame)).toBe(false);
  });

  test("centers a tall photo so the header window is full", () => {
    const placed = coverHeaderPlacement(1000, 2000, 400, 180);
    expect(placed.displayWidth).toBeCloseTo(400);
    expect(placed.displayHeight).toBeCloseTo(800);
    expect(placed.offsetX).toBeCloseTo(0);
    expect(placed.offsetY).toBeCloseTo((180 - 800) / 2);
  });

  test("turns the visible window into a crop of the original photo", () => {
    const crop = headerCropRect({
      imageWidth: 1000,
      imageHeight: 2000,
      frameWidth: 400,
      frameHeight: 180,
      offsetX: 0,
      offsetY: -310,
      displayWidth: 400,
      displayHeight: 800,
    });
    expect(crop.originX).toBe(0);
    expect(crop.originY).toBe(775);
    expect(crop.width).toBe(1000);
    expect(crop.height).toBe(450);
  });

  test("scales a narrow header to the picture instead of cropping it", () => {
    expect(compressedHeaderHeight(390, 16 / 9, 100)).toBe(219);
    expect(compressedHeaderHeight(390, 3, 100)).toBe(130);
    expect(compressedHeaderHeight(390, 1, 100)).toBe(219);
    expect(compressedHeaderHeight(390, 4, 120)).toBe(120);
    expect(compressedHeaderHeight(0, 16 / 9, 100)).toBe(0);
  });

  test("keeps a dragged photo covering the header", () => {
    expect(clampHeaderOffset(40, 800, 180)).toBe(0);
    expect(clampHeaderOffset(-900, 800, 180)).toBe(-620);
    expect(clampHeaderOffset(-200, 800, 180)).toBe(-200);
  });

  test("documents that headers can differ across screen sizes", () => {
    expect(HEADER_SIZE_NOTE.toLowerCase()).toContain("smaller screen");
    expect(HEADER_SIZE_NOTE.toLowerCase()).toContain("larger screen");
  });
});
