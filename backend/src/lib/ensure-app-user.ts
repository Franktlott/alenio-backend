import { prisma } from "../prisma";
import type { AppUser } from "../auth";

export type SyncMatchedBy = "auth_user_id" | "email" | "created";

export type SyncedAppUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

function logSyncFailure(message: string, err: unknown) {
  console.error(`[ensure-app-user] ${message}`, err);
}

/**
 * Ensures a Prisma `User` row exists for the given Neon Auth identity (id, email, name, image).
 * Idempotent: safe to call on every authenticated request.
 */
export async function syncAppUserFromNeonAuth(authUser: AppUser): Promise<{
  user: SyncedAppUser;
  matchedBy: SyncMatchedBy;
} | null> {
  const sessionEmail = authUser.email?.trim() ?? null;
  let matchedBy: SyncMatchedBy | "none" = "none";
  let user: SyncedAppUser | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, name: true, image: true },
    });
    if (user) {
      matchedBy = "auth_user_id";
      if (sessionEmail && user.email !== sessionEmail) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            email: sessionEmail,
            name: authUser.name ?? user.name ?? sessionEmail.split("@")[0] ?? "User",
            image: authUser.image ?? user.image ?? undefined,
          },
          select: { id: true, email: true, name: true, image: true },
        });
      }
    } else if (sessionEmail) {
      const byEmail = await prisma.user.findUnique({
        where: { email: sessionEmail },
        select: { id: true, email: true, name: true, image: true },
      });
      if (byEmail) {
        matchedBy = "email";
        user = byEmail;
      } else {
        try {
          user = await prisma.user.create({
            data: {
              id: authUser.id,
              email: sessionEmail,
              name: authUser.name ?? sessionEmail.split("@")[0] ?? "User",
              image: authUser.image ?? undefined,
              emailVerified: true,
            },
            select: { id: true, email: true, name: true, image: true },
          });
          matchedBy = "created";
        } catch (err) {
          const code = (err as { code?: string } | null)?.code;
          if (code === "P2002") {
            user = await prisma.user.findUnique({
              where: { email: sessionEmail },
              select: { id: true, email: true, name: true, image: true },
            });
            matchedBy = user ? "email" : "none";
          } else {
            logSyncFailure(`failed to create user row for Neon auth id=${authUser.id}`, err);
            return null;
          }
        }
      }
    } else {
      const stableLocal = authUser.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      const stableEmail = `${stableLocal}@users.internal.invalid`;
      try {
        user = await prisma.user.create({
          data: {
            id: authUser.id,
            email: stableEmail,
            name: authUser.name?.trim() || "User",
            image: authUser.image ?? undefined,
            emailVerified: false,
          },
          select: { id: true, email: true, name: true, image: true },
        });
        matchedBy = "created";
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "P2002") {
          user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { id: true, email: true, name: true, image: true },
          });
          matchedBy = user ? "auth_user_id" : "none";
        } else {
          logSyncFailure(`failed to create placeholder-email user for Neon auth id=${authUser.id}`, err);
          return null;
        }
      }
    }
  } catch (err) {
    logSyncFailure(`unexpected error syncing Neon auth user id=${authUser.id}`, err);
    return null;
  }

  if (!user) {
    logSyncFailure(
      `could not resolve app user row for Neon auth id=${authUser.id} email=${sessionEmail ?? "null"}`,
      new Error("syncAppUserFromNeonAuth_no_row"),
    );
    return null;
  }

  if (matchedBy === "none") {
    logSyncFailure(`inconsistent sync state for Neon auth id=${authUser.id}`, new Error("syncAppUserFromNeonAuth_matched_none"));
    return null;
  }

  return { user, matchedBy };
}
