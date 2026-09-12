/**
 * Fast Railway pre-deploy patches. A full `prisma db push` is not run here
 * because a schema diff against Neon has been failing these deploys.
 */
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("predeploy-additive-schema: DATABASE_URL is not set");
  process.exit(0);
}

function withPublicSchema(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const current = url.searchParams.get("schema");
    if (current && current !== "public") {
      console.error(`predeploy-additive-schema: leaving schema=${current} unchanged`);
      return connectionString;
    }
    url.searchParams.set("schema", "public");
    return url.toString();
  } catch {
    return connectionString;
  }
}

process.env.DATABASE_URL = withPublicSchema(raw);
const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."CalendarEvent"
      ADD COLUMN IF NOT EXISTS "image" TEXT
  `);
  console.log("predeploy-additive-schema: CalendarEvent.image ready");
} catch (err) {
  console.error(
    "predeploy-additive-schema: patch failed, continuing deploy for startup fallback:",
    err,
  );
} finally {
  await prisma.$disconnect();
}
