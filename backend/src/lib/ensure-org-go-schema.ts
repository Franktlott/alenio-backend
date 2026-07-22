import type { PrismaClient } from "@prisma/client";

/** Creates org Go module/assignment tables and org library columns (idempotent). */
export async function ensureOrgGoSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`SET search_path TO public`);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."OrganizationModule" (
        "id" TEXT NOT NULL,
        "organizationId" TEXT NOT NULL,
        "moduleKey" TEXT NOT NULL,
        "moduleName" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "defaultsJson" JSONB NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationModule_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationModule_organizationId_moduleKey_key"
      ON public."OrganizationModule"("organizationId", "moduleKey");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationModule_organizationId_idx"
      ON public."OrganizationModule"("organizationId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."OrganizationModuleAssignment" (
        "id" TEXT NOT NULL,
        "organizationModuleId" TEXT NOT NULL,
        "scope" TEXT NOT NULL DEFAULT 'organization',
        "allowScheduleEdits" BOOLEAN NOT NULL DEFAULT true,
        "allowEquipmentAdditions" BOOLEAN NOT NULL DEFAULT true,
        "allowLocalNotes" BOOLEAN NOT NULL DEFAULT true,
        "allowLocalNotifications" BOOLEAN NOT NULL DEFAULT true,
        "allowTemplateEdits" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "OrganizationModuleAssignment_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationModuleAssignment_organizationModuleId_idx"
      ON public."OrganizationModuleAssignment"("organizationModuleId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public."OrganizationModuleAssignmentTeam" (
        "id" TEXT NOT NULL,
        "assignmentId" TEXT NOT NULL,
        "teamId" TEXT NOT NULL,
        CONSTRAINT "OrganizationModuleAssignmentTeam_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationModuleAssignmentTeam_assignmentId_teamId_key"
      ON public."OrganizationModuleAssignmentTeam"("assignmentId", "teamId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "OrganizationModuleAssignmentTeam_teamId_idx"
      ON public."OrganizationModuleAssignmentTeam"("teamId");
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."WorkspaceModule"
        ADD COLUMN IF NOT EXISTS "organizationModuleId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WorkspaceModule_organizationModuleId_idx"
      ON public."WorkspaceModule"("organizationModuleId");
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."WalkLibraryItem"
        ALTER COLUMN "teamId" DROP NOT NULL;
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE public."WalkLibraryItem"
        ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkLibraryItem_organizationId_status_idx"
      ON public."WalkLibraryItem"("organizationId", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "WalkLibraryItem_organizationId_type_idx"
      ON public."WalkLibraryItem"("organizationId", "type");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationModule"
          ADD CONSTRAINT "OrganizationModule_organizationId_fkey"
          FOREIGN KEY ("organizationId") REFERENCES public."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationModuleAssignment"
          ADD CONSTRAINT "OrganizationModuleAssignment_organizationModuleId_fkey"
          FOREIGN KEY ("organizationModuleId") REFERENCES public."OrganizationModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationModuleAssignmentTeam"
          ADD CONSTRAINT "OrganizationModuleAssignmentTeam_assignmentId_fkey"
          FOREIGN KEY ("assignmentId") REFERENCES public."OrganizationModuleAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE public."OrganizationModuleAssignmentTeam"
          ADD CONSTRAINT "OrganizationModuleAssignmentTeam_teamId_fkey"
          FOREIGN KEY ("teamId") REFERENCES public."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] ensureOrgGoSchema ok");
  } catch (err) {
    console.error("[startup] ensureOrgGoSchema failed:", err);
  }
}
