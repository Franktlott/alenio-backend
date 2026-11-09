export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const OTHER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export function uploadMaxBytes(mimeType: string): number {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("video/")) return VIDEO_UPLOAD_MAX_BYTES;
  if (normalized.startsWith("image/")) return IMAGE_UPLOAD_MAX_BYTES;
  return OTHER_UPLOAD_MAX_BYTES;
}

export function uploadSizeLimitMessage(mimeType: string): string {
  return mimeType.trim().toLowerCase().startsWith("video/")
    ? "Videos must be 25 MB or smaller."
    : "Files must be 10 MB or smaller.";
}
