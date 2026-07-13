import { getAuthClient } from "./auth-client";

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

/** Starts Microsoft Entra redirect sign-in (web). */
export async function signInWithMicrosoft(): Promise<{ error?: { message?: string } | null }> {
  const callbackURL = getSocialAuthCallbackUrl();
  const result = await getAuthClient().signIn.social({
    provider: "microsoft",
    callbackURL,
    errorCallbackURL: callbackURL,
    newUserCallbackURL: callbackURL,
  });
  return { error: result.error ? { message: result.error.message ?? "Microsoft sign-in failed." } : null };
}
