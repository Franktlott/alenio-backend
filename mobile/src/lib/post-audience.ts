export type PostAudienceKind = "network" | "public" | "workspace";

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
  if (audience.kind === "public") return "public";
  return `workspace:${audience.teamId ?? ""}`;
}

export function postAudienceFromParams(input: {
  scope?: string;
  teamId?: string;
  teamName?: string;
}): PostAudience | null {
  if (input.scope === "public") {
    return { kind: "public" };
  }
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
    {
      key: "public",
      kind: "public",
      title: "Public",
      subtitle: "Everyone on Alenio",
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
  if (audience.kind === "public") {
    return {
      title: "Public",
      detail: "Everyone on Alenio",
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
  if (audience.kind === "public") {
    return {
      title: "Post publicly?",
      body: "Anyone with an Alenio account can see this — including people you’re not connected with.",
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
  if (option.kind === "public") return { kind: "public" };
  const team = teams.find((item) => item.id === option.teamId);
  return {
    kind: "workspace",
    teamId: option.teamId,
    teamName: team?.name ?? option.title,
  };
}
