export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidInviteEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function teamInviteErrorMessage(
  error: unknown,
  fallback = "We couldn't process this invitation. Please try again.",
): string {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("invalid_format") ||
    normalized.includes("invalid email") ||
    normalized.includes("valid email address")
  ) {
    return "Enter a valid email address, like name@company.com.";
  }
  if (status === 409 || normalized.includes("already a member")) {
    return "This person is already a member of this workspace.";
  }
  if (status === 403) {
    return "You don't have permission to invite members to this workspace.";
  }
  if (status === 404) {
    return "The invitation service is unavailable right now. Please try again shortly.";
  }
  if (status === 429) {
    return "Too many invitation attempts. Please wait a moment and try again.";
  }
  if (
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch")
  ) {
    return "Check your internet connection and try again.";
  }

  const looksTechnical =
    raw.length > 180 ||
    raw.trim().startsWith("{") ||
    raw.trim().startsWith("[") ||
    normalized.includes('"code"') ||
    normalized.includes('"path"');
  return raw && !looksTechnical ? raw : fallback;
}
