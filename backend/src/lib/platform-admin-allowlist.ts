import type { PrismaClient } from "@prisma/client";
import { env } from "../env";

export function platformAdminEmails(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const email = part.trim().toLowerCase();
    if (email.includes("@")) seen.add(email);
  }
  return [...seen];
}

/** Only staff accounts on this domain can be promoted to platform_admin from the admin UI. */
export const PLATFORM_ADMIN_EMAIL_DOMAIN = "lotttechnologies.com";

export function isPlatformAdminEligibleEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 1) return false;
  return normalized.slice(at + 1) === PLATFORM_ADMIN_EMAIL_DOMAIN;
}

/** Promote listed existing users to platform_admin. Does not create users or touch other accounts. */
export async function applyPlatformAdminAllowlist(prisma: PrismaClient): Promise<void> {
  const emails = platformAdminEmails(env.PLATFORM_ADMIN_EMAILS);
  for (const email of emails) {
    await prisma.user.updateMany({
      where: { email: { equals: email, mode: "insensitive" } },
      // Legacy flag kept in sync for older readers.
      // Pinned emails are the way back in, so they always hold the top role.
      data: { accountType: "platform_admin", isAdmin: true, staffRole: "super_admin" },
    });
  }
}
