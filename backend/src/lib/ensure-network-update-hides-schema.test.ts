import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureNetworkUpdateHidesSchema } from "./ensure-network-update-hides-schema";

describe("ensureNetworkUpdateHidesSchema", () => {
  test("creates idempotent indexes and cascading foreign keys", async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (statement: string) => {
        statements.push(statement.replace(/\s+/g, " ").trim());
        return 0;
      },
    } as unknown as PrismaClient;

    expect(await ensureNetworkUpdateHidesSchema(prisma)).toEqual({ ok: true });
    expect(await ensureNetworkUpdateHidesSchema(prisma)).toEqual({ ok: true });

    expect(statements).toHaveLength(10);
    const firstRun = statements.slice(0, 5).join("\n");
    expect(firstRun).toContain('CREATE TABLE IF NOT EXISTS public."NetworkUpdateHide"');
    expect(firstRun).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "NetworkUpdateHide_viewerId_activityId_key"',
    );
    expect(firstRun).toContain(
      'CREATE INDEX IF NOT EXISTS "NetworkUpdateHide_activityId_idx"',
    );
    expect(firstRun).toContain(
      'REFERENCES public."User"("id") ON DELETE CASCADE',
    );
    expect(firstRun).toContain(
      'REFERENCES public."TeamActivity"("id") ON DELETE CASCADE',
    );
    expect(statements.slice(5)).toEqual(statements.slice(0, 5));
  });
});
