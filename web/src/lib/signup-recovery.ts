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
  | { kind: "wrong-password" };

/** True when sign-up should continue at the email verification step. */
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

/** Resume or complete sign-up when Neon Auth already has this email (usually unverified). */
export async function handleExistingEmailOnSignUp(input: {
  email: string;
  password: string;
  inviteToken?: string;
  /** When sign-up already failed with email-not-verified, skip sign-in and go straight to OTP. */
  knownUnverified?: boolean;
}): Promise<ExistingEmailSignUpOutcome> {
  const email = input.email.trim().toLowerCase();

  if (input.knownUnverified) {
    return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
  }

  try {
    const signIn = await getAuthClient().signIn.email({ email, password: input.password });
    const user = (signIn.data as { user?: { emailVerified?: boolean } } | undefined)?.user;

    if (!signIn.error && user?.emailVerified !== false) {
      setAccessTokenFromAuthData(signIn ?? null);
      setAccessTokenFromAuthData(signIn.data ?? null);
      await syncBackendUser();
      return { kind: "signed-in" };
    }

    if (signIn.error) {
      if (isEmailNotVerifiedError(signIn.error)) {
        return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
      }
      if (isInvalidCredentialsError(signIn.error)) {
        return { kind: "wrong-password" };
      }
    }

    if (user?.emailVerified === false) {
      return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
    }
  } catch (signInErr) {
    if (isEmailNotVerifiedError(signInErr)) {
      return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
    }
    if (isInvalidCredentialsError(signInErr)) {
      return { kind: "wrong-password" };
    }
    throw signInErr;
  }

  return sendToVerify({ email, password: input.password, inviteToken: input.inviteToken });
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

/** Last-resort: match raw message text when Neon error shape is unexpected. */
export function messageLooksLikeResumeSignUp(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  return (
    m.includes("email not verified") ||
    m.includes("not verified") ||
    m.includes("already exists") ||
    m.includes("use another email")
  );
}
