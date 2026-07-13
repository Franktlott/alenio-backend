import { prisma } from "../prisma";
import { sendEmailVerificationOtp, verifyEmailVerificationOtp } from "../auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export async function assertEmailAvailableForUser(userId: string, newEmail: string, currentEmail: string | null) {
  if (currentEmail && newEmail === currentEmail.trim().toLowerCase()) {
    throw new Error("That is already your email address.");
  }

  const taken = await prisma.user.findFirst({
    where: { email: newEmail, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) {
    throw new Error("That email is already in use on another account.");
  }
}

export async function requestEmailChange(userId: string, currentEmail: string | null, newEmail: string) {
  await assertEmailAvailableForUser(userId, newEmail, currentEmail);
  await sendEmailVerificationOtp(newEmail);
}

export async function confirmEmailChange(
  userId: string,
  currentEmail: string | null,
  newEmail: string,
  otp: string,
) {
  await assertEmailAvailableForUser(userId, newEmail, currentEmail);
  await verifyEmailVerificationOtp(newEmail, otp);
  await updateAuthUserEmail(userId, newEmail);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, emailVerified: true },
    select: { id: true, name: true, email: true, image: true, timezone: true },
  });

  return updated;
}

async function updateAuthUserEmail(userId: string, newEmail: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      UPDATE neon_auth."user"
      SET email = ${newEmail}, "emailVerified" = true, "updatedAt" = NOW()
      WHERE id = ${userId}
    `;
    await prisma.$executeRaw`
      UPDATE neon_auth.account
      SET "accountId" = ${newEmail}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND "providerId" = 'credential'
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("neon_auth") && (msg.includes("does not exist") || msg.includes("schema"))) {
      console.warn("[email-change] neon_auth schema not found; updated app user email only. userId=", userId);
      return;
    }
    throw err;
  }
}
