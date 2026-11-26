export type PostAudienceKind = "network" | "workspace";

export type PostAudience = {
  kind: PostAudienceKind;
  /** Required when kind is workspace. */
  teamId?: string;
  teamName?: string;
};

export type PostAudienceOption = {
  key: string;
  kind: PostAudienceKind;
  teamId?: string;
  title: string;
  subtitle: string;
};

export function postAudienceKey(audience: PostAudience): string {
  if (audience.kind === "network") return "network";
  return `workspace:${audience.teamId ?? ""}`;
}

export function postAudienceFromParams(input: {
  scope?: string;
  teamId?: string;
  teamName?: string;
}): PostAudience | null {
  if (input.scope === "network") {
    return { kind: "network" };
  }
  if (input.teamId) {
    return {
      kind: "workspace",
      teamId: input.teamId,
      teamName: input.teamName,
    };
  }
  return null;
}

export function buildPostAudienceOptions(input: {
  teams: Array<{ id: string; name: string }>;
  /** Kept for callers; picker copy no longer shows a count. */
  networkConnectionCount?: number | null;
}): PostAudienceOption[] {
  const options: PostAudienceOption[] = [
    {
      key: "network",
      kind: "network",
      title: "My network",
      subtitle: "People you’re connected with",
    },
  ];
  for (const team of input.teams) {
    options.push({
      key: `workspace:${team.id}`,
      kind: "workspace",
      teamId: team.id,
      title: team.name,
      subtitle: "Everyone in this workspace",
    });
  }
  return options;
}

export function networkAudienceSubtitle(count?: number | null): string {
  if (typeof count === "number" && count > 0) {
    return `${count} connection${count === 1 ? "" : "s"}`;
  }
  return "People you’re connected with";
}

/** Chip / confirm copy: where this post will go. */
export function postDestinationSummary(
  audience: PostAudience,
  networkConnectionCount?: number | null,
): { title: string; detail: string } {
  if (audience.kind === "network") {
    return {
      title: "My network",
      detail: networkAudienceSubtitle(networkConnectionCount),
    };
  }
  const name = audience.teamName?.trim() || "this workspace";
  return {
    title: name,
    detail: "Everyone in this workspace",
  };
}

export function postDestinationConfirmCopy(
  audience: PostAudience,
  networkConnectionCount?: number | null,
): { title: string; body: string } {
  const summary = postDestinationSummary(audience, networkConnectionCount);
  if (audience.kind === "network") {
    return {
      title: "Post to your network?",
      body: `This update goes to ${summary.detail.toLowerCase()}.`,
    };
  }
  return {
    title: `Post to ${summary.title}?`,
    body: `${summary.detail} will see this update.`,
  };
}

export function resolvePostAudience(
  option: PostAudienceOption,
  teams: Array<{ id: string; name: string }>,
): PostAudience {
  if (option.kind === "network") return { kind: "network" };
  const team = teams.find((item) => item.id === option.teamId);
  return {
    kind: "workspace",
    teamId: option.teamId,
    teamName: team?.name ?? option.title,
  };
}
