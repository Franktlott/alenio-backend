import {
  buildRecheckBranchActions,
  extractCorrectiveSteps,
  normalizeBranchActions,
  type TempCheckBranchAction,
} from "./temp-checks-display";

export type FlowWizardStepId =
  | "details"
  | "corrective-actions"
  | "recheck-rules"
  | "preview";

export const WIZARD_STEP_DEFS: Record<FlowWizardStepId, { label: string; description: string }> = {
  details: { label: "Equipment Details", description: "Name and temperature range" },
  "corrective-actions": { label: "Corrective Actions", description: "Steps leaders check off" },
  "recheck-rules": { label: "After Recheck", description: "If reading passes or fails" },
  preview: { label: "Preview & Publish", description: "Review and save" },
};

export function getWizardSteps(allowRecheck: boolean): { id: FlowWizardStepId; label: string; description: string }[] {
  const steps: FlowWizardStepId[] = ["details", "corrective-actions"];
  if (allowRecheck) steps.push("recheck-rules");
  steps.push("preview");
  return steps.map((id) => ({ id, ...WIZARD_STEP_DEFS[id] }));
}

export type EquipmentType = "cooler" | "freezer" | "hot_hold" | "ambient" | "other";

export type EquipmentFlowDetails = {
  name: string;
  equipmentType: EquipmentType;
  locationGroup: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  checkWindowStart: string;
  checkWindowEnd: string;
  checkFrequency: string;
  allowedRoles: string[];
};

export type EquipmentCheckFlowConfig = {
  version: 3;
  details: EquipmentFlowDetails;
  correctiveSteps: string[];
  allowRecheck: boolean;
  /** Steps leaders complete if the recheck still fails. */
  finalCorrectiveSteps: string[];
  allowSecondRecheck: boolean;
  allowClosureAfterFinal: boolean;
  publishedAt: string | null;
};

export type FlowHealthIssue =
  | "no_corrective_steps"
  | "no_final_corrective_steps"
  | "no_fail_outcome";

export type FlowHealth = {
  complete: boolean;
  issues: FlowHealthIssue[];
  labels: string[];
};

const ISSUE_LABELS: Record<FlowHealthIssue, string> = {
  no_corrective_steps: "Add at least one corrective step",
  no_final_corrective_steps: "Add at least one final corrective step",
  no_fail_outcome: "Allow a second recheck or closure after final actions",
};

export function defaultEquipmentFlowConfig(name = ""): EquipmentCheckFlowConfig {
  return {
    version: 3,
    details: {
      name,
      equipmentType: "cooler",
      locationGroup: "",
      tempMinF: null,
      tempMaxF: null,
      checkWindowStart: "06:00",
      checkWindowEnd: "10:00",
      checkFrequency: "Every shift",
      allowedRoles: ["team_leader"],
    },
    correctiveSteps: [],
    allowRecheck: false,
    finalCorrectiveSteps: [],
    allowSecondRecheck: false,
    allowClosureAfterFinal: true,
    publishedAt: null,
  };
}

export function validateEquipmentFlow(flow: EquipmentCheckFlowConfig): FlowHealth {
  const issues: FlowHealthIssue[] = [];
  const correctiveSteps = flow.correctiveSteps.map((step) => step.trim()).filter(Boolean);
  const finalCorrectiveSteps = flow.finalCorrectiveSteps.map((step) => step.trim()).filter(Boolean);

  if (correctiveSteps.length === 0) issues.push("no_corrective_steps");
  if (flow.allowRecheck) {
    if (finalCorrectiveSteps.length === 0) issues.push("no_final_corrective_steps");
    if (!flow.allowSecondRecheck && !flow.allowClosureAfterFinal) issues.push("no_fail_outcome");
  }
  const unique = [...new Set(issues)];
  return {
    complete: unique.length === 0 && flow.details.name.trim().length > 0,
    issues: unique,
    labels: unique.map((issue) => ISSUE_LABELS[issue]),
  };
}

export function buildFlowPreviewTree(flow: EquipmentCheckFlowConfig): string[] {
  const lines = [
    "Initial Temp Check",
    "├── Pass → Next item",
    "└── Fail → Check off corrective steps",
  ];
  if (flow.correctiveSteps.length === 0) {
    lines.push("    └── (No steps configured)");
    return lines;
  }
  flow.correctiveSteps.forEach((step, index) => {
    lines.push(`    ├── ${step}`);
  });
  if (!flow.allowRecheck) {
    lines.push("    └── Complete item");
    return lines;
  }
  lines.push("    └── Recheck immediately");
  lines.push("        ├── Pass → Next item");
  lines.push("        └── Fail → Final corrective steps");
  flow.finalCorrectiveSteps.forEach((step) => {
    lines.push(`            ├── ${step}`);
  });
  const outcomes: string[] = [];
  if (flow.allowSecondRecheck) outcomes.push("One more recheck");
  if (flow.allowClosureAfterFinal) outcomes.push("Close item");
  lines.push(`            └── Then: ${outcomes.join(" or ") || "Configure outcome"}`);
  return lines;
}

function buildLegacyCorrectiveActions(flow: EquipmentCheckFlowConfig): TempCheckBranchAction[] {
  const steps = flow.correctiveSteps.map((s) => s.trim()).filter(Boolean);
  if (steps.length === 0) return [];

  if (!flow.allowRecheck) {
    return [
      {
        label: "Corrective steps complete",
        actionType: "close",
        checklistItems: steps,
        requireInitials: false,
        requireNote: false,
        requirePhoto: false,
      },
    ];
  }

  const actions = buildRecheckBranchActions(steps);
  const finalSteps = flow.finalCorrectiveSteps.map((s) => s.trim()).filter(Boolean);

  if (flow.allowClosureAfterFinal && finalSteps.length > 0) {
    actions.push({
      label: "Close after final actions",
      actionType: "close",
      checklistItems: finalSteps,
      requireInitials: false,
      requireNote: false,
      requirePhoto: false,
    });
  }

  if (flow.allowSecondRecheck && finalSteps.length > 0) {
    actions.push({
      label: "Final actions complete — recheck again",
      actionType: "retemp",
      checklistItems: finalSteps,
      requireInitials: false,
      requireNote: false,
      requirePhoto: false,
    });
  }

  return actions;
}

function serializeCorrectiveActionsForApi(actions: TempCheckBranchAction[]) {
  return actions.map((action) => ({
    label: action.label,
    actionType: action.actionType,
    checklistItems: action.checklistItems,
    requireNote: action.requireNote,
    requirePhoto: action.requirePhoto,
  }));
}

export function flowConfigToLegacyPayload(flow: EquipmentCheckFlowConfig) {
  const maxRetakes = flow.allowRecheck ? (flow.allowSecondRecheck ? 2 : 1) : 1;
  return {
    name: flow.details.name.trim(),
    tempMinF: flow.details.tempMinF,
    tempMaxF: flow.details.tempMaxF,
    autoCloseWhenInRange: true,
    requireInitialsBeforeClose: false,
    retakeWaitMinutes: 0,
    maxRetakes,
    requireManagerNoteAfterFinalRetake: false,
    correctiveActions: serializeCorrectiveActionsForApi(buildLegacyCorrectiveActions(flow)),
    flowConfig: flow,
    equipmentType: flow.details.equipmentType,
    locationGroup: flow.details.locationGroup.trim() || null,
    checkWindowStart: flow.details.checkWindowStart,
    checkWindowEnd: flow.details.checkWindowEnd,
    checkFrequency: flow.details.checkFrequency.trim() || null,
    allowedRoles: flow.details.allowedRoles,
    flowStatus: flow.publishedAt ? "published" : "draft",
    flowIsComplete: validateEquipmentFlow(flow).complete,
  };
}

function migrateOlderFlowConfig(raw: Record<string, unknown>, input: {
  name: string;
  tempMinF: number | null;
  tempMaxF: number | null;
}): EquipmentCheckFlowConfig {
  const flow = defaultEquipmentFlowConfig(input.name);
  flow.details.tempMinF = input.tempMinF;
  flow.details.tempMaxF = input.tempMaxF;

  const details = raw.details as EquipmentFlowDetails | undefined;
  if (details) flow.details = { ...flow.details, ...details, name: input.name || details.name };

  if (Array.isArray(raw.correctiveSteps)) {
    flow.correctiveSteps = raw.correctiveSteps.filter((s): s is string => typeof s === "string");
  }

  const actions = raw.correctiveActions as Array<{ checklistSteps?: string[]; requiresRecheck?: boolean }> | undefined;
  if (actions?.length && flow.correctiveSteps.length === 0) {
    flow.correctiveSteps = actions.flatMap((a) => a.checklistSteps ?? []).filter(Boolean);
  }

  if (typeof raw.allowRecheck === "boolean") flow.allowRecheck = raw.allowRecheck;
  if (Array.isArray(raw.finalCorrectiveSteps)) {
    flow.finalCorrectiveSteps = raw.finalCorrectiveSteps.filter((s): s is string => typeof s === "string");
  }
  if (typeof raw.allowSecondRecheck === "boolean") flow.allowSecondRecheck = raw.allowSecondRecheck;
  if (typeof raw.allowClosureAfterFinal === "boolean") flow.allowClosureAfterFinal = raw.allowClosureAfterFinal;

  const recheck = raw.recheckRules as { mode?: string } | undefined;
  if (recheck?.mode === "required") flow.allowRecheck = true;

  return flow;
}

export function legacyEquipmentToFlowConfig(input: {
  name: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  equipmentType?: string | null;
  locationGroup?: string | null;
  checkWindowStart?: string | null;
  checkWindowEnd?: string | null;
  checkFrequency?: string | null;
  allowedRoles?: string[] | null;
  flowConfig?: EquipmentCheckFlowConfig | Record<string, unknown> | null;
  correctiveActions?: Array<string | TempCheckBranchAction>;
}): EquipmentCheckFlowConfig {
  const raw = input.flowConfig;
  if (raw && typeof raw === "object") {
    const version = (raw as { version?: number }).version;
    if (version === 3) {
      const flow = raw as EquipmentCheckFlowConfig;
      return {
        ...flow,
        details: {
          ...flow.details,
          name: input.name || flow.details.name,
          tempMinF: input.tempMinF ?? flow.details.tempMinF,
          tempMaxF: input.tempMaxF ?? flow.details.tempMaxF,
        },
      };
    }
    if (version === 2 || version === 1) {
      return migrateOlderFlowConfig(raw as Record<string, unknown>, input);
    }
  }

  const flow = defaultEquipmentFlowConfig(input.name);
  flow.details.tempMinF = input.tempMinF;
  flow.details.tempMaxF = input.tempMaxF;
  flow.details.equipmentType = (input.equipmentType as EquipmentType) || "cooler";
  flow.details.locationGroup = input.locationGroup ?? "";
  flow.details.checkWindowStart = input.checkWindowStart ?? "06:00";
  flow.details.checkWindowEnd = input.checkWindowEnd ?? "10:00";
  flow.details.checkFrequency = input.checkFrequency ?? "Every shift";
  flow.details.allowedRoles = input.allowedRoles?.length ? input.allowedRoles : ["team_leader"];

  const steps = extractCorrectiveSteps(normalizeBranchActions(input.correctiveActions));
  flow.correctiveSteps = steps;
  flow.allowRecheck = steps.length > 0;

  return flow;
}
