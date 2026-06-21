export const CHECKLIST_CARD_COLOR_IDS = [
  "violet",
  "indigo",
  "blue",
  "cyan",
  "green",
  "amber",
  "orange",
  "rose",
  "pink",
  "slate",
] as const;

export type ChecklistCardColorId = (typeof CHECKLIST_CARD_COLOR_IDS)[number];

const COLOR_ID_SET = new Set<string>(CHECKLIST_CARD_COLOR_IDS);

export function isChecklistCardColorId(value: string): value is ChecklistCardColorId {
  return COLOR_ID_SET.has(value);
}

/** Returns null to clear, undefined when invalid or omitted. */
export function parseChecklistCardColor(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const id = raw.trim();
  if (!id) return null;
  return isChecklistCardColorId(id) ? id : undefined;
}
