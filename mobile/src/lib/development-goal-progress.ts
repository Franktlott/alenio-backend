type GoalProgressInput = {
  steps?: readonly string[] | null;
  completedStepIndexes?: readonly number[] | null;
  completedStepCount?: number | null;
  totalStepCount?: number | null;
  progressPercent?: number | null;
};

export type GoalProgress = {
  completedStepIndexes: number[];
  completedStepCount: number;
  totalStepCount: number;
  progressPercent: number;
  label: string;
};

export function goalProgress(goal: GoalProgressInput): GoalProgress {
  const totalStepCount = Math.max(
    0,
    Number.isFinite(goal.totalStepCount)
      ? Math.trunc(goal.totalStepCount ?? 0)
      : goal.steps?.length ?? 0,
  );
  const completedStepIndexes = [
    ...new Set(
      (goal.completedStepIndexes ?? []).filter(
        (index) =>
          Number.isInteger(index) && index >= 0 && index < totalStepCount,
      ),
    ),
  ].sort((a, b) => a - b);
  const completedStepCount = completedStepIndexes.length;
  const progressPercent =
    totalStepCount === 0
      ? 0
      : Math.round((completedStepCount / totalStepCount) * 100);

  return {
    completedStepIndexes,
    completedStepCount,
    totalStepCount,
    progressPercent,
    label:
      totalStepCount === 0
        ? "No actions"
        : `${completedStepCount} of ${totalStepCount} actions`,
  };
}

export type DevelopmentPlanSummary = {
  activeCount: number;
  completedCount: number;
  /** Step-weighted completion across every goal, closed ones counting as done. */
  overallPercent: number;
};

export function developmentPlanSummary(
  goals: readonly (GoalProgressInput & { status?: string | null })[],
): DevelopmentPlanSummary {
  let completedSteps = 0;
  let totalSteps = 0;
  let activeCount = 0;
  let completedCount = 0;

  for (const goal of goals) {
    const closed = goal.status === "closed";
    if (goal.status === "active") activeCount += 1;
    if (closed) completedCount += 1;
    const progress = goalProgress(goal);
    if (progress.totalStepCount === 0) continue;
    totalSteps += progress.totalStepCount;
    completedSteps += closed
      ? progress.totalStepCount
      : progress.completedStepCount;
  }

  return {
    activeCount,
    completedCount,
    overallPercent:
      totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
  };
}

export function isGoalStepComplete(
  goal: GoalProgressInput,
  stepIndex: number,
): boolean {
  return goalProgress(goal).completedStepIndexes.includes(stepIndex);
}

export function canMarkGoalComplete(goal: GoalProgressInput): boolean {
  const progress = goalProgress(goal);
  return (
    progress.totalStepCount > 0 &&
    progress.completedStepCount === progress.totalStepCount
  );
}
