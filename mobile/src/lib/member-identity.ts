/** Match a roster membership to the signed-in user (handles session/me id drift). */
export function memberMatchesUserId<
  T extends { userId: string; user: { id?: string; email?: string | null } },
>(member: T, myId: string, myEmail?: string): boolean {
  if (myId && (member.userId === myId || member.user.id === myId)) return true;
  const email = myEmail?.trim().toLowerCase();
  if (email && member.user.email?.trim().toLowerCase() === email) return true;
  return false;
}

/** Owner / team leader / admin — can view other members' profiles. */
export function isLeaderRole(role?: string | null): boolean {
  return role === "owner" || role === "team_leader" || role === "admin";
}

type RosterMember = {
  userId: string;
  role: string;
  user: { id?: string; email?: string | null };
};

/**
 * Resolve the signed-in user's team role + roster userId.
 * Prefer server-attested team.role / list role — never demote to member just because a roster find failed.
 */
export function resolveMyTeamRole(opts: {
  teamRole?: string | null;
  listRole?: string | null;
  members?: RosterMember[] | null;
  meId?: string | null;
  meEmail?: string | null;
  sessionUserId?: string | null;
}): {
  myId: string;
  myRole: string | undefined;
  membership: RosterMember | null;
} {
  const sessionUserId = opts.sessionUserId?.trim() || "";
  const meId = opts.meId?.trim() || "";
  const meEmail = opts.meEmail?.trim() || undefined;
  const idHint = meId || sessionUserId;
  const members = opts.members ?? [];

  const membership =
    (idHint
      ? members.find((m) => memberMatchesUserId(m, idHint, meEmail))
      : undefined) ??
    (meEmail ? members.find((m) => memberMatchesUserId(m, "", meEmail)) : undefined) ??
    null;

  const myRole = opts.teamRole || opts.listRole || membership?.role || undefined;
  const myId = membership?.userId || idHint;

  return { myId, myRole, membership };
}
