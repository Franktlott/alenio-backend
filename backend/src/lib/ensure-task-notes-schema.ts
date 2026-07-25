import type { PrismaClient } from "@prisma/client";

/** Creates the collaborative task-notes table if missing (idempotent). */
export async function ensureTaskNotesSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TaskNote" (
        "id" TEXT NOT NULL,
        "taskId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TaskNote_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TaskNote_taskId_createdAt_idx"
        ON "TaskNote"("taskId", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TaskNote"
          ADD CONSTRAINT "TaskNote_taskId_fkey"
          FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "TaskNote"
          ADD CONSTRAINT "TaskNote_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log("[startup] task notes database table ensured");
  } catch (err) {
    console.error("[startup] ensureTaskNotesSchema failed:", err);
  }
}
