import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureCheckInAudioRetentionSchema } from "./ensure-check-in-audio-retention-schema";

describe("ensureCheckInAudioRetentionSchema", () => {
  test("adds video source and audio retention columns", async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (statement: string) => {
        statements.push(statement);
        return 0;
      },
    } as unknown as PrismaClient;

    await ensureCheckInAudioRetentionSchema(prisma);

    const sql = statements.join("\n");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT \'device_mic\'');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "audioStatus"');
  });
});
