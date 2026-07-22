import type { PrismaClient } from "@prisma/client";

/**
 * Creates Organization / SSO tables and Team.organizationId if missing (idempotent).
 * Complements `prisma db push` on Railway when preDeploy is skipped.
 */
export async function ensureOrganizationSchema(prisma: PrismaClient): Promise<void> {
  try {
    // Prod DB URLs often set search_path=neon_auth,public for Better Auth.
    // Organization tables must live in public for the app Prisma client.
    await prisma.$executeRawUnsafe(`SET search_path TO public`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."Organization" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'active',
        "accountType" TEXT NOT NULL DEFAULT 'enterprise',
        "ssoRequired" BOOLEAN NOT NULL DEFAULT false,
        "defaultTeamId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."Organization"
        ADD COLUMN IF NOT EXISTS "accountType" TEXT NOT NULL DEFAULT 'enterprise';
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

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."OrganizationScimConfig" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT false,
        "tokenHash" TEXT,
        "tokenPrefix" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationScimConfig_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationScimConfig_organizationId_key"
      ON public."OrganizationScimConfig"("organizationId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationScimConfig"
          ADD CONSTRAINT "OrganizationScimConfig_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."OrganizationScimUser" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "userName" TEXT NOT NULL,
        "externalId" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "givenName" TEXT,
        "familyName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationScimUser_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationScimUser_organizationId_userName_key"
      ON public."OrganizationScimUser"("organizationId", "userName");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationScimUser_organizationId_userId_key"
      ON public."OrganizationScimUser"("organizationId", "userId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationScimUser_organizationId_active_idx"
      ON public."OrganizationScimUser"("organizationId", "active");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationScimUser_userId_idx" ON public."OrganizationScimUser"("userId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationScimUser"
          ADD CONSTRAINT "OrganizationScimUser_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationScimUser"
          ADD CONSTRAINT "OrganizationScimUser_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] ensureOrganizationSchema ok");
  } catch (err) {
    console.error("[startup] ensureOrganizationSchema failed:", err);
  }
}
