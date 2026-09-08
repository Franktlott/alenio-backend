import { prisma } from "../prisma";

/**
 * Removes the user from Better Auth tables in the `neon_auth` schema.
 * App rows in `public."User"` are deleted separately.
 */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  try {
    // Neon Auth stores these identifiers as UUIDs, while Prisma binds string
    // interpolations as text. Cast explicitly so PostgreSQL can compare them.
    await prisma.$executeRaw`DELETE FROM neon_auth.session WHERE "userId" = CAST(${authUserId} AS uuid)`;
    await prisma.$executeRaw`DELETE FROM neon_auth.account WHERE "userId" = CAST(${authUserId} AS uuid)`;
    await prisma.$executeRaw`DELETE FROM neon_auth.user WHERE id = CAST(${authUserId} AS uuid)`;
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
