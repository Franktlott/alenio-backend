export type AuthLikeError = {
  code?: string;
  message?: string;
};

/** Pull code/message from Neon / Better Auth / fetch error shapes. */
export function pickAuthErrorFields(err: unknown): { code?: string; message?: string } {
  if (err == null) return {};
  if (err instanceof Error) {
    const withCode = err as Error & { code?: unknown };
    const code = typeof withCode.code === "string" ? withCode.code : undefined;
    return { code, message: err.message };
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const topCode = typeof o.code === "string" ? o.code : undefined;
    const topMsg = typeof o.message === "string" ? o.message : undefined;
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

/**
 * Sign-in blocked until email is verified.
 * Neon maps Better Auth EMAIL_NOT_VERIFIED → code `email_not_confirmed` on AuthApiError.
 */
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
    m.includes("not verified") ||
    m.includes("email not verified") ||
    m.includes("verification required") ||
    m.includes("verify your email") ||
    m.includes("email verification") ||
    m.includes("must verify") ||
    m.includes("confirm your email")
  );
}

/**
 * Turns thrown errors from Neon / Better Auth / fetch into user-visible strings.
 */
export function formatAuthFlowError(error: unknown): string {
  if (error == null) {
    return "Something went wrong. Please try again.";
  }

  // @better-fetch/fetch BetterFetchError: { status, message, error: parsed body }
  if (typeof error === "object" && error !== null && "status" in error) {
    const be = error as {
      status: number;
      message?: string;
      error?: unknown;
    };
    const body = be.error;
    if (body && typeof body === "object" && body !== null) {
      const msg = (body as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg;
      const errMsg = (body as { error?: unknown }).error;
      if (typeof errMsg === "string" && errMsg.trim()) return errMsg;
    }
    if (typeof be.message === "string" && be.message.trim()) {
      return be.message;
    }
    return `Authentication request failed (HTTP ${be.status}). Check your connection and auth settings.`;
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (/network request failed/i.test(msg) || /failed to fetch/i.test(msg) || /networkerror/i.test(msg)) {
      return "Can't reach the authentication service. Check your internet connection.";
    }
    if (/time(d)? ?out|aborted/i.test(msg)) {
      return "Request timed out. Try again.";
    }
    return msg || "Something went wrong. Please try again.";
  }

  return "Something went wrong. Please try again.";
}
