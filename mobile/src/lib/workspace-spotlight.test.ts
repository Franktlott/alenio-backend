import { describe, expect, test } from "bun:test";
import {
  MILESTONE_WINDOW_MS,
  QUIET_WINDOW_MS,
  WELCOME_WINDOW_MS,
  milestoneEventId,
  quietEventId,
  resolveWorkspaceSpotlight,
  welcomeEventId,
  type ResolveSpotlightInput,
  type SpotlightActivity,
} from "./workspace-spotlight";

const NOW = Date.parse("2026-10-26T22:00:00.000Z");
const VIEWER = "viewer-1";

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 60 * 60 * 1000).toISOString();
}

function activity(
  partial: Partial<SpotlightActivity> & Pick<SpotlightActivity, "id" | "type">,
): SpotlightActivity {
  return {
    createdAt: hoursAgo(1),
    actorId: "someone",
    actorName: "Maya Chen",
    ...partial,
  };
}

function input(
  partial: Partial<ResolveSpotlightInput> = {},
): ResolveSpotlightInput {
  return {
    source: "ready",
    now: NOW,
    viewerId: VIEWER,
    workspaceCreatedAt: hoursAgo(24 * 30),
    activities: [],
    dismissedIds: new Set(),
    ...partial,
  };
}

describe("resolveWorkspaceSpotlight", () => {
  test("waits until the feed has loaded", () => {
    expect(resolveWorkspaceSpotlight(input({ source: "loading" }))).toBeNull();
  });

  test("falls back to teamwork when the feed cannot be read", () => {
    expect(
      resolveWorkspaceSpotlight(input({ source: "unavailable" }))?.kind,
    ).toBe("teamwork");
  });

  test("a new workspace with no posts is not called quiet", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        workspaceCreatedAt: hoursAgo(24 * 2),
        activities: [],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
    expect(spotlight?.cta).toBeNull();
    expect(spotlight?.eventId).toBeNull();
  });

  test("an active workspace with no special events stays on teamwork", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({ id: "post-1", type: "post", createdAt: hoursAgo(6) }),
          activity({ id: "done-1", type: "task_completed" }),
          activity({ id: "best-1", type: "personal_best" }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
    expect(spotlight?.headline).toBe("Better together");
  });

  test("welcomes a member who joined in the last day", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "join-1",
            type: "member_joined",
            createdAt: hoursAgo(3),
            metadataName: "Tyrell Lott",
          }),
        ],
      }),
    );
    expect(spotlight).toMatchObject({
      kind: "welcome",
      eventId: welcomeEventId("join-1"),
      headline: "Welcome to the team!",
      cta: "say_hello",
      memberName: "Tyrell Lott",
    });
  });

  test("does not welcome the viewer for their own join", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "join-me",
            type: "member_joined",
            actorId: VIEWER,
            createdAt: hoursAgo(1),
          }),
          activity({ id: "post-1", type: "post", createdAt: hoursAgo(2) }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
  });

  test("a join older than a day expires", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "join-old",
            type: "member_joined",
            createdAt: new Date(NOW - WELCOME_WINDOW_MS - 1000).toISOString(),
          }),
          activity({ id: "post-1", type: "post", createdAt: hoursAgo(2) }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
  });

  test("celebrates a recorded milestone and ignores task completions", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "mile-1",
            type: "task_milestone",
            createdAt: hoursAgo(5),
          }),
          activity({ id: "done-1", type: "task_completed" }),
        ],
      }),
    );
    expect(spotlight).toMatchObject({
      kind: "milestone",
      eventId: milestoneEventId("mile-1"),
      headline: "Worth celebrating!",
      cta: "celebrate",
    });
  });

  test("a milestone older than two days expires", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "mile-old",
            type: "task_milestone",
            createdAt: new Date(NOW - MILESTONE_WINDOW_MS - 1000).toISOString(),
          }),
          activity({ id: "post-1", type: "post", createdAt: hoursAgo(2) }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
  });

  test("a week without posts is quiet, and comments do not count", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "post-old",
            type: "post",
            createdAt: new Date(NOW - QUIET_WINDOW_MS - 1000).toISOString(),
          }),
          activity({
            id: "cheer-1",
            type: "celebration",
            createdAt: hoursAgo(1),
          }),
        ],
      }),
    );
    expect(spotlight).toMatchObject({
      kind: "quiet",
      eventId: quietEventId("post-old"),
      headline: "Keep the conversation going",
      cta: null,
    });
  });

  test("an older workspace with no posts at all is quiet", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        workspaceCreatedAt: hoursAgo(24 * 20),
        activities: [
          activity({ id: "join-old", type: "member_joined", createdAt: hoursAgo(24 * 10) }),
        ],
      }),
    );
    expect(spotlight?.eventId).toBe(quietEventId(null));
  });

  test("a new post ends the quiet state", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "post-old",
            type: "post",
            createdAt: hoursAgo(24 * 10),
          }),
          activity({ id: "post-new", type: "post", createdAt: hoursAgo(2) }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
  });

  test("unknown workspace age does not invent a quiet feed", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        workspaceCreatedAt: undefined,
        activities: [],
      }),
    );
    expect(spotlight?.kind).toBe("teamwork");
  });

  test("a welcome outranks a milestone and a quiet feed", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "post-old",
            type: "post",
            createdAt: hoursAgo(24 * 10),
          }),
          activity({
            id: "mile-1",
            type: "task_milestone",
            createdAt: hoursAgo(2),
          }),
          activity({
            id: "join-1",
            type: "member_joined",
            createdAt: hoursAgo(4),
          }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("welcome");
  });

  test("a milestone outranks a quiet feed", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "post-old",
            type: "post",
            createdAt: hoursAgo(24 * 9),
          }),
          activity({
            id: "mile-1",
            type: "task_milestone",
            createdAt: hoursAgo(1),
          }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("milestone");
  });

  test("the newest eligible event of the same kind wins", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        activities: [
          activity({
            id: "join-older",
            type: "member_joined",
            createdAt: hoursAgo(10),
            metadataName: "Older",
          }),
          activity({
            id: "join-newer",
            type: "member_joined",
            createdAt: hoursAgo(1),
            metadataName: "Newer",
          }),
        ],
      }),
    );
    expect(spotlight?.eventId).toBe(welcomeEventId("join-newer"));
    expect(spotlight?.memberName).toBe("Newer");
  });

  test("dismissing a welcome reveals the next eligible spotlight", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        dismissedIds: new Set([welcomeEventId("join-1")]),
        activities: [
          activity({ id: "join-1", type: "member_joined" }),
          activity({ id: "mile-1", type: "task_milestone" }),
        ],
      }),
    );
    expect(spotlight?.kind).toBe("milestone");
  });

  test("dismissing one join does not hide a later join", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        dismissedIds: new Set([welcomeEventId("join-1")]),
        activities: [
          activity({
            id: "join-1",
            type: "member_joined",
            createdAt: hoursAgo(6),
          }),
          activity({
            id: "join-2",
            type: "member_joined",
            createdAt: hoursAgo(1),
            metadataName: "Avery",
          }),
        ],
      }),
    );
    expect(spotlight?.eventId).toBe(welcomeEventId("join-2"));
  });

  test("a dismissed quiet period does not hide the next one", () => {
    const spotlight = resolveWorkspaceSpotlight(
      input({
        dismissedIds: new Set([quietEventId("post-old")]),
        activities: [
          activity({
            id: "post-older",
            type: "post",
            createdAt: hoursAgo(24 * 12),
          }),
        ],
      }),
    );
    expect(spotlight?.eventId).toBe(quietEventId("post-older"));
  });
});
