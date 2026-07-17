export const WALK_TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type WalkTemplateStatus = (typeof WALK_TEMPLATE_STATUSES)[number];

export const WALK_ITEM_TYPES = [
  "TEMPERATURE",
  "YES_NO",
  "MULTIPLE_CHOICE",
  "VISUAL_CHECK",
  "QUANTITY",
  "PHOTO",
  "TEXT",
  "INSTRUCTION",
] as const;
export type WalkItemType = (typeof WALK_ITEM_TYPES)[number];

/** Fully supported in Phase 1–2. */
export const PHASE1_WALK_ITEM_TYPES = ["TEMPERATURE", "YES_NO", "VISUAL_CHECK", "PHOTO"] as const;
export type Phase1WalkItemType = (typeof PHASE1_WALK_ITEM_TYPES)[number];

export const WALK_ITEM_RESPONSE_STATUSES = [
  "NOT_STARTED",
  "PASS",
  "FAIL",
  "NEEDS_ACTION",
  "RESOLVED",
  "NOT_APPLICABLE",
] as const;
export type WalkItemResponseStatus = (typeof WALK_ITEM_RESPONSE_STATUSES)[number];

export const WALK_RUN_STATUSES = ["IN_PROGRESS", "COMPLETED", "ABANDONED"] as const;
export type WalkRunStatus = (typeof WALK_RUN_STATUSES)[number];

export const CORRECTIVE_ACTION_TYPES = [
  "RETEST_TEMPERATURE",
  "TAKE_PHOTO",
  "ADD_NOTE",
  "SELECT_REASON",
  "NOTIFY_MANAGER",
  "DISCARD_PRODUCT",
  "MARK_RESOLVED",
  "BLOCK_COMPLETION",
] as const;
export type CorrectiveActionType = (typeof CORRECTIVE_ACTION_TYPES)[number];

export function isWalkItemType(value: string): value is WalkItemType {
  return (WALK_ITEM_TYPES as readonly string[]).includes(value);
}

export function isPhase1WalkItemType(value: string): value is Phase1WalkItemType {
  return (PHASE1_WALK_ITEM_TYPES as readonly string[]).includes(value);
}

export function isScorableItemType(type: WalkItemType): boolean {
  return type !== "INSTRUCTION";
}
