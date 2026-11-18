import {
  ensureWebSessionAndToken,
  getAuthClient,
  setAccessTokenFromAuthData,
  syncBackendUser,
} from "./auth-client";
import {
  isEmailAlreadyRegisteredError,
  isEmailNotVerifiedError,
  isInvalidCredentialsError,
  pickAuthErrorFields,
} from "./auth-errors";
import { clearPendingSignUp, getPendingSignUp, setPendingSignUp } from "./pending-signup";
import { goToEmailVerification } from "./verify-redirect";

export type ExistingEmailSignUpOutcome =
  | { kind: "verify" }
  | { kind: "signed-in" }
  | { kind: "already-exists" };

/** True when sign-up collided with an existing auth account. */
export function isExistingEmailSignUpError(err: unknown): boolean {
  return isEmailAlreadyRegisteredError(err) || isEmailNotVerifiedError(err);
}

export function authErrorMessage(err: unknown): string {
  return pickAuthErrorFields(err).message?.trim() ?? "";
}

async function sendToVerify(input: {
  email: string;
  password: string;
  inviteToken?: string;
}): Promise<ExistingEmailSignUpOutcome> {
  setPendingSignUp(input.email, input.password);
  await goToEmailVerification({
    email: input.email,
    inviteToken: input.inviteToken,
    password: input.password,
  });
  return { kind: "verify" };
}

/**
 * Resume or complete sign-up when Better Auth already has this email.
 * - Unverified → send/resume OTP verification
 * - Verified + correct password → sign in
 * - Verified + wrong/unknown password → tell them the account already exists
 */
export async function handleExistingEmailOnSignUp(input: {
  email: string;
  password: string;
  inviteToken?: string;
  /** Only when sign-up already failed specifically with email-not-verified. */
  knownUnverified?: boolean;
}): Promise<ExistingEmailSignUpOutcome> {
  const email = input.email.trim().toLowerCase();

  if (input.knownUnverified) {
    return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
  }

  try {
    const signIn = await getAuthClient().signIn.email({ email, password: input.password });
    const user = (signIn.data as { user?: { emailVerified?: boolean } } | undefined)?.user;

    if (!signIn.error && user?.emailVerified === false) {
      return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
    }

    if (!signIn.error && user) {
      setAccessTokenFromAuthData(signIn ?? null);
      setAccessTokenFromAuthData(signIn.data ?? null);
      await syncBackendUser();
      return { kind: "signed-in" };
    }

    if (signIn.error) {
      if (isEmailNotVerifiedError(signIn.error)) {
        return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
      }
      // Wrong password, or account exists but we cannot sign in — do not send OTP.
      if (isInvalidCredentialsError(signIn.error) || isEmailAlreadyRegisteredError(signIn.error)) {
        return { kind: "already-exists" };
      }
      return { kind: "already-exists" };
    }
  } catch (signInErr) {
    if (isEmailNotVerifiedError(signInErr)) {
      return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
    }
    if (isInvalidCredentialsError(signInErr) || isEmailAlreadyRegisteredError(signInErr)) {
      return { kind: "already-exists" };
    }
    throw signInErr;
  }

  return { kind: "already-exists" };
}

/** Re-establish session after OTP verify when Neon did not return a bearer token. */
export async function tryFinishSignUpAfterVerify(email: string): Promise<boolean> {
  const pending = getPendingSignUp();
  const emailNorm = email.trim().toLowerCase();
  if (!pending || pending.email !== emailNorm) return false;

  try {
    const si = await getAuthClient().signIn.email({
      email: pending.email,
      password: pending.password,
    });
    if (si.error) return false;
    setAccessTokenFromAuthData(si ?? null);
    setAccessTokenFromAuthData(si.data ?? null);
    clearPendingSignUp();
    return ensureWebSessionAndToken();
  } catch {
    return false;
  }
}

/** Last-resort: match raw message text for unverified-email resume only. */
export function messageLooksLikeResumeSignUp(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  return (
    m.includes("email not verified") ||
    m.includes("not verified") ||
    m.includes("verify your email") ||
    m.includes("confirm your email")
  );
}

export function messageLooksLikeExistingAccount(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  return (
    m.includes("already exists") ||
    m.includes("already in use") ||
    m.includes("use another email") ||
    m.includes("user already exists")
  );
}
