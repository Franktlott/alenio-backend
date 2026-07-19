export type FailureTypedStep = {
  id: string;
  text: string;
  required: boolean;
};

export type FailureBranchId = "first_failure" | "if_pass" | "if_fail";

export type FailureProcedureDraft = {
  firstFailureSteps: FailureTypedStep[];
  /**
   * When true, associates retemp after 1st-failure steps; If Pass / If Fail apply.
   * Persisted as item config.requireRetestOnFailure.
   */
  allowRetempAfterSteps: boolean;
  /**
   * Optional guidance shown during retemp (e.g. "Retemp 2 additional products").
   * Persisted as item config.retestGuidance.
   */
  retempNote: string;
  /** Optional note shown when a recheck passes after 1st failure steps. */
  ifPassNote: string;
  ifFailSteps: FailureTypedStep[];
};

/** @deprecated Use FailureTypedStep / FailureProcedureDraft */
export type FailureStepDraft = {
  id: string;
  actionKey: string;
  title: string;
  instructions: string;
  required: boolean;
};

export function newFailureStepId() {
  return `fp-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyTypedStep(text = ""): FailureTypedStep {
  return {
    id: newFailureStepId(),
    text,
    required: true,
  };
}

export function emptyFailureProcedure(): FailureProcedureDraft {
  return {
    firstFailureSteps: [emptyTypedStep()],
    allowRetempAfterSteps: false,
    retempNote: "",
    ifPassNote: "",
    ifFailSteps: [emptyTypedStep()],
  };
}
