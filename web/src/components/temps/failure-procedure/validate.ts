import type { FailureProcedureDraft, FailureTypedStep } from "./types";

function missingRequiredSteps(
  steps: FailureTypedStep[],
  label: string,
): string[] {
  const missing: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.required && !step.text.trim()) {
      missing.push(`${label} step ${i + 1}`);
    }
  }
  return missing;
}

/** Returns human-readable labels for required Failure Procedure inputs that are empty. */
export function getFailureProcedureMissing(draft: FailureProcedureDraft): string[] {
  const missing = missingRequiredSteps(draft.firstFailureSteps, "Initial Failure");

  // Initial Failure Procedure panel is marked Required — need at least one filled step.
  if (!draft.firstFailureSteps.some((s) => s.text.trim()) && missing.length === 0) {
    missing.push("At least one Initial Failure step");
  }

  if (draft.allowRetempAfterSteps) {
    missing.push(...missingRequiredSteps(draft.ifFailSteps, "If Retest Fails"));
    if (!draft.ifFailSteps.some((s) => s.text.trim()) && !missing.some((m) => m.startsWith("If Retest"))) {
      missing.push("At least one If Retest Fails step");
    }
  }

  return missing;
}
