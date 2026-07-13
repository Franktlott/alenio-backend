import { getResolvedBackendUrl } from "./env-config";

/** Prefer production site for OAuth return; local origin otherwise. */
export function getSocialAuthCallbackUrl(): string {
  if (import.meta.env.PROD) {
    return "https://alenio.com/auth/callback";
  }
  return `${window.location.origin}/auth/callback`;
}

export function getSocialAuthErrorCallbackUrl(): string {
  return getSocialAuthCallbackUrl();
}

/**
 * Starts Microsoft Entra redirect sign-in (web).
 * Uses a first-party navigation to the API so Safari can store OAuth cookies.
 */
export async function signInWithMicrosoft(): Promise<{ error?: { message?: string } | null }> {
  const backend = getResolvedBackendUrl();
  if (!backend) {
    return { error: { message: "Backend URL is not configured." } };
  }
  const callbackURL = encodeURIComponent(getSocialAuthCallbackUrl());
  window.location.assign(`${backend}/api/oauth/microsoft/start?callbackURL=${callbackURL}`);
  return { error: null };
}
