import { describe, expect, test } from "bun:test";
import { buildDmPairKey } from "./dm-pair-key";
import {
  PEOPLE_DEV_ACCEPTED,
  PEOPLE_DEV_ACTIVE_IDS,
  PEOPLE_DEV_CONVERSATIONS,
  PEOPLE_DEV_HOME_ACTIVITIES,
  PEOPLE_DEV_MUTUAL_BRIDGES,
  PEOPLE_DEV_ORGANIZATION_PERSON_IDS,
  PEOPLE_DEV_PENDING,
  PEOPLE_DEV_PENDING_CONNECTIONS,
  PEOPLE_DEV_SEED_PREFIX,
  PEOPLE_DEV_SUGGESTIONS,
  PEOPLE_DEV_WORKSPACES,
  assertSafePeopleDevEnvironment,
  buildPeopleDevCleanupSelectors,
  buildPeopleDevConnectionPairKey,
  getPeopleDevFixtureSummary,
  parsePeopleDevArgs,
} from "./people-dev-seed";

const VIEWER_ID = "viewer-development-id";
const confirmedSeed = {
  mode: "seed" as const,
  viewer: "viewer@example.com",
  confirmDev: true,
};
const safeEnvironment = {
  NODE_ENV: "development",
  VITE_API_TARGET: "development",
  DATABASE_URL: "postgresql://dev-user:secret@localhost:5432/alenio_dev?schema=public",
  PROD_DATABASE_URL: "postgresql://prod-user:secret@prod.example.com:5432/alenio",
};

describe("People development seed guards", () => {
  test("requires an explicit viewer for every mode", () => {
    expect(() => parsePeopleDevArgs(["dry-run"])).toThrow("--viewer");
    expect(() => parsePeopleDevArgs(["seed", "--confirm-dev"])).toThrow("--viewer");
  });

  test("requires explicit development confirmation for every mutating mode", () => {
    for (const mode of ["seed", "presence", "cleanup"]) {
      expect(() => parsePeopleDevArgs([mode, "--viewer", "viewer@example.com"])).toThrow(
        "--confirm-dev",
      );
    }
    expect(
      parsePeopleDevArgs(["dry-run", "--viewer", "viewer@example.com"]),
    ).toEqual({
      mode: "dry-run",
      viewer: "viewer@example.com",
      confirmDev: false,
    });
  });

  test("rejects production runtime and target indicators", () => {
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        ...safeEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow("NODE_ENV");
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        ...safeEnvironment,
        VITE_API_TARGET: "prod",
      }),
    ).toThrow("VITE_API_TARGET");
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        ...safeEnvironment,
        RAILWAY_ENVIRONMENT_NAME: "production",
      }),
    ).toThrow("Railway");
  });

  test("rejects the production URL, missing URL, and non-Postgres URL", () => {
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        ...safeEnvironment,
        DATABASE_URL: safeEnvironment.PROD_DATABASE_URL,
      }),
    ).toThrow("PROD_DATABASE_URL");
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        NODE_ENV: "development",
      }),
    ).toThrow("DATABASE_URL is missing");
    expect(() =>
      assertSafePeopleDevEnvironment(confirmedSeed, {
        DATABASE_URL: "file:./dev.db",
      }),
    ).toThrow("PostgreSQL");
  });

  test("allows dry-run without a configured database", () => {
    expect(() =>
      assertSafePeopleDevEnvironment(
        { mode: "dry-run", viewer: "dummy", confirmDev: false },
        { NODE_ENV: "production" },
      ),
    ).not.toThrow();
  });

});

describe("People development fixtures", () => {
  test("has the exact accepted, active, suggestion, and pending counts", () => {
    expect(PEOPLE_DEV_ACCEPTED).toHaveLength(4);
    expect(PEOPLE_DEV_ACTIVE_IDS).toHaveLength(3);
    expect(PEOPLE_DEV_SUGGESTIONS).toHaveLength(8);
    expect(PEOPLE_DEV_PENDING).toHaveLength(4);
    expect(PEOPLE_DEV_PENDING_CONNECTIONS).toHaveLength(4);
    expect(
      PEOPLE_DEV_PENDING_CONNECTIONS.filter((request) => request.direction === "incoming"),
    ).toHaveLength(3);
    expect(getPeopleDevFixtureSummary()).toMatchObject({
      acceptedConnections: 4,
      activeConnections: 3,
      suggestions: 8,
      pendingRequests: 4,
      workspaces: 2,
      homeActivities: 4,
      teamMembers: 13,
    });
  });

  test("uses fixed prefixed IDs and canonical deterministic pair keys", () => {
    const allFixtureIds = [
      ...PEOPLE_DEV_ACCEPTED.map((person) => person.id),
      ...PEOPLE_DEV_SUGGESTIONS.map((person) => person.id),
      ...PEOPLE_DEV_PENDING.map((person) => person.id),
      ...PEOPLE_DEV_CONVERSATIONS.map((conversation) => conversation.id),
    ];
    expect(allFixtureIds.every((id) => id.startsWith(PEOPLE_DEV_SEED_PREFIX))).toBe(true);
    expect(buildPeopleDevConnectionPairKey("z-user", "a-user")).toBe("a-user:z-user");
    expect(buildPeopleDevConnectionPairKey("a-user", "z-user")).toBe("a-user:z-user");
  });

  test("bridges most suggestions through mutuals and keeps an unbridged one", () => {
    expect(PEOPLE_DEV_MUTUAL_BRIDGES).toHaveLength(7);
    const bridgedSuggestions = new Set<string>(
      PEOPLE_DEV_MUTUAL_BRIDGES.map((bridge) => bridge.suggestionPersonId),
    );
    expect(bridgedSuggestions.has(PEOPLE_DEV_SUGGESTIONS[0]!.id)).toBe(true);
    expect(bridgedSuggestions.has(PEOPLE_DEV_SUGGESTIONS[1]!.id)).toBe(true);
    expect(bridgedSuggestions.has(PEOPLE_DEV_SUGGESTIONS[2]!.id)).toBe(false);
    expect(
      PEOPLE_DEV_SUGGESTIONS.filter((person) => !bridgedSuggestions.has(person.id)),
    ).toHaveLength(2);
    expect(
      PEOPLE_DEV_ORGANIZATION_PERSON_IDS.every((id) =>
        PEOPLE_DEV_SUGGESTIONS.some((person) => person.id === id),
      ),
    ).toBe(true);
  });

  test("defines located workspaces and representative Home social states", () => {
    expect(PEOPLE_DEV_WORKSPACES).toHaveLength(2);
    expect(PEOPLE_DEV_WORKSPACES.every((workspace) => workspace.location.trim())).toBe(true);
    expect(PEOPLE_DEV_WORKSPACES.every((workspace) => !("image" in workspace))).toBe(true);
    expect(PEOPLE_DEV_HOME_ACTIVITIES.map((activity) => activity.type)).toEqual([
      "celebration",
      "development_goal_completed",
      "task_milestone",
      "member_joined",
    ]);
    expect(
      PEOPLE_DEV_HOME_ACTIVITIES.some((activity) => activity.target === "viewer"),
    ).toBe(true);
    expect(PEOPLE_DEV_PENDING_CONNECTIONS.some((request) => request.direction === "incoming")).toBe(
      true,
    );
  });
});

describe("People development cleanup scope", () => {
  test("selects only fixed fixture IDs and viewer-specific pair keys", () => {
    const selectors = buildPeopleDevCleanupSelectors(VIEWER_ID);
    expect(selectors.userIds.every((id) => id.startsWith(PEOPLE_DEV_SEED_PREFIX))).toBe(true);
    expect(selectors.userIds).not.toContain(VIEWER_ID);
    expect(selectors.conversationIds).toEqual(
      PEOPLE_DEV_CONVERSATIONS.map((conversation) => conversation.id),
    );
    expect(selectors.teamIds).toEqual(
      PEOPLE_DEV_WORKSPACES.map((workspace) => workspace.id),
    );
    expect(selectors.activityIds).toEqual(
      PEOPLE_DEV_HOME_ACTIVITIES.map((activity) => activity.id),
    );
    expect(selectors.dmPairKeys).toEqual(
      PEOPLE_DEV_ACCEPTED.map((person) => buildDmPairKey(VIEWER_ID, person.id)),
    );
    for (const suggestion of PEOPLE_DEV_SUGGESTIONS) {
      expect(selectors.connectionPairKeys).toContain(buildDmPairKey(VIEWER_ID, suggestion.id));
    }
    expect(
      selectors.connectionPairKeys.every((pairKey) => {
        const [first, second] = pairKey.split(":");
        return (
          first === VIEWER_ID ||
          second === VIEWER_ID ||
          (first?.startsWith(PEOPLE_DEV_SEED_PREFIX) &&
            second?.startsWith(PEOPLE_DEV_SEED_PREFIX))
        );
      }),
    ).toBe(true);
  });
});
