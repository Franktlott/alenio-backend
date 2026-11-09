export function senecaFriendlyErrorMessage(error: unknown): string {
  const code =
    error &&
    typeof error === "object" &&
    "body" in error &&
    error.body &&
    typeof error.body === "object" &&
    "error" in error.body &&
    error.body.error &&
    typeof error.body.error === "object" &&
    "code" in error.body.error
      ? String(error.body.error.code)
      : "";
  if (code.startsWith("SENECA_IMAGE_SAFETY_")) {
    return code === "SENECA_IMAGE_SAFETY_UNAVAILABLE"
      ? "Seneca can’t safely process images right now. Please try again later."
      : "I can’t process that image or request because it doesn’t meet Alenio’s workplace safety standards.";
  }
  if (code === "IMAGE_RATE_LIMITED") {
    return "Please wait a few seconds before creating another image.";
  }
  if (code === "IMAGE_QUOTA_REACHED") {
    return "You’ve reached your image limit for the current 24-hour window. Try again after an earlier image expires from the window.";
  }
  const raw = error instanceof Error ? error.message : "";
  if (/unsupported image|image.*format|invalid.*image/i.test(raw)) {
    return "I couldn’t read that image. Please choose a JPG, PNG, or WebP image and try again.";
  }
  if (/quota|daily limit|limit of \d+ images/i.test(raw)) {
    return "You’ve reached your image limit for the current 24-hour window. Please try again later.";
  }
  if (/expired/i.test(raw)) return raw;
  if (raw && !/[{}\[\]"]/.test(raw) && raw.length <= 220) return raw;
  return "I couldn’t complete that request right now. Please try again.";
}
