import type { PrismaClient } from "@prisma/client";

export type BetterAuthSchemaEnsureResult = {
  ok: boolean;
  steps: string[];
  error?: string;
  tables?: string[];
};

/**
 * Recreate Better Auth core tables in `neon_auth` when Neon Auth Console
 * disable ran with delete_data (schema wiped). Idempotent.
 *
 * UUID PKs + defaults match Neon Auth / our Better Auth `generateId: "uuid"` config.
 */
export async function ensureBetterAuthSchema(prisma: PrismaClient): Promise<BetterAuthSchemaEnsureResult> {
  const steps: string[] = [];
  try {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS neon_auth`);
    steps.push("schema");

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
    steps.push("user");
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_email_key ON neon_auth."user" (email)
    `);
    steps.push("user_email_idx");

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
    steps.push("session");
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS session_token_key ON neon_auth.session (token)
    `);
    steps.push("session_token_idx");

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
    steps.push("account");

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
    steps.push("verification");

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS neon_auth.jwks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "publicKey" TEXT NOT NULL,
        "privateKey" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMPTZ
      )
    `);
    steps.push("jwks");

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'neon_auth'
      ORDER BY table_name
    `;
    const tableNames = tables.map((t) => t.table_name);
    console.log("[ensure-better-auth-schema] ready:", tableNames.join(", ") || "(none)");
    return { ok: tableNames.includes("user"), steps, tables: tableNames };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ensure-better-auth-schema] failed:", message, err);
    return { ok: false, steps, error: message };
  }
}
