/**
 * Lightweight signup abuse guards used in front of Better Auth.
 * Captcha (Turnstile) is separate; this covers disposable mail + honeypots.
 */

const DISPOSABLE_EMAIL_DOMAINS = new Set(
  [
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "sharklasers.com",
    "grr.la",
    "guerrillamailblock.com",
    "pokemail.net",
    "spam4.me",
    "tempmail.com",
    "temp-mail.org",
    "temp-mail.io",
    "10minutemail.com",
    "10minutemail.net",
    "throwawaymail.com",
    "yopmail.com",
    "yopmail.fr",
    "trashmail.com",
    "trashmail.me",
    "getnada.com",
    "nada.email",
    "dispostable.com",
    "mailnesia.com",
    "maildrop.cc",
    "fakeinbox.com",
    "emailondeck.com",
    "moakt.com",
    "tempail.com",
    "tmpmail.org",
    "tmpmail.net",
    "discard.email",
    "discardmail.com",
    "mailcatch.com",
    "inboxkitten.com",
    "mailnull.com",
    "spamgourmet.com",
    "spamgourmet.net",
    "mailforspam.com",
    "mytrashmail.com",
    "mt2015.com",
    "trash-mail.com",
    "emailfake.com",
    "crazymailing.com",
    "mintemail.com",
    "mailtemp.net",
    "tempinbox.com",
    "burnermail.io",
    "guerrillamail.org",
    "spamfree24.org",
    "mailnesia.com",
  ].map((d) => d.toLowerCase()),
);

export function normalizeSignupEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const normalized = normalizeSignupEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  // Catch common plus-style temp host patterns: foo.mailinator.com
  const parts = domain.split(".");
  if (parts.length >= 3) {
    const base = parts.slice(-2).join(".");
    if (DISPOSABLE_EMAIL_DOMAINS.has(base)) return true;
  }
  return false;
}

/** Hidden form fields bots often fill; real users leave blank. */
export function honeypotFilled(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const rec = body as Record<string, unknown>;
  for (const key of ["website", "companyUrl", "company_url", "fax", "hp_field"]) {
    const value = rec[key];
    if (typeof value === "string" && value.trim().length > 0) return true;
  }
  return false;
}

export function isSignupAuthPath(path: string): boolean {
  return (
    path.endsWith("/sign-up/email") ||
    path.includes("/sign-up/email") ||
    path.endsWith("/email-otp/send-verification-otp") ||
    path.includes("/email-otp/send-verification-otp")
  );
}
