import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureTeamTimezoneSchema } from "./ensure-team-timezone-schema";

describe("ensureTeamTimezoneSchema", () => {
  test("is additive and only backfills valid owner timezones", async () => {
    const unsafeStatements: string[] = [];
    const updates: Array<{ query: TemplateStringsArray; values: unknown[] }> = [];
    let validTeamBackfilled = false;
    const prisma = {
      $executeRawUnsafe: async (query: string) => {
        unsafeStatements.push(query);
        return 0;
      },
      $queryRawUnsafe: async () => [
        ...(!validTeamBackfilled
          ? [{ teamId: "valid-team", timezone: "America/Los_Angeles" }]
          : []),
        { teamId: "invalid-team", timezone: "not/a-zone" },
        { teamId: "empty-team", timezone: null },
      ],
      $executeRaw: async (query: TemplateStringsArray, ...values: unknown[]) => {
        updates.push({ query, values });
        validTeamBackfilled = true;
        return 1;
      },
    } as unknown as PrismaClient;

    await ensureTeamTimezoneSchema(prisma);
    await ensureTeamTimezoneSchema(prisma);

    expect(unsafeStatements).toHaveLength(2);
    expect(unsafeStatements.every((query) => query.includes("ADD COLUMN IF NOT EXISTS"))).toBe(true);
    expect(updates.map((update) => update.values)).toEqual([
      ["America/Los_Angeles", "valid-team"],
    ]);
  });
});
