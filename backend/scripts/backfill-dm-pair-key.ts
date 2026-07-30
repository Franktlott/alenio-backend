/**
 * Backfill Conversation.dmPairKey for 1:1 DMs.
 * Does not delete duplicates — logs losers for manual review.
 *
 * Usage: npx tsx scripts/backfill-dm-pair-key.ts
 */
import { PrismaClient } from "@prisma/client";
import { buildDmPairKey } from "../src/lib/dm-pair-key";

const prisma = new PrismaClient();

type DmRow = {
  id: string;
  dmPairKey: string | null;
  updatedAt: Date;
  participants: Array<{ userId: string }>;
  _count: { messages: number };
};

async function main() {
  const dms = (await prisma.conversation.findMany({
    where: { isGroup: false },
    include: {
      participants: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  })) as DmRow[];

  const byKey = new Map<string, DmRow[]>();
  let set = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const conv of dms) {
    if (conv.participants.length !== 2) {
      skipped += 1;
      console.warn(`[skip] ${conv.id}: expected 2 participants, got ${conv.participants.length}`);
      continue;
    }
    const a = conv.participants[0];
    const b = conv.participants[1];
    if (!a || !b) {
      skipped += 1;
      continue;
    }
    const key = buildDmPairKey(a.userId, b.userId);
    const bucket = byKey.get(key) ?? [];
    bucket.push(conv);
    byKey.set(key, bucket);
  }

  for (const [key, group] of byKey) {
    group.sort((a, b) => {
      const msgDiff = b._count.messages - a._count.messages;
      if (msgDiff !== 0) return msgDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
    const winner = group[0];
    if (!winner) continue;
    if (!winner.dmPairKey) {
      await prisma.conversation.update({
        where: { id: winner.id },
        data: { dmPairKey: key },
      });
      set += 1;
    }
    for (const loser of group.slice(1)) {
      conflicts += 1;
      if (loser.dmPairKey) {
        await prisma.conversation.update({
          where: { id: loser.id },
          data: { dmPairKey: null },
        });
      }
      console.warn(
        `[conflict] key=${key} keep=${winner.id} (msgs=${winner._count.messages}) leave=${loser.id} (msgs=${loser._count.messages})`,
      );
    }
  }

  console.log(JSON.stringify({ set, skipped, conflicts, total: dms.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
