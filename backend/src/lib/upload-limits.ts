export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const OTHER_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export function maxUploadBytesForContentType(contentType: string): number {
  return contentType.trim().toLowerCase().startsWith("video/")
    ? VIDEO_UPLOAD_MAX_BYTES
    : contentType.trim().toLowerCase().startsWith("image/")
      ? IMAGE_UPLOAD_MAX_BYTES
      : OTHER_UPLOAD_MAX_BYTES;
}

export function uploadTooLargeMessage(contentType: string): string {
  return contentType.trim().toLowerCase().startsWith("video/")
    ? "Videos must be 25 MB or smaller."
    : "Files must be 10 MB or smaller.";
}
