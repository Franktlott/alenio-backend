import type { PrismaClient } from "@prisma/client";

/**
 * Creates Organization / SSO tables and Team.organizationId if missing (idempotent).
 * Complements `prisma db push` on Railway when preDeploy is skipped.
 */
export async function ensureOrganizationSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Organization" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "ssoRequired" BOOLEAN NOT NULL DEFAULT false,
        "defaultTeamId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Organization_slug_key" ON "Organization"("slug");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Organization_defaultTeamId_key" ON "Organization"("defaultTeamId");
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Team_organizationId_idx" ON "Team"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrganizationDomain" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "domain" TEXT NOT NULL,
        "verifiedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationDomain_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationDomain_domain_key" ON "OrganizationDomain"("domain");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationDomain_organizationId_idx" ON "OrganizationDomain"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrganizationSsoConfig" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "protocol" TEXT NOT NULL DEFAULT 'oidc',
        "issuer" TEXT,
        "metadataUrl" TEXT,
        "clientId" TEXT,
        "clientSecretEnc" TEXT,
        "tenantId" TEXT,
        "entryPoint" TEXT,
        "cert" TEXT,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationSsoConfig_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationSsoConfig_organizationId_key" ON "OrganizationSsoConfig"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "OrganizationMembership" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'org_member',
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMembership_organizationId_userId_key"
      ON "OrganizationMembership"("organizationId", "userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationMembership_organizationId_idx" ON "OrganizationMembership"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Organization"
          ADD CONSTRAINT "Organization_defaultTeamId_fkey"
          FOREIGN KEY ("defaultTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Team"
          ADD CONSTRAINT "Team_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OrganizationDomain"
          ADD CONSTRAINT "OrganizationDomain_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OrganizationSsoConfig"
          ADD CONSTRAINT "OrganizationSsoConfig_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OrganizationMembership"
          ADD CONSTRAINT "OrganizationMembership_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "OrganizationMembership"
          ADD CONSTRAINT "OrganizationMembership_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SsoOidcState" (
        "id" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "payload" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SsoOidcState_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SsoOidcState_state_key" ON "SsoOidcState"("state");
    `);

    console.log("[startup] ensureOrganizationSchema ok");
  } catch (err) {
    console.error("[startup] ensureOrganizationSchema failed:", err);
  }
}
