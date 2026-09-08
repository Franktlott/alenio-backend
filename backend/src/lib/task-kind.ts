export const TASK_KINDS = ["workspace_task", "reminder"] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export type TaskClassification = {
  kind: TaskKind;
  /** Immutable creation-time snapshot; reminders must always be false. */
  momentumEligible: boolean;
};

/** Safe classification for tasks and recurrence series created before kinds existed. */
export const LEGACY_TASK_CLASSIFICATION: Readonly<TaskClassification> = Object.freeze({
  kind: "workspace_task",
  momentumEligible: false,
});

export function isTaskKind(value: unknown): value is TaskKind {
  return typeof value === "string" && TASK_KINDS.includes(value as TaskKind);
}
