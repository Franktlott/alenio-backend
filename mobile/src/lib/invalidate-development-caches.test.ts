// @ts-expect-error Bun supplies this module at test runtime; mobile tsc excludes Bun types.
import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateDevelopmentCaches } from "@/lib/invalidate-development-caches";

function recordingClient() {
  const keys: unknown[] = [];
  const queryClient = {
    invalidateQueries: ({ queryKey }: { queryKey: unknown }) => {
      keys.push(queryKey);
      return Promise.resolve();
    },
  } as unknown as QueryClient;
  return { keys, queryClient };
}

describe("invalidateDevelopmentCaches", () => {
  test("refreshes the member rows on the Team tab", () => {
    const { keys, queryClient } = recordingClient();

    invalidateDevelopmentCaches(queryClient, "team-1", "user-1");

    // Goal counts and check-in compliance.
    expect(keys).toContainEqual(["member-stats", "team-1"]);
    // The next check-in date shown under each name.
    expect(keys).toContainEqual(["calendar-events", "team-1"]);
    expect(keys).toContainEqual(["planned-one-on-ones", "team-1"]);
    // Leader summaries above the list.
    expect(keys).toContainEqual(["team-momentum", "team-1"]);
    expect(keys).toContainEqual(["team-health-history", "team-1"]);
    expect(keys).toContainEqual(["member-next-action", "team-1", "user-1"]);
  });

  test("still clears the whole workspace when no member is named", () => {
    const { keys, queryClient } = recordingClient();

    invalidateDevelopmentCaches(queryClient, "team-1");

    expect(keys).toContainEqual(["member-next-action", "team-1"]);
    expect(keys).toContainEqual(["member-stats", "team-1"]);
  });

  test("does not invalidate keys for a missing workspace", () => {
    const { keys, queryClient } = recordingClient();

    invalidateDevelopmentCaches(queryClient, null, "user-1");

    expect(keys).not.toContainEqual(["member-stats", null]);
    expect(keys).toContainEqual(["member-next-action"]);
  });
});
