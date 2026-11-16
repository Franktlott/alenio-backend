import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureActivityAudienceSchema } from "./ensure-activity-audience-schema";

describe("ensureActivityAudienceSchema", () => {
  test("is idempotent when DDL succeeds", async () => {
    const calls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        calls.push(sql);
        return 0;
      },
    } as unknown as PrismaClient;

    expect(await ensureActivityAudienceSchema(prisma)).toEqual({ ok: true });
    expect(await ensureActivityAudienceSchema(prisma)).toEqual({ ok: true });
    expect(calls.some((sql) => sql.includes("audienceKind"))).toBe(true);
    expect(calls.some((sql) => sql.includes("alenioAudience"))).toBe(true);
    expect(
      calls.some(
        (sql) =>
          sql.includes("SET \"alenioAudience\" = 'all'") &&
          sql.includes("\"type\" = 'alenio_post'"),
      ),
    ).toBe(true);
  });

  test("returns error on failure", async () => {
    const prisma = {
      $executeRawUnsafe: async () => {
        throw new Error("boom");
      },
    } as unknown as PrismaClient;

    expect(await ensureActivityAudienceSchema(prisma)).toEqual({
      ok: false,
      error: "boom",
    });
  });
});
