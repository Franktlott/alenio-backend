import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureTaskKindSchema } from "./ensure-task-kind-schema";

async function collectStatements(runs = 1): Promise<string[]> {
  const statements: string[] = [];
  const prisma = {
    $executeRawUnsafe: async (statement: string) => {
      statements.push(statement.replace(/\s+/g, " ").trim());
      return 0;
    },
  } as unknown as PrismaClient;

  for (let run = 0; run < runs; run += 1) {
    await ensureTaskKindSchema(prisma);
  }
  return statements;
}

describe("ensureTaskKindSchema", () => {
  test("gives every legacy row conservative defaults without backfills or credit mutation", async () => {
    const sql = (await collectStatements()).join("\n");
    expect(sql).toContain(
      `ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'workspace_task'`,
    );
    expect(sql).toContain(
      `ADD COLUMN IF NOT EXISTS "momentumEligible" BOOLEAN NOT NULL DEFAULT false`,
    );
    expect(sql).not.toContain(`UPDATE "Task" SET`);
    expect(sql).not.toContain(`UPDATE "RecurrenceSeries" SET`);
    expect(sql).not.toContain(`"MomentumCompletionCredit"`);
  });

  test("installs valid kind and reminder eligibility constraints on both tables", async () => {
    const sql = (await collectStatements()).join("\n");
    expect(sql).toContain(`CONSTRAINT "Task_kind_check"`);
    expect(sql).toContain(`CONSTRAINT "Task_reminder_momentumEligible_check"`);
    expect(sql).toContain(`CONSTRAINT "RecurrenceSeries_kind_check"`);
    expect(sql).toContain(
      `CONSTRAINT "RecurrenceSeries_reminder_momentumEligible_check"`,
    );
    expect(sql).toContain(`CHECK ("kind" IN ('workspace_task', 'reminder'))`);
    expect(sql).toContain(
      `CHECK ("kind" <> 'reminder' OR "momentumEligible" = false)`,
    );
  });

  test("replaces prior triggers so kind and eligibility are immutable, idempotently", async () => {
    const statements = await collectStatements(2);
    expect(statements).toHaveLength(22);
    const firstRun = statements.slice(0, 11);
    const sql = firstRun.join("\n");

    expect(sql).toContain(`NEW."kind" IS DISTINCT FROM OLD."kind"`);
    expect(sql).toContain(
      `NEW."momentumEligible" IS DISTINCT FROM OLD."momentumEligible"`,
    );
    expect(sql).toContain(
      `DROP TRIGGER IF EXISTS "Task_momentumEligible_immutable" ON "Task"`,
    );
    expect(sql).toContain(
      `BEFORE UPDATE OF "kind", "momentumEligible" ON "Task"`,
    );
    expect(sql).toContain(
      `DROP TRIGGER IF EXISTS "RecurrenceSeries_momentumEligible_immutable" ON "RecurrenceSeries"`,
    );
    expect(sql).toContain(
      `BEFORE UPDATE OF "kind", "momentumEligible" ON "RecurrenceSeries"`,
    );
    expect(statements.slice(11)).toEqual(firstRun);
  });
});
