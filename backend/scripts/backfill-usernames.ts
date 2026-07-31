/**
 * Assign a global Alenio handle to every user still missing one.
 *
 * Login already backfills lazily via syncAppUserFromAuth, so this exists to cover
 * dormant accounts that would otherwise stay handle-less until they next sign in.
 * Idempotent: users that already have a username are left alone.
 *
 * Usage: bun run scripts/backfill-usernames.ts
 */
import { prisma } from "../src/prisma";
import { ensureUsernameSchema } from "../src/lib/ensure-username-schema";
import { allocateUsername } from "../src/lib/username";

async function main() {
  await ensureUsernameSchema(prisma);

  const pending = await prisma.user.findMany({
    where: { username: null },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });

  let assigned = 0;
  const failed: string[] = [];

  for (const user of pending) {
    try {
      const username = await allocateUsername(prisma, user);
      if (username) {
        assigned += 1;
      } else {
        failed.push(user.id);
        console.warn(`[backfill-usernames] exhausted candidates for ${user.id}`);
      }
    } catch (err) {
      failed.push(user.id);
      console.error(`[backfill-usernames] failed for ${user.id}`, err);
    }
  }

  console.log(
    JSON.stringify({ pending: pending.length, assigned, failed: failed.length }, null, 2),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
