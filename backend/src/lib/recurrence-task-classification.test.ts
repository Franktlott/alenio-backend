import { describe, expect, test } from "bun:test";
import type { PrismaClient, Task } from "@prisma/client";
import { createRecurrenceSeries, spawnAllRecurrenceTasks } from "./recurrence-series";

describe("recurrence task classification", () => {
  test("snapshots reminder kind and ineligibility on the series", async () => {
    let createdData: Record<string, unknown> | undefined;
    const db = {
      recurrenceSeries: {
        create: async ({ data }: any) => {
          createdData = data;
          return { id: "series-1", ...data };
        },
      },
    } as unknown as PrismaClient;

    await createRecurrenceSeries(
      db,
      {
        teamId: "team-1",
        creatorId: "member-1",
        title: "Private reminder",
        description: null,
        kind: "reminder",
        momentumEligible: false,
        priority: "medium",
        incognito: true,
        isJoint: false,
        attachmentUrl: null,
      },
      { type: "daily", occurrenceCount: 2, timeZone: "UTC" },
    );

    expect(createdData).toMatchObject({
      kind: "reminder",
      momentumEligible: false,
      incognito: true,
    });
  });

  test("copies immutable classification to every materialized occurrence", async () => {
    const anchor = new Date("2026-08-27T23:59:59.000Z");
    const createdTasks: Record<string, any>[] = [];
    const series = {
      id: "series-1",
      teamId: "team-1",
      creatorId: "member-1",
      title: "Private reminder",
      description: null,
      kind: "reminder",
      momentumEligible: false,
      priority: "medium",
      incognito: true,
      isJoint: false,
      attachmentUrl: null,
      type: "daily",
      interval: 1,
      occurrenceCount: 2,
      daysOfWeek: null,
      dayOfMonth: null,
      timeZone: "UTC",
    };
    const db = {
      recurrenceSeries: {
        findUnique: async () => series,
        update: async () => series,
      },
      task: {
        findMany: async () => [{ dueDate: anchor }],
        findFirst: async () => ({ subtasks: [] }),
        create: async ({ data }: any) => {
          createdTasks.push(data);
          return data;
        },
      },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as PrismaClient;
    const task = {
      id: "anchor",
      teamId: "team-1",
      creatorId: "member-1",
      recurrenceSeriesId: "series-1",
      dueDate: anchor,
    } as Task;

    expect(await spawnAllRecurrenceTasks(db, task, ["member-1"])).toBe(1);
    expect(createdTasks[0]).toMatchObject({
      kind: "reminder",
      momentumEligible: false,
      incognito: true,
      assignments: { create: [{ userId: "member-1" }] },
    });
  });
});
