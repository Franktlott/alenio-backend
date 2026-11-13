/**
 * Visible profile cover chrome in person.tsx:
 * safe-area inset, 4pt top padding, and a 36pt button row.
 * The sheet tucks under the cover; the avatar no longer needs a tall empty band.
 */
export const PROFILE_HEADER_BELOW_INSET = 4 + 36 + 4;

/** A photo already within this fraction of the header shape can be used whole. */
export const HEADER_ASPECT_TOLERANCE = 0.03;

export const HEADER_CROP_MAX_WIDTH = 2400;

export type HeaderCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type HeaderPlacement = {
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
};

export type HeaderBannerOptions = {
  /** Window height — used to keep landscape / short screens from a towering banner. */
  windowHeight?: number;
  topInset?: number;
};

/**
 * One stored banner shape on every device. Members crop to this ratio; display
 * stays as close as possible so the center of that crop remains in view when a
 * smaller or larger screen must adjust the band.
 * About 2.2:1: wider than a 16:9 photo, taller than a thin wide-screen slice.
 */
export const HEADER_ASPECT = 2.2;

/** Soft ceiling so wide tablets do not grow a huge band. */
export const HEADER_BANNER_MAX = 168;

/** Floor so phones keep a real header, not a thin strip. */
export const HEADER_BANNER_MIN = 128;

/**
 * Banner height that prefers HEADER_ASPECT so a cropped header still matches
 * what the member chose. Short windows (landscape) get a height cap so the
 * banner cannot dominate; `resizeMode: cover` keeps the crop’s center in view.
 */
export function headerBannerHeight(
  width: number,
  options: HeaderBannerOptions = {},
): number {
  if (width <= 0) return 0;
  const ideal = width / HEADER_ASPECT;
  let height = Math.round(
    Math.min(HEADER_BANNER_MAX, Math.max(HEADER_BANNER_MIN, ideal)),
  );
  const windowHeight = options.windowHeight ?? 0;
  if (windowHeight > 0) {
    const topInset = Math.max(0, options.topInset ?? 0);
    /** Portrait keeps the floor; short/landscape windows may go lower. */
    const shortCap = Math.max(96, Math.round(windowHeight * 0.28));
    height = Math.min(height, shortCap);
    height = Math.max(height, Math.min(topInset + 52, shortCap));
  }
  return height;
}

/** Wide screens are shorter than a full-width banner, so the photo stays centered at its real shape. */
export function headerBannerIsCompressed(
  width: number,
  options: HeaderBannerOptions = {},
): boolean {
  if (width <= 0) return false;
  return headerBannerHeight(width, options) < Math.round(width / HEADER_ASPECT) - 1;
}

/**
 * Height of a banner scaled to a narrow screen. The whole picture stays
 * visible. Taller photos stop at a 16:9 strip so the header cannot take over
 * the page.
 */
export function compressedHeaderHeight(
  width: number,
  imageAspect: number,
  minHeight: number,
): number {
  if (width <= 0 || imageAspect <= 0) return 0;
  const fitted = width / imageAspect;
  const cap = (width * 9) / 16;
  return Math.round(Math.min(cap, Math.max(minHeight, fitted)));
}

export function profileHeaderFrameAspect(
  _screenWidth?: number,
  _topInset?: number,
): number {
  return HEADER_ASPECT;
}

export function imageMatchesHeaderFrame(
  imageWidth: number,
  imageHeight: number,
  frameAspect: number,
  tolerance = HEADER_ASPECT_TOLERANCE,
): boolean {
  if (imageWidth <= 0 || imageHeight <= 0 || frameAspect <= 0) return false;
  const aspect = imageWidth / imageHeight;
  return Math.abs(aspect - frameAspect) / frameAspect <= tolerance;
}

/** Smallest size that fills the header window, centered. */
export function coverHeaderPlacement(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): HeaderPlacement {
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const displayWidth = imageWidth * scale;
  const displayHeight = imageHeight * scale;
  return {
    displayWidth,
    displayHeight,
    offsetX: (frameWidth - displayWidth) / 2,
    offsetY: (frameHeight - displayHeight) / 2,
  };
}

export function clampHeaderOffset(
  offset: number,
  displaySize: number,
  frameSize: number,
): number {
  "worklet";
  const min = Math.min(0, frameSize - displaySize);
  return Math.min(0, Math.max(min, offset));
}

/** Map the header window back onto the original photo, in pixels. */
export function headerCropRect(input: {
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
}): HeaderCropRect {
  const scaleX = input.imageWidth / input.displayWidth;
  const scaleY = input.imageHeight / input.displayHeight;
  return clampHeaderCrop(
    {
      originX: -input.offsetX * scaleX,
      originY: -input.offsetY * scaleY,
      width: input.frameWidth * scaleX,
      height: input.frameHeight * scaleY,
    },
    input.imageWidth,
    input.imageHeight,
  );
}

export function clampHeaderCrop(
  crop: HeaderCropRect,
  imageWidth: number,
  imageHeight: number,
): HeaderCropRect {
  const maxWidth = Math.max(1, Math.floor(imageWidth));
  const maxHeight = Math.max(1, Math.floor(imageHeight));
  const width = Math.max(1, Math.min(maxWidth, Math.round(crop.width)));
  const height = Math.max(1, Math.min(maxHeight, Math.round(crop.height)));
  const originX = Math.max(0, Math.min(maxWidth - width, Math.round(crop.originX)));
  const originY = Math.max(
    0,
    Math.min(maxHeight - height, Math.round(crop.originY)),
  );
  return { originX, originY, width, height };
}

/** Shown wherever members choose or change a header. */
export const HEADER_SIZE_NOTE =
  "Headers may look slightly different on a smaller screen than on a larger screen. Alenio keeps the center of your photo in view.";
