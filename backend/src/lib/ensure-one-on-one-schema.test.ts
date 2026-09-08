import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ensureOneOnOneSchema } from "./ensure-one-on-one-schema";

describe("ensureOneOnOneSchema video provenance", () => {
  test("idempotently adds room and calendar provenance columns", async () => {
    const statements: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (statement: string) => {
        statements.push(statement);
        return 0;
      },
    } as unknown as PrismaClient;

    await ensureOneOnOneSchema(prisma);

    const sql = statements.join("\n");
    expect(sql).toContain('ADD COLUMN "sourceVideoRoomId" TEXT');
    expect(sql).toContain('ADD COLUMN "calendarEventId" TEXT');
    expect(sql).toContain('"OneOnOneMeeting_calendarEventId_idx"');
    expect(sql).toContain('"OneOnOneMeeting_calendarEventId_fkey"');
    expect(sql).toContain(
      'REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
  });
});
