/**
 * Fast Railway pre-deploy patches. A full `prisma db push` is not run here
 * because a schema diff against Neon has been failing these deploys.
 */
import { PrismaClient } from "@prisma/client";
import { ensureActivityAudienceSchema } from "../src/lib/ensure-activity-audience-schema";
import { ensureActivityCommentsSchema } from "../src/lib/ensure-activity-comments-schema";
import { ensureHomeWorkspaceSchema } from "../src/lib/ensure-home-workspace-schema";
import { ensureNetworkUpdateHidesSchema } from "../src/lib/ensure-network-update-hides-schema";

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

  const networkUpdateHides = await ensureNetworkUpdateHidesSchema(prisma);
  if (!networkUpdateHides.ok) {
    throw new Error(networkUpdateHides.error);
  }
  console.log("predeploy-additive-schema: NetworkUpdateHide ready");

  const activityAudience = await ensureActivityAudienceSchema(prisma);
  if (!activityAudience.ok) {
    throw new Error(activityAudience.error);
  }
  console.log("predeploy-additive-schema: TeamActivity audience ready");

  const activityComments = await ensureActivityCommentsSchema(prisma);
  if (!activityComments.ok) {
    throw new Error(activityComments.error);
  }
  console.log("predeploy-additive-schema: activity comments and lock state ready");

  await ensureHomeWorkspaceSchema(prisma);
  console.log("predeploy-additive-schema: HomeWorkspaceCard ready");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."HomeWorkspaceSettings"
      ADD COLUMN IF NOT EXISTS "cadence" TEXT NOT NULL DEFAULT 'weekly'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE public."HomeWorkspaceSettings"
      ADD COLUMN IF NOT EXISTS "epochAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  console.log("predeploy-additive-schema: HomeWorkspaceSettings cadence ready");
} catch (err) {
  console.error(
    "predeploy-additive-schema: patch failed, continuing deploy for startup fallback:",
    err,
  );
} finally {
  await prisma.$disconnect();
}
