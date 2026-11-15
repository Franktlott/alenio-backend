// @ts-expect-error Bun supplies this module at test runtime; mobile tsc excludes Bun types.
import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import { applyTeamTaskUpdatedEvent, invalidateTaskCaches } from "@/lib/invalidate-task-caches";

describe("invalidateTaskCaches", () => {
  test("invalidates canonical workspace Stars alongside task mutations", () => {
    const keys: unknown[] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
        keys.push(queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    invalidateTaskCaches(queryClient, "team-1");

    expect(keys).toContainEqual(["team-stars", "team-1"]);
    expect(keys).toContainEqual(["tasks", "team-1"]);
    expect(keys).toContainEqual(["member-stats", "team-1"]);
  });

  test("applies a live task update to the open task and notes", async () => {
    const keys: unknown[] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
        keys.push(queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    applyTeamTaskUpdatedEvent(queryClient, { teamId: "team-1", taskId: "task-9" });
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(keys).toContainEqual(["task", "task-9", "team-1"]);
    expect(keys).toContainEqual(["task-notes", "team-1", "task-9"]);
    expect(keys).toContainEqual(["tasks", "team-1"]);
  });

  test("does not invalidate an empty workspace Stars key", () => {
    const keys: unknown[] = [];
    const queryClient = {
      invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
        keys.push(queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient;

    invalidateTaskCaches(queryClient, null);

    expect(keys).not.toContainEqual(["team-stars", null]);
    expect(keys).not.toContainEqual(["team-stars", ""]);
    expect(keys).toContainEqual(["tasks"]);
  });
});
