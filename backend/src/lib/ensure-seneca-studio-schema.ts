import type { PrismaClient } from "@prisma/client";

export async function ensureSenecaStudioSchema(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaConfig" (
        "id" TEXT NOT NULL,
        "ownerType" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "version" INTEGER NOT NULL DEFAULT 1,
        "data" TEXT NOT NULL DEFAULT '{}',
        "publishedAt" TIMESTAMP(3),
        "publishedBy" TEXT,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaConfig_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SenecaConfig_ownerType_ownerId_type_version_key"
      ON "SenecaConfig"("ownerType", "ownerId", "type", "version");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SenecaConfig_ownerType_ownerId_type_status_idx"
      ON "SenecaConfig"("ownerType", "ownerId", "type", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaKnowledge" (
        "id" TEXT NOT NULL,
        "ownerType" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'general',
        "description" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "version" INTEGER NOT NULL DEFAULT 1,
        "contentText" TEXT NOT NULL DEFAULT '',
        "fileUrl" TEXT,
        "fileName" TEXT,
        "mimeType" TEXT,
        "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT,
        CONSTRAINT "SenecaKnowledge_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SenecaKnowledge_ownerType_ownerId_status_idx"
      ON "SenecaKnowledge"("ownerType", "ownerId", "status");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaKnowledgeVersion" (
        "id" TEXT NOT NULL,
        "knowledgeId" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "title" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "description" TEXT,
        "contentText" TEXT NOT NULL,
        "fileUrl" TEXT,
        "fileName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT,
        CONSTRAINT "SenecaKnowledgeVersion_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SenecaKnowledgeVersion_knowledgeId_version_key"
      ON "SenecaKnowledgeVersion"("knowledgeId", "version");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SenecaKnowledgeVersion_knowledgeId_idx"
      ON "SenecaKnowledgeVersion"("knowledgeId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaPromptTemplate" (
        "id" TEXT NOT NULL,
        "ownerType" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "templateKey" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "version" INTEGER NOT NULL DEFAULT 1,
        "instructions" TEXT NOT NULL DEFAULT '',
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT,
        CONSTRAINT "SenecaPromptTemplate_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SenecaPromptTemplate_ownerType_ownerId_templateKey_key"
      ON "SenecaPromptTemplate"("ownerType", "ownerId", "templateKey");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaPromptVersion" (
        "id" TEXT NOT NULL,
        "templateId" TEXT NOT NULL,
        "version" INTEGER NOT NULL,
        "instructions" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdBy" TEXT,
        CONSTRAINT "SenecaPromptVersion_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SenecaPromptVersion_templateId_version_key"
      ON "SenecaPromptVersion"("templateId", "version");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaGeneration" (
        "id" TEXT NOT NULL,
        "ownerType" TEXT NOT NULL,
        "ownerId" TEXT NOT NULL,
        "userId" TEXT,
        "source" TEXT NOT NULL DEFAULT 'ask',
        "model" TEXT,
        "promptVersion" TEXT,
        "knowledgeUsed" TEXT,
        "contextUsed" TEXT,
        "question" TEXT,
        "response" TEXT,
        "systemPrompt" TEXT,
        "tokensIn" INTEGER,
        "tokensOut" INTEGER,
        "latencyMs" INTEGER,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaGeneration_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "SenecaGeneration_ownerType_ownerId_createdAt_idx"
      ON "SenecaGeneration"("ownerType", "ownerId", "createdAt");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SenecaGenerationFeedback" (
        "id" TEXT NOT NULL,
        "generationId" TEXT NOT NULL,
        "rating" TEXT NOT NULL,
        "note" TEXT,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SenecaGenerationFeedback_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "SenecaGenerationFeedback_generationId_key"
      ON "SenecaGenerationFeedback"("generationId");
    `);
  } catch (e) {
    console.warn("[ensureSenecaStudioSchema]", e instanceof Error ? e.message : e);
  }
}
