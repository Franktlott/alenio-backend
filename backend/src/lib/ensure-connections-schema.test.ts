import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureConnectionsSchema } from "./ensure-connections-schema";

describe("ensureConnectionsSchema", () => {
  test("creates suggestion dismissals with idempotent indexes and foreign keys", async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (statement: string) => {
        statements.push(statement.replace(/\s+/g, " ").trim());
        return 0;
      },
    } as unknown as PrismaClient;

    await ensureConnectionsSchema(prisma);
    await ensureConnectionsSchema(prisma);

    expect(statements).toHaveLength(38);
    const firstRun = statements.slice(0, 19).join("\n");
    expect(firstRun).toContain(
      'CREATE TABLE IF NOT EXISTS "ConnectionSuggestionDismissal"',
    );
    expect(firstRun).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "ConnectionSuggestionDismissal_dismisserId_suggestedUserId_key"',
    );
    expect(firstRun).toContain(
      'CREATE INDEX IF NOT EXISTS "ConnectionSuggestionDismissal_dismisserId_dismissedAt_idx"',
    );
    expect(firstRun).toContain(
      'FOREIGN KEY ("dismisserId") REFERENCES "User"("id") ON DELETE CASCADE',
    );
    expect(firstRun).toContain(
      'FOREIGN KEY ("suggestedUserId") REFERENCES "User"("id") ON DELETE CASCADE',
    );
    expect(statements.slice(19)).toEqual(statements.slice(0, 19));
  });
});
