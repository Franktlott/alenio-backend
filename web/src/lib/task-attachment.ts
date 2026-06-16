/** Task attachments are photos uploaded at create time (Firebase Storage or image URLs). */
export function isTaskPhotoUrl(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"].some((ext) =>
      clean.endsWith(ext),
    )
  ) {
    return true;
  }
  return /firebasestorage\.(googleapis\.com|app)/i.test(url);
}
