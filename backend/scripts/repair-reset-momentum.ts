import { Prisma, PrismaClient } from "@prisma/client";
import { ensureMomentumSchema } from "../src/lib/ensure-momentum-schema";
import { planMomentumProjectionRepairs } from "../src/lib/momentum-repair";

type Options = {
  apply: boolean;
  reset: boolean;
  teamId: string | null;
};

function usage(): string {
  return [
    "Usage: bun run scripts/repair-reset-momentum.ts [--reset] [--team TEAM_ID] [--apply]",
    "",
    "Dry-run is the default. --apply is required to write projection repairs.",
    "--reset performs the initial canonical reset: members without credits become zero.",
    "Both modes use only existing non-revoked MomentumCompletionCredit rows.",
  ].join("\n");
}

function parseOptions(args: readonly string[]): Options {
  const options: Options = { apply: false, reset: false, teamId: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--reset") options.reset = true;
    else if (arg === "--team") {
      const teamId = args[index + 1]?.trim();
      if (!teamId || teamId.startsWith("--")) throw new Error("--team requires a team id.");
      options.teamId = teamId;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return options;
}

function printable(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    await ensureMomentumSchema(prisma);
    const result = await prisma.$transaction(async (tx) => {
      if (options.teamId) {
        const team = await tx.team.findUnique({
          where: { id: options.teamId },
          select: { id: true },
        });
        if (!team) throw new Error(`Team ${options.teamId} was not found.`);
      }

      const teamWhere = options.teamId ? { teamId: options.teamId } : {};
      const [members, activeCredits] = await Promise.all([
        tx.teamMember.findMany({
          where: teamWhere,
          select: {
            id: true,
            teamId: true,
            userId: true,
            currentStreak: true,
            personalBestStreak: true,
            personalBestCelebrated: true,
            momentumRunStartedAt: true,
            momentumLastQualifiedAt: true,
          },
        }),
        tx.momentumCompletionCredit.findMany({
          where: { ...teamWhere, revokedAt: null },
          select: {
            id: true,
            teamId: true,
            creditedUserId: true,
            completedAt: true,
            onTime: true,
          },
        }),
      ]);

      const repairs = planMomentumProjectionRepairs(
        members.map((member) => ({ ...member, teamMemberId: member.id })),
        activeCredits,
      );

      if (options.apply) {
        for (const repair of repairs) {
          await tx.teamMember.update({
            where: { id: repair.teamMemberId },
            data: repair.after,
          });
        }
      }

      return {
        memberCount: members.length,
        activeCreditCount: activeCredits.length,
        repairs,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const operation = options.reset ? "reset" : "repair";
    const scope = options.teamId ? `team ${options.teamId}` : "all teams";
    console.log(
      `Momentum ${operation} ${options.apply ? "applied" : "dry-run"} for ${scope}: ` +
      `${result.memberCount} members, ${result.activeCreditCount} active credits, ` +
      `${result.repairs.length} projections with drift.`,
    );
    for (const repair of result.repairs) {
      console.log(printable({
        teamId: repair.teamId,
        userId: repair.userId,
        changedFields: repair.changedFields,
        before: repair.before,
        after: repair.after,
      }));
    }
    if (!options.apply && result.repairs.length > 0) {
      console.log("No changes written. Re-run with --apply after reviewing this report.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Momentum repair failed.");
  process.exitCode = 1;
});
