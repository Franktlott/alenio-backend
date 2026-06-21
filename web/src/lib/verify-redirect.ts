import { clearAccessToken, getAuthClient } from "./auth-client";
import { isEmailNotVerifiedError } from "./auth-errors";
import { setPendingSignUp } from "./pending-signup";

const VERIFY_HINT_KEY = "alenio:verify-hint";

export type AuthUserLike = { emailVerified?: boolean | null } | null | undefined;

/** True when sign-in/sign-up indicates the account exists but email is not verified yet. */
export function needsEmailVerification(err: unknown, user?: AuthUserLike): boolean {
  if (user?.emailVerified === false) return true;
  return isEmailNotVerifiedError(err);
}

/**
 * Send a verification code (best effort) and navigate to the verify screen.
 * Never leaves the user stuck on login/sign-up when verification is required.
 */
export async function goToEmailVerification(input: {
  email: string;
  inviteToken?: string;
  attemptSendCode?: boolean;
  password?: string;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const attemptSend = input.attemptSendCode !== false;

  if (input.password) {
    setPendingSignUp(email, input.password);
  }

  if (attemptSend) {
    try {
      const sent = await getAuthClient().emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (sent.error) {
        try {
          sessionStorage.setItem(
            VERIFY_HINT_KEY,
            "We couldn't send a new code just now. Check your inbox for an earlier message, or tap Resend code below.",
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      try {
        sessionStorage.setItem(
          VERIFY_HINT_KEY,
          "Check your inbox for a verification code, or tap Resend code below.",
        );
      } catch {
        /* ignore */
      }
    }
  }

  clearAccessToken();
  const q = new URLSearchParams({ email });
  if (input.inviteToken) q.set("invite", input.inviteToken);
  window.location.href = `/verify?${q.toString()}`;
}

export function consumeVerifyHint(): string | null {
  try {
    const hint = sessionStorage.getItem(VERIFY_HINT_KEY);
    sessionStorage.removeItem(VERIFY_HINT_KEY);
    return hint;
  } catch {
    return null;
  }
}
