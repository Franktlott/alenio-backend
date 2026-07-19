import type {
  TemperatureConfig,
  WalkRun,
  WalkRunCorrectiveAction,
  WalkRunItem,
} from "./types";

function flattenRunItems(run: WalkRun) {
  return [...run.items].sort((a, b) => a.position - b.position);
}

type CaDef = {
  id: string;
  title: string;
  actionType: string;
  instructions: string | null;
  required?: boolean;
  blocksCompletion?: boolean;
  branch?: "first_failure" | "if_pass" | "if_fail" | null;
  config?: Record<string, unknown> | null;
};

function boundNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Same pass/fail rules as backend `evaluateTemperature`. */
export function evaluateTemp(
  value: number,
  config: TemperatureConfig,
): { pass: boolean; detail: string } | null {
  if (!Number.isFinite(value)) return null;
  const unit = config.unit ?? "F";
  const min = boundNumber(config.minimumTemperature);
  const max = boundNumber(config.maximumTemperature);
  if (config.comparisonType === "BETWEEN") {
    if (min == null || max == null) return null;
    const ok = value >= min && value <= max;
    return {
      pass: ok,
      detail: ok ? `Within ${min}–${max}°${unit}` : `Outside ${min}–${max}°${unit}`,
    };
  }
  if (config.comparisonType === "BELOW") {
    if (max == null) return null;
    const ok = value <= max;
    return {
      pass: ok,
      detail: ok ? `At or below ${max}°${unit}` : `Above required ${max}°${unit}`,
    };
  }
  if (min == null) return null;
  const ok = value >= min;
  return {
    pass: ok,
    detail: ok ? `Above required ${min}°${unit}` : `Below required ${min}°${unit}`,
  };
}

function correctiveBranch(
  action: { branch?: string | null; config?: Record<string, unknown> | null },
): "first_failure" | "if_pass" | "if_fail" | null {
  if (
    action.branch === "first_failure" ||
    action.branch === "if_pass" ||
    action.branch === "if_fail"
  ) {
    return action.branch;
  }
  const raw = action.config?.branch;
  if (raw === "first_failure" || raw === "if_pass" || raw === "if_fail") return raw;
  return null;
}

function isAssociateAction(action: CaDef): boolean {
  return correctiveBranch(action) !== "if_pass";
}

function isFirstFailureAction(action: CaDef): boolean {
  const branch = correctiveBranch(action);
  return branch === "first_failure" || branch == null;
}

function isIfFailAction(action: CaDef): boolean {
  return correctiveBranch(action) === "if_fail";
}

function caDefsFromItem(item: WalkRunItem): CaDef[] {
  const top = item.correctiveActions ?? [];
  if (top.length > 0) {
    return top.map((a) => ({
      id: a.id,
      title: a.title,
      actionType: a.actionType,
      instructions: a.instructions ?? null,
      required: a.required,
      blocksCompletion: a.blocksCompletion,
      branch: a.branch ?? correctiveBranch(a),
      config: a.config ?? null,
    }));
  }
  return (item.response?.correctiveActions ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    actionType: a.actionType,
    instructions: a.instructions ?? null,
    required: a.required,
    blocksCompletion: a.blocksCompletion,
    branch: a.branch ?? correctiveBranch(a),
    config: a.config ?? null,
  }));
}

function toUiAction(
  action: CaDef,
  status: string,
  completedAt: string | null = null,
): WalkRunCorrectiveAction {
  const required = Boolean(
    action.required || action.blocksCompletion || action.actionType === "BLOCK_COMPLETION",
  );
  return {
    id: action.id,
    title: action.title,
    actionType: action.actionType,
    instructions: action.instructions ?? null,
    required,
    blocksCompletion: Boolean(
      action.blocksCompletion || action.actionType === "BLOCK_COMPLETION" || required,
    ),
    branch: correctiveBranch(action),
    config: action.config ?? null,
    status,
    completedAt,
  };
}

function recomputeProgress(items: WalkRunItem[]): WalkRun["progress"] {
  const nonInstruction = items.filter((i) => i.type !== "INSTRUCTION");
  return {
    total: nonInstruction.length,
    answered: items.filter(
      (i) => i.response && i.response.status !== "NOT_STARTED",
    ).length,
    requiredRemaining: items.filter((i) => {
      if (!i.required || i.type === "INSTRUCTION") return false;
      const resp = i.response;
      return !resp || resp.status === "NOT_STARTED" || resp.status === "NEEDS_ACTION";
    }).length,
  };
}

function replaceItem(run: WalkRun, itemId: string, nextItem: WalkRunItem): WalkRun {
  const items = run.items.map((i) => (i.id === itemId ? nextItem : i));
  return { ...run, items, progress: recomputeProgress(items) };
}

export function applyLocalTemperature(
  run: WalkRun,
  itemId: string,
  payload: {
    value: number;
    unit: "F" | "C";
    source: "manual" | "bluetooth";
    retestCount?: number;
  },
): WalkRun {
  const item = flattenRunItems(run).find((i) => i.id === itemId);
  if (!item || item.type !== "TEMPERATURE") return run;

  const config = (item.config ?? {}) as TemperatureConfig;
  const verdict = evaluateTemp(payload.value, config);
  const pass = verdict?.pass === true;
  const retestCount = payload.retestCount ?? 0;
  const isRetest = retestCount >= 1;
  const requireRetest = Boolean(config.requireRetestOnFailure);
  const defs = caDefsFromItem(item).filter(isAssociateAction);
  const firstFailure = defs.filter(isFirstFailureAction);
  const ifFail = defs.filter(isIfFailAction);
  const hasProcedure = firstFailure.length > 0 || ifFail.length > 0;

  let status: string = pass ? "PASS" : "FAIL";
  let failed = !pass;
  let correctiveActions: WalkRunCorrectiveAction[] = defs.map((a) =>
    toUiAction(a, "LOCKED"),
  );

  if (hasProcedure && failed && !isRetest) {
    status = "NEEDS_ACTION";
    correctiveActions = defs.map((a) => {
      if (isFirstFailureAction(a) && firstFailure.length > 0) return toUiAction(a, "PENDING");
      if (isIfFailAction(a)) return toUiAction(a, "LOCKED");
      return toUiAction(a, "LOCKED");
    });
    // Legacy: only if_fail and retest off
    if (firstFailure.length === 0 && ifFail.length > 0 && !requireRetest) {
      correctiveActions = defs.map((a) =>
        isIfFailAction(a) ? toUiAction(a, "PENDING") : toUiAction(a, "LOCKED"),
      );
    }
  } else if (hasProcedure && isRetest && pass) {
    status = "RESOLVED";
    failed = false;
    const prior = item.response?.correctiveActions ?? [];
    correctiveActions = defs.map((a) => {
      const prev = prior.find((p) => p.id === a.id);
      if (prev?.status === "COMPLETED" || prev?.status === "SKIPPED") {
        return toUiAction(a, prev.status, prev.completedAt);
      }
      return toUiAction(a, "SKIPPED");
    });
  } else if (hasProcedure && isRetest && !pass && ifFail.length > 0) {
    status = "NEEDS_ACTION";
    failed = true;
    const prior = item.response?.correctiveActions ?? [];
    correctiveActions = defs.map((a) => {
      const prev = prior.find((p) => p.id === a.id);
      if (prev?.status === "COMPLETED" || prev?.status === "SKIPPED") {
        return toUiAction(a, prev.status, prev.completedAt);
      }
      if (isIfFailAction(a)) return toUiAction(a, "PENDING");
      return toUiAction(a, prev?.status ?? "LOCKED", prev?.completedAt ?? null);
    });
  } else if (hasProcedure && isRetest && !pass) {
    // Retemp failed and there are no 2nd-failure steps — close the procedure.
    status = "RESOLVED";
    failed = false;
    const prior = item.response?.correctiveActions ?? [];
    correctiveActions = defs.map((a) => {
      const prev = prior.find((p) => p.id === a.id);
      if (prev?.status === "COMPLETED" || prev?.status === "SKIPPED") {
        return toUiAction(a, prev.status, prev.completedAt);
      }
      return toUiAction(a, "SKIPPED");
    });
  } else if (hasProcedure && failed) {
    status = "NEEDS_ACTION";
  } else if (pass) {
    correctiveActions = defs.map((a) => toUiAction(a, "SKIPPED"));
  }

  const responseBody = {
    value: payload.value,
    unit: payload.unit,
    source: payload.source,
    ...(retestCount > 0 ? { retestCount } : {}),
  };

  const nextItem: WalkRunItem = {
    ...item,
    correctiveActions: item.correctiveActions ?? defs.map((a) => toUiAction(a, "LOCKED")),
    response: {
      id: item.response?.id ?? `local-${itemId}`,
      status,
      response: responseBody,
      failed,
      notes: item.response?.notes ?? null,
      correctiveActions,
    },
  };

  return replaceItem(run, itemId, nextItem);
}

export function applyLocalCorrectiveCompletions(
  run: WalkRun,
  itemId: string,
  actionIds: string[],
): WalkRun {
  const item = flattenRunItems(run).find((i) => i.id === itemId);
  if (!item?.response) return run;

  const config = (item.config ?? {}) as TemperatureConfig;
  const requireRetest = Boolean(config.requireRetestOnFailure);
  const responsePayload =
    item.response.response && typeof item.response.response === "object"
      ? (item.response.response as Record<string, unknown>)
      : null;
  const retestCount =
    typeof responsePayload?.retestCount === "number" ? responsePayload.retestCount : 0;

  const now = new Date().toISOString();
  const completed = new Set(actionIds);
  const correctiveActions = (item.response.correctiveActions ?? []).map((a) => {
    if (!completed.has(a.id)) return a;
    if (a.status === "COMPLETED" || a.status === "SKIPPED") return a;
    return { ...a, status: "COMPLETED", completedAt: now };
  });

  const pendingLeft = correctiveActions.some((a) => a.status === "PENDING");
  let status = item.response.status;
  let failed = item.response.failed;

  if (!pendingLeft) {
    const awaitingRetemp = requireRetest && retestCount < 1;
    if (!awaitingRetemp) {
      status = "RESOLVED";
      failed = false;
    }
    // else keep NEEDS_ACTION for retemp
  }

  const nextItem: WalkRunItem = {
    ...item,
    response: {
      ...item.response,
      status,
      failed,
      correctiveActions,
    },
  };
  return replaceItem(run, itemId, nextItem);
}

export function resetLocalItem(run: WalkRun, itemId: string): WalkRun {
  const item = flattenRunItems(run).find((i) => i.id === itemId);
  if (!item) return run;
  const nextItem: WalkRunItem = {
    ...item,
    response: null,
  };
  return replaceItem(run, itemId, nextItem);
}
