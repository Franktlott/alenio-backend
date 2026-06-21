export type AuthLikeError = {
  code?: string;
  message?: string;
};

export function pickAuthErrorFields(err: unknown): { code?: string; message?: string } {
  if (err == null) return {};
  if (typeof err === "string") return { message: err };
  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown };
    const code = typeof withCode.code === "string" ? withCode.code : undefined;
    return { code, message: err.message };
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    if ("status" in o) {
      const fetchErr = o as { message?: string; error?: unknown };
      const fromBody = pickAuthErrorFields(fetchErr.error);
      if (fromBody.message || fromBody.code) return fromBody;
      if (typeof fetchErr.message === "string" && fetchErr.message.trim()) {
        return { message: fetchErr.message };
      }
    }
    const topCode = typeof o.code === "string" ? o.code : undefined;
    const topMsg = typeof o.message === "string" ? o.message : undefined;
    if (typeof o.error === "string" && o.error.trim()) {
      return { code: topCode, message: o.error };
    }
    const nested = o.error ?? o.body ?? o.data;
    if (nested && typeof nested === "object") {
      const n = nested as Record<string, unknown>;
      const nCode = typeof n.code === "string" ? n.code : undefined;
      const nMsg = typeof n.message === "string" ? n.message : undefined;
      return {
        code: nCode ?? topCode,
        message: nMsg ?? topMsg,
      };
    }
    return { code: topCode, message: topMsg };
  }
  return {};
}

export function isEmailNotVerifiedError(err: unknown): boolean {
  const { code, message } = pickAuthErrorFields(err);
  const c = (code ?? "").toLowerCase().replace(/-/g, "_");
  if (
    c === "email_not_confirmed" ||
    c === "email_not_verified" ||
    (code ?? "").toUpperCase() === "EMAIL_NOT_VERIFIED"
  ) {
    return true;
  }
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("email not verified") ||
    m.includes("not verified") ||
    m.includes("verify your email") ||
    m.includes("email verification") ||
    m.includes("must verify") ||
    m.includes("confirm your email")
  );
}

/** Sign-up rejected because a Neon Auth user already exists for this email. */
export function isEmailAlreadyRegisteredError(err: unknown): boolean {
  const { code, message } = pickAuthErrorFields(err);
  const c = (code ?? "").toLowerCase().replace(/-/g, "_");
  if (
    c === "user_already_exists" ||
    c === "email_already_in_use" ||
    c === "email_already_exists" ||
    c === "user_already_exists_use_another_email"
  ) {
    return true;
  }
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("already exists") ||
    m.includes("already in use") ||
    m.includes("already registered") ||
    m.includes("already been used") ||
    m.includes("email is taken") ||
    m.includes("user already") ||
    m.includes("use another email")
  );
}

/** Wrong password on sign-in (not the same as unverified email). */
export function isInvalidCredentialsError(err: unknown): boolean {
  if (isEmailNotVerifiedError(err)) return false;
  const { code, message } = pickAuthErrorFields(err);
  const c = (code ?? "").toLowerCase().replace(/-/g, "_");
  if (
    c === "invalid_email_or_password" ||
    c === "invalid_credentials" ||
    c === "invalid_password" ||
    c === "unauthorized"
  ) {
    return true;
  }
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("invalid email or password") ||
    m.includes("invalid credentials") ||
    m.includes("incorrect password") ||
    m.includes("wrong password")
  );
}

export function formatAuthFlowError(err: unknown): string {
  const { message } = pickAuthErrorFields(err);
  if (message?.trim()) return message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
