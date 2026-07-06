export type TempCheckActionType = "close" | "retemp";

export type ParsedCorrectiveAction = {
  label: string;
  actionType: TempCheckActionType;
  checklistItems: string[];
  requireInitials: boolean;
  requireNote: boolean;
  requirePhoto: boolean;
};

export type CorrectiveActionInput =
  | string
  | {
      label: string;
      actionType?: string | null;
      checklistItems?: string[] | null;
      requireInitials?: boolean | null;
      requireNote?: boolean | null;
      requirePhoto?: boolean | null;
    };

export function isTempCheckActionType(value: string): value is TempCheckActionType {
  return value === "close" || value === "retemp";
}

export function parseChecklistItems(raw: string[] | null | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const label = row.trim().slice(0, 200);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

export function parseChecklistItemsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return parseChecklistItems(value.filter((row): row is string => typeof row === "string"));
}

export function parseCorrectiveActions(raw: CorrectiveActionInput[] | undefined): ParsedCorrectiveAction[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: ParsedCorrectiveAction[] = [];
  for (const row of raw) {
    const label = (typeof row === "string" ? row : row.label).trim().slice(0, 200);
    if (!label || seen.has(label.toLowerCase())) continue;
    const rawType = typeof row === "string" ? "close" : row.actionType?.trim().toLowerCase();
    const actionType: TempCheckActionType = rawType === "retemp" ? "retemp" : "close";
    const checklistItems =
      typeof row === "string" ? [] : parseChecklistItems(row.checklistItems ?? undefined);
    const requireInitials = false;
    const requireNote = typeof row === "string" ? false : row.requireNote === true;
    const requirePhoto = typeof row === "string" ? false : row.requirePhoto === true;
    seen.add(label.toLowerCase());
    out.push({ label, actionType, checklistItems, requireInitials, requireNote, requirePhoto });
    if (out.length >= 12) break;
  }
  return out;
}

export function hasCloseAction(actions: ParsedCorrectiveAction[]): boolean {
  return actions.some((action) => action.actionType === "close");
}

export function hasRecheckChecklist(actions: ParsedCorrectiveAction[]): boolean {
  return actions.some((action) => action.actionType === "retemp" && action.checklistItems.length > 0);
}

export function hasCompletingAction(actions: ParsedCorrectiveAction[]): boolean {
  return actions.some((action) => action.actionType === "close");
}
