import type { Prisma, PrismaClient } from "@prisma/client";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** Days a user must wait between handle changes. */
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

/**
 * Lowercase letters/digits at each end, with periods and underscores allowed inside.
 * Handles are stored lowercase, so uniqueness is case-insensitive by construction.
 */
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/;

/** System and impersonation-risk handles nobody may claim. */
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "alenio", "api", "billing", "help", "me", "moderator",
  "official", "root", "security", "seneca", "settings", "support", "system", "team",
  "www",
]);

export type UsernameRejection =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "consecutive_periods"
  | "reserved";

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameRejection; message: string };

const REJECTION_MESSAGES: Record<UsernameRejection, string> = {
  too_short: `Usernames must be at least ${USERNAME_MIN_LENGTH} characters.`,
  too_long: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`,
  invalid_characters:
    "Usernames can use letters, numbers, periods and underscores, and must start and end with a letter or number.",
  consecutive_periods: "Usernames cannot contain two periods in a row.",
  reserved: "That username is reserved.",
};

/** Lowercase and trim. The stored form is always the normalized form. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): UsernameValidation {
  const username = normalizeUsername(raw);
  const reject = (reason: UsernameRejection): UsernameValidation => ({
    ok: false,
    reason,
    message: REJECTION_MESSAGES[reason],
  });

  if (username.length < USERNAME_MIN_LENGTH) return reject("too_short");
  if (username.length > USERNAME_MAX_LENGTH) return reject("too_long");
  if (!USERNAME_PATTERN.test(username)) return reject("invalid_characters");
  if (username.includes("..")) return reject("consecutive_periods");
  if (RESERVED_USERNAMES.has(username)) return reject("reserved");

  return { ok: true, username };
}

export function isUsernameReserved(raw: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(raw));
}

/**
 * Best-effort handle from a display name, falling back to the email local part.
 * Never throws: callers rely on this during login, so it always yields something usable.
 */
export function buildUsernameCandidate(name?: string | null, email?: string | null): string {
  const fromName = slugify(name ?? "");
  if (fromName.length >= USERNAME_MIN_LENGTH) return truncateCandidate(fromName);

  const fromEmail = slugify(email?.split("@")[0] ?? "");
  if (fromEmail.length >= USERNAME_MIN_LENGTH) return truncateCandidate(fromEmail);

  const seed = fromName || fromEmail;
  return truncateCandidate(seed ? seed.padEnd(USERNAME_MIN_LENGTH, "0") : "alenio.user");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+|[._]+$/g, "");
}

function truncateCandidate(value: string): string {
  return value.slice(0, USERNAME_MAX_LENGTH).replace(/[._]+$/, "");
}

/**
 * Append the suffix while staying inside the length limit: franklott, franklott2, franklott3.
 * Suffix 1 is the bare candidate so the first user gets the clean handle.
 */
export function withUsernameSuffix(candidate: string, attempt: number): string {
  if (attempt <= 1) return candidate;
  const suffix = String(attempt);
  const room = USERNAME_MAX_LENGTH - suffix.length;
  return `${candidate.slice(0, room).replace(/[._]+$/, "")}${suffix}`;
}

export function usernameCooldownRemainingDays(
  usernameUpdatedAt: Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!usernameUpdatedAt) return 0;
  const elapsedDays = (now.getTime() - usernameUpdatedAt.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(USERNAME_CHANGE_COOLDOWN_DAYS - elapsedDays));
}

type UsernameAllocationClient = Pick<PrismaClient, "user">;

/**
 * Claim a unique handle, letting the unique index arbitrate races rather than a
 * read-then-write check. Returns null if every attempt collided.
 */
export async function allocateUsername(
  prisma: UsernameAllocationClient,
  user: { id: string; name?: string | null; email?: string | null },
  maxAttempts = 25,
): Promise<string | null> {
  const candidate = buildUsernameCandidate(user.name, user.email);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const username = withUsernameSuffix(candidate, attempt);
    if (validateUsername(username).ok === false) continue;
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { username, usernameAutoGenerated: true },
        select: { id: true },
      });
      return username;
    } catch (err) {
      if (isUniqueConstraintError(err)) continue;
      throw err;
    }
  }

  // Last resort: a random suffix rather than leaving the account without a handle.
  const fallback = withUsernameSuffix(candidate, Math.floor(Math.random() * 900_000) + 100_000);
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { username: fallback, usernameAutoGenerated: true },
      select: { id: true },
    });
    return fallback;
  } catch (err) {
    if (isUniqueConstraintError(err)) return null;
    throw err;
  }
}

export function isUniqueConstraintError(err: unknown): boolean {
  return (err as Prisma.PrismaClientKnownRequestError | undefined)?.code === "P2002";
}
