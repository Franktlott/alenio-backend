import type { PrismaClient } from "@prisma/client";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "./timezone";

export type WorkspaceTimeZoneMember = {
  role: string;
  user: { timezone: string | null };
};

export function canChangeWorkspaceTimeZone(role?: string | null): boolean {
  return role === "owner";
}

export function validateWorkspaceTimeZone(
  raw: unknown,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== "string") {
    return { ok: false, message: "timezone must be a valid IANA timezone" };
  }
  const value = raw.trim();
  if (!isValidTimeZone(value)) {
    return { ok: false, message: "timezone must be a valid IANA timezone" };
  }
  return { ok: true, value };
}

function validCandidate(raw?: string | null): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  return isValidTimeZone(candidate) ? candidate : null;
}

/**
 * Resolve workspace calendar semantics independently of the requesting user.
 * Members must be supplied in stable joined order for the final fallback.
 */
export function resolveWorkspaceTimeZone(
  teamTimeZone: string | null | undefined,
  members: WorkspaceTimeZoneMember[],
): string {
  const team = validCandidate(teamTimeZone);
  if (team) return team;

  const owner = members.find((member) => member.role === "owner");
  const ownerTimeZone = validCandidate(owner?.user.timezone);
  if (ownerTimeZone) return ownerTimeZone;

  const leader = members.find((member) => member.role === "team_leader");
  const leaderTimeZone = validCandidate(leader?.user.timezone);
  if (leaderTimeZone) return leaderTimeZone;

  const firstMemberTimeZone = members
    .map((member) => validCandidate(member.user.timezone))
    .find((timeZone): timeZone is string => timeZone !== null);
  return firstMemberTimeZone ?? DEFAULT_TIMEZONE;
}

export async function getWorkspaceTimeZone(
  db: PrismaClient,
  teamId: string,
): Promise<string> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      timezone: true,
      members: {
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        select: {
          role: true,
          user: { select: { timezone: true } },
        },
      },
    },
  });
  return resolveWorkspaceTimeZone(team?.timezone, team?.members ?? []);
}
