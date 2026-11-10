/**
 * Which spotlight the Workspace Feed sidebar should show.
 * One card, chosen by priority. Nothing here rotates on a timer.
 */

export const WELCOME_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MILESTONE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const QUIET_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type SpotlightKind = "welcome" | "milestone" | "quiet" | "teamwork";

export type SpotlightCta = "say_hello" | "celebrate" | "share";

/** The slice of an activity row the spotlight needs. */
export type SpotlightActivity = {
  id: string;
  type: string;
  createdAt: string;
  actorId?: string | null;
  actorName?: string | null;
  metadataName?: string | null;
};

export type ResolvedSpotlight = {
  kind: SpotlightKind;
  /** Stable per event. Null on the default card, which cannot be dismissed. */
  eventId: string | null;
  headline: string;
  description: string;
  cta: SpotlightCta | null;
  /** First name-bearing label for the welcome draft. */
  memberName: string | null;
};

export type SpotlightSource = "loading" | "ready" | "unavailable";

export type ResolveSpotlightInput = {
  source: SpotlightSource;
  now: number;
  viewerId: string | null;
  /**
   * When the workspace was created. Undefined means the date is unknown, so a
   * feed with no posts is not called quiet.
   */
  workspaceCreatedAt?: string | null;
  activities: readonly SpotlightActivity[];
  /** Event ids already dismissed by this viewer in this workspace. */
  dismissedIds: ReadonlySet<string>;
};

export const TEAMWORK_SPOTLIGHT: ResolvedSpotlight = {
  kind: "teamwork",
  eventId: null,
  headline: "Better together",
  description: "Great things happen when we stay connected.",
  cta: null,
  memberName: null,
};

export function welcomeEventId(activityId: string): string {
  return `welcome:${activityId}`;
}

export function milestoneEventId(activityId: string): string {
  return `milestone:${activityId}`;
}

export function quietEventId(lastPostId: string | null): string {
  return `quiet:${lastPostId ?? "none"}`;
}

function ageMs(iso: string, now: number): number | null {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return now - at;
}

function memberLabel(activity: SpotlightActivity): string {
  const fromMetadata = activity.metadataName?.trim();
  if (fromMetadata) return fromMetadata;
  const fromActor = activity.actorName?.trim();
  if (fromActor) return fromActor;
  return "a teammate";
}

function byNewest(left: SpotlightActivity, right: SpotlightActivity): number {
  return (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function resolveWelcome(
  input: ResolveSpotlightInput,
): ResolvedSpotlight | null {
  const joins = input.activities
    .filter((activity) => activity.type === "member_joined")
    .filter((activity) => activity.actorId !== input.viewerId)
    .filter((activity) => {
      const age = ageMs(activity.createdAt, input.now);
      return age != null && age >= 0 && age < WELCOME_WINDOW_MS;
    })
    .sort(byNewest);

  for (const join of joins) {
    const eventId = welcomeEventId(join.id);
    if (input.dismissedIds.has(eventId)) continue;
    const memberName = memberLabel(join);
    return {
      kind: "welcome",
      eventId,
      headline: "Welcome to the team!",
      description:
        "Someone new has joined your workspace. Make them feel at home.",
      cta: "say_hello",
      memberName,
    };
  }
  return null;
}

function resolveMilestone(
  input: ResolveSpotlightInput,
): ResolvedSpotlight | null {
  const milestones = input.activities
    .filter((activity) => activity.type === "task_milestone")
    .filter((activity) => {
      const age = ageMs(activity.createdAt, input.now);
      return age != null && age >= 0 && age < MILESTONE_WINDOW_MS;
    })
    .sort(byNewest);

  for (const milestone of milestones) {
    const eventId = milestoneEventId(milestone.id);
    if (input.dismissedIds.has(eventId)) continue;
    return {
      kind: "milestone",
      eventId,
      headline: "Worth celebrating!",
      description: "Your team just reached a new milestone.",
      cta: "celebrate",
      memberName: null,
    };
  }
  return null;
}

function resolveQuiet(input: ResolveSpotlightInput): ResolvedSpotlight | null {
  const posts = input.activities
    .filter((activity) => activity.type === "post")
    .filter((activity) => ageMs(activity.createdAt, input.now) != null)
    .sort(byNewest);
  const latest = posts[0] ?? null;
  const latestAge = latest ? ageMs(latest.createdAt, input.now) : null;
  if (latestAge != null && latestAge < QUIET_WINDOW_MS) return null;

  if (!latest) {
    const createdAt = input.workspaceCreatedAt;
    if (!createdAt) return null;
    const workspaceAge = ageMs(createdAt, input.now);
    if (workspaceAge == null || workspaceAge < QUIET_WINDOW_MS) return null;
  }

  const eventId = quietEventId(latest?.id ?? null);
  if (input.dismissedIds.has(eventId)) return null;
  return {
    kind: "quiet",
    eventId,
    headline: "Keep the conversation going",
    description: "Your workspace has been a little quiet lately.",
    cta: null,
    memberName: null,
  };
}

export function resolveWorkspaceSpotlight(
  input: ResolveSpotlightInput,
): ResolvedSpotlight | null {
  if (input.source === "loading") return null;
  if (input.source === "unavailable") return TEAMWORK_SPOTLIGHT;
  return (
    resolveWelcome(input) ??
    resolveMilestone(input) ??
    resolveQuiet(input) ??
    TEAMWORK_SPOTLIGHT
  );
}
