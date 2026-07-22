import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { syncAppUserFromAuth } from "./ensure-app-user";
import { normalizeEmailDomain } from "./organization-sso";
import type { OktaUserClaims } from "./okta-oidc";

const SESSION_DAYS = 14;

export type OktaSsoLoginResult =
  | { ok: true; token: string; userId: string; email: string }
  | { ok: false; message: string };

async function findOrCreateAuthUser(claims: OktaUserClaims): Promise<{ id: string; email: string; name: string }> {
  const email = claims.email.trim().toLowerCase();
  const name = (claims.name?.trim() || email.split("@")[0] || "User").slice(0, 200);

  const existing = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; name: string }>>(
    `SELECT id::text AS id, email, name FROM neon_auth."user" WHERE lower(email) = lower($1) LIMIT 1`,
    email,
  );
  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE neon_auth."user"
       SET name = $2, "emailVerified" = true, "updatedAt" = NOW()
       WHERE id = $1::uuid`,
      existing[0].id,
      name,
    );
    return { id: existing[0].id, email, name };
  }

  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3, true, NOW(), NOW())`,
    id,
    name,
    email,
  );
  return { id, email, name };
}

async function upsertOktaAccount(input: {
  userId: string;
  organizationId: string;
  oktaSub: string;
  accessToken: string;
  idToken?: string;
}) {
  const providerId = `okta:${input.organizationId}`;
  const accountId = input.oktaSub;
  const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text AS id FROM neon_auth.account
     WHERE "providerId" = $1 AND "accountId" = $2
     LIMIT 1`,
    providerId,
    accountId,
  );

  if (existing[0]) {
    await prisma.$executeRawUnsafe(
      `UPDATE neon_auth.account
       SET "userId" = $2::uuid,
           "accessToken" = $3,
           "idToken" = $4,
           "updatedAt" = NOW()
       WHERE id = $1::uuid`,
      existing[0].id,
      input.userId,
      input.accessToken,
      input.idToken ?? null,
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO neon_auth.account
      (id, "accountId", "providerId", "userId", "accessToken", "idToken", "createdAt", "updatedAt")
     VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, NOW(), NOW())`,
    randomUUID(),
    accountId,
    providerId,
    input.userId,
    input.accessToken,
    input.idToken ?? null,
  );
}

async function createBearerSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.$executeRawUnsafe(
    `INSERT INTO neon_auth.session
      (id, "expiresAt", token, "createdAt", "updatedAt", "userId")
     VALUES ($1::uuid, $2::timestamptz, $3, NOW(), NOW(), $4::uuid)`,
    randomUUID(),
    expiresAt.toISOString(),
    token,
    userId,
  );
  return token;
}

async function ensureOrgMembership(organizationId: string, userId: string) {
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, role: "org_member" },
    update: {},
  });

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultTeamId: true },
  });
  if (!org?.defaultTeamId) return;

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: org.defaultTeamId } },
    select: { id: true },
  });
  if (existing) return;

  await prisma.teamMember.create({
    data: {
      userId,
      teamId: org.defaultTeamId,
      role: "member",
    },
  });
}

/**
 * Completes Okta SSO: validate domain, provision auth + app user, create bearer session.
 */
export async function completeOktaSsoLogin(input: {
  organizationId: string;
  expectedDomain: string;
  claims: OktaUserClaims;
  accessToken: string;
  idToken?: string;
}): Promise<OktaSsoLoginResult> {
  const emailDomain = normalizeEmailDomain(input.claims.email);
  const expected = normalizeEmailDomain(input.expectedDomain);
  if (!emailDomain || !expected || emailDomain !== expected) {
    return {
      ok: false,
      message: `Your Okta email must use @${expected ?? "the company domain"}`,
    };
  }
  if (!input.claims.emailVerified) {
    return { ok: false, message: "Verify your email in Okta, then try again." };
  }

  try {
    const authUser = await findOrCreateAuthUser(input.claims);
    await upsertOktaAccount({
      userId: authUser.id,
      organizationId: input.organizationId,
      oktaSub: input.claims.sub,
      accessToken: input.accessToken,
      idToken: input.idToken,
    });

    const synced = await syncAppUserFromAuth({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      image: null,
    });
    if (!synced) {
      return { ok: false, message: "Could not create your Alenio account from Okta." };
    }

    await ensureOrgMembership(input.organizationId, synced.user.id);
    const token = await createBearerSession(authUser.id);
    return { ok: true, token, userId: synced.user.id, email: authUser.email };
  } catch (err) {
    console.error("[okta-sso] login failed:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Okta sign-in failed",
    };
  }
}
