export type DevelopmentGoalProgress = {
  completedStepIndexes: number[];
  completedStepCount: number;
  totalStepCount: number;
  progressPercent: number;
};

export type CompletedStepDates = Record<number, string>;

export function parseCompletedStepDates(
  raw: string | null | undefined,
): CompletedStepDates {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([index, value]) =>
          Number.isInteger(Number(index)) &&
          Number(index) >= 0 &&
          typeof value === "string" &&
          !Number.isNaN(Date.parse(value)),
      ),
    );
  } catch {
    return {};
  }
}

export function parseCompletedStepIndexes(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value >= 0,
    );
  } catch {
    return [];
  }
}

export function sanitizeCompletedStepIndexes(
  indexes: readonly number[],
  totalStepCount: number,
): number[] {
  if (totalStepCount <= 0) return [];
  return [...new Set(indexes)]
    .filter((index) => index >= 0 && index < totalStepCount)
    .sort((a, b) => a - b);
}

export function isValidGoalStepIndex(
  stepIndex: number,
  totalStepCount: number,
): boolean {
  return (
    Number.isInteger(stepIndex) &&
    stepIndex >= 0 &&
    stepIndex < totalStepCount
  );
}

export function remapCompletedStepIndexes(
  previousSteps: readonly string[],
  nextSteps: readonly string[],
  completedStepIndexes: readonly number[],
): number[] {
  const completedLabels = new Map<string, number>();
  for (const index of sanitizeCompletedStepIndexes(
    completedStepIndexes,
    previousSteps.length,
  )) {
    const label = previousSteps[index];
    if (label === undefined) continue;
    completedLabels.set(label, (completedLabels.get(label) ?? 0) + 1);
  }

  const remapped: number[] = [];
  nextSteps.forEach((label, index) => {
    const remaining = completedLabels.get(label) ?? 0;
    if (remaining <= 0) return;
    remapped.push(index);
    completedLabels.set(label, remaining - 1);
  });
  return remapped;
}

export function remapCompletedStepDates(
  previousSteps: readonly string[],
  nextSteps: readonly string[],
  completedStepDates: CompletedStepDates,
): CompletedStepDates {
  const datesByLabel = new Map<string, string[]>();
  Object.entries(completedStepDates).forEach(([rawIndex, date]) => {
    const label = previousSteps[Number(rawIndex)];
    if (label === undefined) return;
    datesByLabel.set(label, [...(datesByLabel.get(label) ?? []), date]);
  });

  const remapped: CompletedStepDates = {};
  nextSteps.forEach((label, index) => {
    const dates = datesByLabel.get(label);
    const date = dates?.shift();
    if (date) remapped[index] = date;
  });
  return remapped;
}

export function toggleCompletedStepDate(
  rawCompletedStepDates: string | null | undefined,
  stepIndex: number,
  completed: boolean,
  completedAt = new Date(),
): CompletedStepDates {
  const dates = parseCompletedStepDates(rawCompletedStepDates);
  if (completed) {
    dates[stepIndex] = completedAt.toISOString();
  } else {
    delete dates[stepIndex];
  }
  return dates;
}

export function developmentGoalProgress(
  rawCompletedStepIndexes: string | null | undefined,
  totalStepCount: number,
): DevelopmentGoalProgress {
  const completedStepIndexes = sanitizeCompletedStepIndexes(
    parseCompletedStepIndexes(rawCompletedStepIndexes),
    totalStepCount,
  );
  const completedStepCount = completedStepIndexes.length;
  return {
    completedStepIndexes,
    completedStepCount,
    totalStepCount,
    progressPercent:
      totalStepCount === 0
        ? 0
        : Math.round((completedStepCount / totalStepCount) * 100),
  };
}

export function canCloseDevelopmentGoal(
  rawCompletedStepIndexes: string | null | undefined,
  totalStepCount: number,
): boolean {
  const progress = developmentGoalProgress(
    rawCompletedStepIndexes,
    totalStepCount,
  );
  return (
    progress.totalStepCount > 0 &&
    progress.completedStepCount === progress.totalStepCount
  );
}

export function toggleCompletedStepIndex(
  rawCompletedStepIndexes: string | null | undefined,
  totalStepCount: number,
  stepIndex: number,
  completed: boolean,
): number[] {
  const current = developmentGoalProgress(
    rawCompletedStepIndexes,
    totalStepCount,
  ).completedStepIndexes;
  const next = completed
    ? [...current, stepIndex]
    : current.filter((index) => index !== stepIndex);
  return sanitizeCompletedStepIndexes(next, totalStepCount);
}
