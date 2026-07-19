import type { FailureBranchId, FailureProcedureDraft, FailureTypedStep } from "./types";
import { emptyFailureProcedure, emptyTypedStep, newFailureStepId } from "./types";

type ApiAction = {
  id?: string;
  actionType: string;
  title: string;
  instructions?: string | null;
  required?: boolean;
  blocksCompletion?: boolean;
  config?: Record<string, unknown> | null;
};

export function procedureToApiActions(draft: FailureProcedureDraft): ApiAction[] {
  const out: ApiAction[] = [];

  for (const step of draft.firstFailureSteps) {
    const text = step.text.trim();
    if (!text) continue;
    out.push({
      actionType: "CUSTOM_INSTRUCTION",
      title: text.slice(0, 200),
      instructions: text,
      required: step.required,
      blocksCompletion: step.required,
      config: { branch: "first_failure" satisfies FailureBranchId },
    });
  }

  // Outcomes only apply when retemp after steps is enabled.
  if (!draft.allowRetempAfterSteps) return out;

  const passNote = draft.ifPassNote.trim();
  if (passNote) {
    out.push({
      actionType: "CUSTOM_INSTRUCTION",
      title: passNote.slice(0, 200),
      instructions: passNote,
      required: false,
      blocksCompletion: false,
      config: { branch: "if_pass" satisfies FailureBranchId },
    });
  }

  for (const step of draft.ifFailSteps) {
    const text = step.text.trim();
    if (!text) continue;
    out.push({
      actionType: "CUSTOM_INSTRUCTION",
      title: text.slice(0, 200),
      instructions: text,
      required: step.required,
      blocksCompletion: step.required,
      config: { branch: "if_fail" satisfies FailureBranchId },
    });
  }

  return out;
}

function stepFromAction(a: ApiAction): FailureTypedStep {
  return {
    id: a.id || newFailureStepId(),
    text: (a.title || a.instructions || "").trim(),
    required: Boolean(a.required || a.blocksCompletion),
  };
}

function branchOf(a: ApiAction): FailureBranchId | null {
  const raw = a.config && typeof a.config === "object" ? a.config.branch : null;
  if (raw === "first_failure" || raw === "if_pass" || raw === "if_fail") return raw;
  return null;
}

export function apiActionsToProcedure(
  actions: ApiAction[],
  options?: { allowRetempAfterSteps?: boolean; retempNote?: string },
): FailureProcedureDraft {
  const retempNote = (options?.retempNote ?? "").trim();

  if (!actions.length) {
    return {
      ...emptyFailureProcedure(),
      allowRetempAfterSteps: options?.allowRetempAfterSteps === true,
      retempNote,
    };
  }

  const first: FailureTypedStep[] = [];
  const fail: FailureTypedStep[] = [];
  let ifPassNote = "";
  let hasBranchMeta = false;

  for (const a of actions) {
    const branch = branchOf(a);
    if (branch) hasBranchMeta = true;
    if (branch === "if_pass") {
      ifPassNote = (a.instructions || a.title || "").trim();
      continue;
    }
    if (branch === "if_fail") {
      fail.push(stepFromAction(a));
      continue;
    }
    // first_failure or unknown → first failure for now
    first.push(stepFromAction(a));
  }

  // Legacy flat lists (no branch meta): everything is 1st failure
  if (!hasBranchMeta) {
    return {
      firstFailureSteps: first.length ? first : [emptyTypedStep()],
      allowRetempAfterSteps: options?.allowRetempAfterSteps === true,
      retempNote,
      ifPassNote: "",
      ifFailSteps: [emptyTypedStep()],
    };
  }

  const hasOutcomes = fail.length > 0 || Boolean(ifPassNote);
  return {
    firstFailureSteps: first.length ? first : [emptyTypedStep()],
    allowRetempAfterSteps: options?.allowRetempAfterSteps === true || hasOutcomes,
    retempNote,
    ifPassNote,
    ifFailSteps: fail.length ? fail : [emptyTypedStep()],
  };
}
