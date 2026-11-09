export function normalizeImageMime(mime?: string | null): string {
  if (!mime) return "image/jpeg";
  if (mime === "image/heic" || mime === "image/heif") return "image/jpeg";
  return mime;
}

export function requiresJpegTranscode(
  mimeType?: string | null,
  filename?: string | null,
): boolean {
  return (
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    /\.(heic|heif)$/i.test(filename?.trim() ?? "")
  );
}

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "jpg";
  }
}

export function normalizePickedFilename(
  filename: string | null | undefined,
  mimeType: string,
  fallbackStem = "file",
): string {
  const ext = extensionForMimeType(mimeType);
  const raw = filename?.trim();
  if (!raw) return `${fallbackStem}-${Date.now()}.${ext}`;
  const withoutExtension = raw.replace(/\.[^./\\]+$/, "");
  return `${withoutExtension || fallbackStem}.${ext}`;
}
