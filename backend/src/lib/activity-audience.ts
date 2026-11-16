/** Explicit audience for feed posts (Phase 3). */
export type ActivityAudienceKind = "network" | "workspace" | "self";

export type ActivityAudienceFields = {
  audienceKind: ActivityAudienceKind;
  audienceTeamId: string | null;
};

/** Values written on create for a network-scoped post. */
export function networkAudienceFields(): ActivityAudienceFields {
  return { audienceKind: "network", audienceTeamId: null };
}

/** Values written on create for a workspace-scoped post. */
export function workspaceAudienceFields(teamId: string): ActivityAudienceFields {
  return { audienceKind: "workspace", audienceTeamId: teamId };
}

/**
 * Infer audience from legacy type/teamId when columns are still null.
 * Used by feed queries and one-time backfill.
 */
export function inferActivityAudience(activity: {
  type: string;
  teamId: string | null;
  audienceKind?: string | null;
  audienceTeamId?: string | null;
}): ActivityAudienceFields {
  if (
    activity.audienceKind === "network" ||
    activity.audienceKind === "workspace" ||
    activity.audienceKind === "self"
  ) {
    return {
      audienceKind: activity.audienceKind,
      audienceTeamId:
        activity.audienceKind === "workspace"
          ? activity.audienceTeamId ?? activity.teamId
          : null,
    };
  }

  if (activity.type === "network_post" || (activity.teamId == null && activity.type === "post")) {
    return { audienceKind: "network", audienceTeamId: null };
  }

  if (activity.teamId) {
    return { audienceKind: "workspace", audienceTeamId: activity.teamId };
  }

  return { audienceKind: "self", audienceTeamId: null };
}

export function activitySourceFromAudience(
  audience: ActivityAudienceFields,
  teamName?: string | null,
): { source: "network" | "workspace"; sourceLabel: string } {
  if (audience.audienceKind === "network") {
    return { source: "network", sourceLabel: "Network" };
  }
  return {
    source: "workspace",
    sourceLabel: teamName?.trim() || "Workspace",
  };
}
