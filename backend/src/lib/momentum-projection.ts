export type MomentumOutcome = {
  id: string;
  completedAt: Date;
  onTime: boolean;
};

export type MomentumProjection = {
  currentStreak: number;
  personalBestStreak: number;
  momentumRunStartedAt: Date | null;
  momentumLastQualifiedAt: Date | null;
};

function newestFirst(a: MomentumOutcome, b: MomentumOutcome): number {
  const dateOrder = b.completedAt.getTime() - a.completedAt.getTime();
  return dateOrder !== 0 ? dateOrder : b.id.localeCompare(a.id);
}

/**
 * Projects canonical Momentum evidence. The active/presentation window is
 * intentionally absent: elapsed time never breaks an earned run.
 */
export function projectMomentum(outcomes: readonly MomentumOutcome[]): MomentumProjection {
  const ordered = [...outcomes].sort(newestFirst);

  let currentStreak = 0;
  for (const outcome of ordered) {
    if (!outcome.onTime) break;
    currentStreak += 1;
  }

  let personalBestStreak = 0;
  let run = 0;
  for (const outcome of [...ordered].reverse()) {
    if (outcome.onTime) {
      run += 1;
      personalBestStreak = Math.max(personalBestStreak, run);
    } else {
      run = 0;
    }
  }

  const currentRun = ordered.slice(0, currentStreak);
  const latestQualified = ordered.find((outcome) => outcome.onTime);

  return {
    currentStreak,
    personalBestStreak,
    momentumRunStartedAt:
      currentRun.length > 0 ? currentRun[currentRun.length - 1]!.completedAt : null,
    momentumLastQualifiedAt: latestQualified?.completedAt ?? null,
  };
}
