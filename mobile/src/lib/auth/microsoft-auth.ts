import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { getBackendUrl } from "../backend-url";

WebBrowser.maybeCompleteAuthSession();

/** Deep link Better Auth redirects to after Microsoft (must match Stack route). */
export function getMicrosoftAuthCallbackUrl(): string {
  return Linking.createURL("auth-callback");
}

export function extractAuthTokenFromCallbackUrl(url: string): string | null {
  try {
    const hashIdx = url.indexOf("#");
    const queryIdx = url.indexOf("?");
    if (queryIdx >= 0) {
      const query = url.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined);
      const fromQuery = new URLSearchParams(query).get("auth_token")?.trim();
      if (fromQuery) return fromQuery;
    }
    if (hashIdx >= 0) {
      const fromHash = new URLSearchParams(url.slice(hashIdx + 1)).get("auth_token")?.trim();
      if (fromHash) return fromHash;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function extractOAuthErrorFromCallbackUrl(url: string): string | null {
  try {
    const queryIdx = url.indexOf("?");
    const hashIdx = url.indexOf("#");
    if (queryIdx < 0) return null;
    const query = url.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined);
    const params = new URLSearchParams(query);
    const err = params.get("error")?.trim();
    if (err) {
      const desc = params.get("error_description")?.trim();
      return desc ? `${err}: ${desc}` : err;
    }
    if (params.get("state") === "state_not_found") {
      return "Microsoft sign-in expired or was interrupted. Please try again.";
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Opens Microsoft Entra via the API (first-party cookies), then returns to the app deep link.
 */
export async function signInWithMicrosoft(): Promise<{
  error?: { message?: string } | null;
  callbackUrl?: string | null;
}> {
  let backend: string;
  try {
    backend = getBackendUrl();
  } catch {
    return { error: { message: "Backend URL is not configured." } };
  }

  const callbackURL = getMicrosoftAuthCallbackUrl();
  const startUrl = `${backend}/api/oauth/microsoft/start?callbackURL=${encodeURIComponent(callbackURL)}`;

  const result = await WebBrowser.openAuthSessionAsync(startUrl, callbackURL);
  if (result.type === "success" && result.url) {
    const oauthError = extractOAuthErrorFromCallbackUrl(result.url);
    if (oauthError) return { error: { message: oauthError } };
    return { error: null, callbackUrl: result.url };
  }
  if (result.type === "cancel" || result.type === "dismiss") {
    return { error: { message: "Microsoft sign-in was cancelled." } };
  }
  return { error: { message: "Microsoft sign-in failed. Please try again." } };
}
