import { getAuthClient } from "./auth-client";

/** Absolute URL Better Auth redirects to after Microsoft OAuth (SPA picks up bearer token from hash). */
export function getSocialAuthCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export function getSocialAuthErrorCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/** Starts Microsoft Entra redirect sign-in (web). */
export async function signInWithMicrosoft(): Promise<{ error?: { message?: string } | null }> {
  const result = await getAuthClient().signIn.social({
    provider: "microsoft",
    callbackURL: getSocialAuthCallbackUrl(),
    errorCallbackURL: getSocialAuthErrorCallbackUrl(),
    newUserCallbackURL: getSocialAuthCallbackUrl(),
  });
  return { error: result.error ? { message: result.error.message ?? "Microsoft sign-in failed." } : null };
}
