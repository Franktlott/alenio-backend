import {
  projectMomentum,
  type MomentumOutcome,
  type MomentumProjection,
} from "./momentum-projection";

export type StoredMomentumProjection = MomentumProjection & {
  teamMemberId: string;
  teamId: string;
  userId: string;
  personalBestCelebrated: boolean;
};

export type MomentumProjectionRepair = {
  teamMemberId: string;
  teamId: string;
  userId: string;
  before: MomentumProjection & { personalBestCelebrated: boolean };
  after: MomentumProjection & { personalBestCelebrated: boolean };
  changedFields: string[];
};

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

/**
 * Produces a repair plan exclusively from canonical, non-revoked credit.
 * Members without canonical evidence intentionally project to zero.
 */
export function planMomentumProjectionRepairs(
  members: readonly StoredMomentumProjection[],
  activeCredits: readonly (MomentumOutcome & { teamId: string; creditedUserId: string })[],
): MomentumProjectionRepair[] {
  const creditsByMember = new Map<string, MomentumOutcome[]>();
  for (const credit of activeCredits) {
    const key = `${credit.teamId}:${credit.creditedUserId}`;
    const credits = creditsByMember.get(key) ?? [];
    credits.push(credit);
    creditsByMember.set(key, credits);
  }

  return members.flatMap((member) => {
    const projection = projectMomentum(
      creditsByMember.get(`${member.teamId}:${member.userId}`) ?? [],
    );
    const personalBestCelebrated =
      projection.currentStreak === 0 ? false : member.personalBestCelebrated;
    const changedFields: string[] = [];

    if (member.currentStreak !== projection.currentStreak) changedFields.push("currentStreak");
    if (member.personalBestStreak !== projection.personalBestStreak) {
      changedFields.push("personalBestStreak");
    }
    if (!sameDate(member.momentumRunStartedAt, projection.momentumRunStartedAt)) {
      changedFields.push("momentumRunStartedAt");
    }
    if (!sameDate(member.momentumLastQualifiedAt, projection.momentumLastQualifiedAt)) {
      changedFields.push("momentumLastQualifiedAt");
    }
    if (member.personalBestCelebrated !== personalBestCelebrated) {
      changedFields.push("personalBestCelebrated");
    }
    if (changedFields.length === 0) return [];

    return [{
      teamMemberId: member.teamMemberId,
      teamId: member.teamId,
      userId: member.userId,
      before: {
        currentStreak: member.currentStreak,
        personalBestStreak: member.personalBestStreak,
        momentumRunStartedAt: member.momentumRunStartedAt,
        momentumLastQualifiedAt: member.momentumLastQualifiedAt,
        personalBestCelebrated: member.personalBestCelebrated,
      },
      after: { ...projection, personalBestCelebrated },
      changedFields,
    }];
  });
}
