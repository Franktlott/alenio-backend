import { env } from "../env";
import { prisma } from "../prisma";

const NEON_API_BASE = "https://console.neon.tech/api/v2";

/**
 * Removes the user from Neon Auth (Better Auth tables in `neon_auth` schema).
 * App rows in `public."User"` are deleted separately.
 *
 * Tries the Neon Management API when configured; otherwise deletes via SQL on the same database.
 */
export async function deleteNeonAuthUser(authUserId: string): Promise<void> {
  const apiKey = env.NEON_API_KEY?.trim();
  const projectId = env.NEON_PROJECT_ID?.trim();
  const branchId = env.NEON_BRANCH_ID?.trim();

  if (apiKey && projectId && branchId) {
    const res = await fetch(
      `${NEON_API_BASE}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}/auth/users/${encodeURIComponent(authUserId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    );
    if (res.status === 204 || res.status === 404) {
      return;
    }
    const body = await res.text().catch(() => "");
    throw new Error(`Neon Auth API delete failed (${res.status}): ${body || res.statusText}`);
  }

  await deleteNeonAuthUserViaSql(authUserId);
}

async function deleteNeonAuthUserViaSql(authUserId: string): Promise<void> {
  try {
    await prisma.$executeRaw`DELETE FROM neon_auth.session WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM neon_auth.account WHERE "userId" = ${authUserId}`;
    await prisma.$executeRaw`DELETE FROM neon_auth.user WHERE id = ${authUserId}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("neon_auth") && (msg.includes("does not exist") || msg.includes("schema"))) {
      console.warn(
        "[delete-neon-auth-user] neon_auth schema not found; skipping SQL delete (local non-Neon DB?). authUserId=",
        authUserId,
      );
      return;
    }
    throw err;
  }
}
