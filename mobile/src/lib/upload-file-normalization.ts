export function uploadFileExtension(
  filename: string,
  mimeType: string,
): string {
  const mimeExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const fromMime = mimeExtensions[mimeType.trim().toLowerCase()];
  if (fromMime) return fromMime;
  const cleanName = filename.split(/[?#]/, 1)[0] ?? "";
  const match = cleanName.match(/\.([a-zA-Z0-9]{1,8})$/);
  return match?.[1]?.toLowerCase() ?? "bin";
}
