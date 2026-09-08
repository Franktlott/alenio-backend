import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureMomentumSchema } from "./ensure-momentum-schema";

describe("ensureMomentumSchema", () => {
  test("uses an idempotent additive rollout and keeps evidence independent of tasks", async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (statement: string) => {
        statements.push(statement.replace(/\s+/g, " ").trim());
        return 0;
      },
    } as unknown as PrismaClient;

    await ensureMomentumSchema(prisma);
    await ensureMomentumSchema(prisma);

    expect(statements).toHaveLength(26);
    const firstRun = statements.slice(0, 13).join("\n");
    expect(firstRun).toContain('ALTER TABLE "TeamMember" ADD COLUMN "currentStreak"');
    expect(firstRun).toContain('ALTER TABLE "TeamMember" ADD COLUMN "personalBestStreak"');
    expect(firstRun).toContain('CREATE TABLE IF NOT EXISTS "MomentumCompletionCredit"');
    expect(firstRun).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "MomentumCompletionCredit_teamId_sourceTaskId_creditedUserId_key"',
    );
    expect(firstRun).toContain(
      'FOREIGN KEY ("creditedTeamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL',
    );
    expect(firstRun).not.toContain(
      'FOREIGN KEY ("sourceTaskId") REFERENCES "Task"("id")',
    );
    expect(statements.slice(13)).toEqual(statements.slice(0, 13));
  });
});
