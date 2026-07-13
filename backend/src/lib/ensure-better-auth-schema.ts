import type { PrismaClient } from "@prisma/client";

/**
 * Recreate Better Auth core tables in `neon_auth` when Neon Auth Console
 * disable ran with delete_data (schema wiped). Idempotent.
 *
 * UUID PKs + defaults match Neon Auth / our Better Auth `generateId: "uuid"` config.
 */
export async function ensureBetterAuthSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS neon_auth`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth."user" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        "emailVerified" BOOLEAN NOT NULL DEFAULT false,
        image TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        role TEXT,
        banned BOOLEAN,
        "banReason" TEXT,
        "banExpires" TIMESTAMPTZ
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_email_key ON neon_auth."user" (email)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth.session (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "expiresAt" TIMESTAMPTZ NOT NULL,
        token TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "userId" UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
        "impersonatedBy" TEXT,
        "activeOrganizationId" TEXT
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS session_token_key ON neon_auth.session (token)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth.account (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "accountId" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "userId" UUID NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
        "accessToken" TEXT,
        "refreshToken" TEXT,
        "idToken" TEXT,
        "accessTokenExpiresAt" TIMESTAMPTZ,
        "refreshTokenExpiresAt" TIMESTAMPTZ,
        scope TEXT,
        password TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth.verification (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth.jwks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "publicKey" TEXT NOT NULL,
        "privateKey" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMPTZ
      )
    `);

    console.log("[ensure-better-auth-schema] neon_auth core tables ready");
  } catch (err) {
    console.error("[ensure-better-auth-schema] failed:", err);
    throw err;
  }
}
