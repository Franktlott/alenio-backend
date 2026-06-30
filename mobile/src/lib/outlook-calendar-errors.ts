export function formatOutlookUserError(raw: string | null | undefined): string {
  const input = raw?.trim() ?? "";
  if (!input) return "We couldn't connect Outlook. Please try again.";

  const lower = input.toLowerCase();

  if (
    lower.includes("aadsts65004") ||
    lower.includes("declined to consent") ||
    lower.includes("access_denied") ||
    lower.includes("consent_required")
  ) {
    return "Calendar access wasn't granted. Try again and accept the permissions when Microsoft asks.";
  }

  if (lower.includes("aadsts700016") || lower.includes("was not found in the directory")) {
    return "Outlook sign-in isn't configured correctly yet. Please contact support if this continues.";
  }

  if (
    lower.includes("cancel") ||
    lower.includes("authorization was cancelled") ||
    lower === "login_required"
  ) {
    return "Connection was cancelled. You can try again whenever you're ready.";
  }

  if (lower.includes("invalid_client") || lower.includes("client secret")) {
    return "Outlook calendar sync isn't configured on the server. Please contact support.";
  }

  if (lower.includes("expired") && lower.includes("token")) {
    return "Your Outlook session expired. Disconnect and connect again.";
  }

  if (lower.includes("outlook sync failed") || lower.includes("sync failed")) {
    return "We couldn't refresh your Outlook calendar. Try Sync now again in a moment.";
  }

  if (/aadsts\d+/i.test(input) || /trace id:/i.test(input) || /correlation id:/i.test(input)) {
    return "We couldn't connect Outlook. Please try again.";
  }

  if (input.length <= 120 && !/aadsts/i.test(input)) {
    return input;
  }

  return "We couldn't connect Outlook. Please try again.";
}
