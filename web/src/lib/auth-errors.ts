export type AuthLikeError = {
  code?: string;
  message?: string;
};

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
    m.includes("verify your email") ||
    m.includes("email verification") ||
    m.includes("must verify") ||
    m.includes("confirm your email")
  );
}

export function formatAuthFlowError(err: unknown): string {
  const { message } = pickAuthErrorFields(err);
  if (message?.trim()) return message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
