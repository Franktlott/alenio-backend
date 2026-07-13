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

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/**
 * Ensures a Prisma `User` row exists for the given Better Auth identity (id, email, name, image).
 * Idempotent: safe to call on every authenticated request.
 *
 * Also repairs a common split-identity case: an older admin/bootstrap row keyed by email
 * while a later auth-id row is what sessions bind to. Admin flags are merged onto the
 * auth-id row so platform admin UI keeps working.
 */
export async function syncAppUserFromAuth(authUser: AppUser): Promise<{
  user: SyncedAppUser;
  matchedBy: SyncMatchedBy;
} | null> {
  const sessionEmail = normalizeEmail(authUser.email);
  let matchedBy: SyncMatchedBy | "none" = "none";
  let user: SyncedAppUser | null = null;

  try {
    const byId = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, name: true, image: true, isAdmin: true },
    });

    const byEmail = sessionEmail
      ? await prisma.user.findFirst({
          where: { email: { equals: sessionEmail, mode: "insensitive" } },
          select: { id: true, email: true, name: true, image: true, isAdmin: true },
        })
      : null;

    if (byId) {
      matchedBy = "auth_user_id";
      user = {
        id: byId.id,
        email: byId.email,
        name: byId.name,
        image: byId.image,
      };

      const updates: {
        email?: string;
        name?: string;
        image?: string | null;
        isAdmin?: boolean;
      } = {};

      if (sessionEmail && byId.email !== sessionEmail) {
        // Avoid clobbering another account's unique email; only rewrite when free or ours.
        if (!byEmail || byEmail.id === byId.id) {
          updates.email = sessionEmail;
        }
      }
      if (authUser.name && authUser.name !== byId.name) {
        updates.name = authUser.name;
      }
      if (authUser.image !== undefined && authUser.image !== byId.image) {
        updates.image = authUser.image ?? null;
      }
      // Merge platform admin from a legacy email-keyed row onto the Neon-id session row.
      if (!byId.isAdmin && byEmail && byEmail.id !== byId.id && byEmail.isAdmin) {
        updates.isAdmin = true;
        console.warn(
          `[ensure-app-user] merged isAdmin from legacy email row ${byEmail.id} onto neon-id row ${byId.id}`,
        );
      }

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: byId.id },
          data: updates,
          select: { id: true, email: true, name: true, image: true },
        });
      }
    } else if (byEmail) {
      matchedBy = "email";
      user = {
        id: byEmail.id,
        email: byEmail.email,
        name: byEmail.name,
        image: byEmail.image,
      };
      // Keep profile fields fresh even when bound via email.
      const updates: { name?: string; image?: string | null } = {};
      if (authUser.name && authUser.name !== byEmail.name) updates.name = authUser.name;
      if (authUser.image !== undefined && authUser.image !== byEmail.image) {
        updates.image = authUser.image ?? null;
      }
      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: updates,
          select: { id: true, email: true, name: true, image: true },
        });
      }
    } else if (sessionEmail) {
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
          // Race: email or id inserted concurrently. Prefer auth id, then email.
          user = await prisma.user.findUnique({
            where: { id: authUser.id },
            select: { id: true, email: true, name: true, image: true },
          });
          if (user) {
            matchedBy = "auth_user_id";
          } else {
            user = await prisma.user.findFirst({
              where: { email: { equals: sessionEmail, mode: "insensitive" } },
              select: { id: true, email: true, name: true, image: true },
            });
            matchedBy = user ? "email" : "none";
          }
        } else {
          logSyncFailure(`failed to create user row for auth id=${authUser.id}`, err);
          return null;
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
          logSyncFailure(`failed to create placeholder-email user for auth id=${authUser.id}`, err);
          return null;
        }
      }
    }
  } catch (err) {
    logSyncFailure(`unexpected error syncing auth user id=${authUser.id}`, err);
    return null;
  }

  if (!user) {
    logSyncFailure(
      `could not resolve app user row for auth id=${authUser.id} email=${sessionEmail ?? "null"}`,
      new Error("syncAppUserFromAuth_no_row"),
    );
    return null;
  }

  if (matchedBy === "none") {
    logSyncFailure(`inconsistent sync state for auth id=${authUser.id}`, new Error("syncAppUserFromAuth_matched_none"));
    return null;
  }

  if (matchedBy === "created") {
    const { notifyAdminsNewUser } = await import("./admin-push");
    void notifyAdminsNewUser(user).catch((err) =>
      console.warn("[ensure-app-user] admin push failed", err),
    );
  }

  return { user, matchedBy };
}
