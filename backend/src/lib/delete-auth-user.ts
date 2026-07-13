import { prisma } from "../prisma";

/**
 * Removes the user from Better Auth tables in the `neon_auth` schema.
 * App rows in `public."User"` are deleted separately.
 */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM neon_auth.session WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM neon_auth.account WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM neon_auth.user WHERE id = ${authUserId}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("neon_auth") && (msg.includes("does not exist") || msg.includes("schema"))) {
      console.warn(
        "[delete-auth-user] neon_auth schema not found; skipping SQL delete. authUserId=",
        authUserId,
      );
      return;
    }
    throw err;
  }
}
