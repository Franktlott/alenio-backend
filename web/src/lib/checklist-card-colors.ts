export const CHECKLIST_CARD_COLORS = [
  { id: "violet", label: "Violet", accent: "#7c3aed", bg: "#ede9fe", border: "#ddd6fe", surface: "#f5f3ff" },
  { id: "indigo", label: "Indigo", accent: "#6366f1", bg: "#e0e7ff", border: "#c7d2fe", surface: "#eef2ff" },
  { id: "blue", label: "Blue", accent: "#3b82f6", bg: "#dbeafe", border: "#bfdbfe", surface: "#eff6ff" },
  { id: "cyan", label: "Cyan", accent: "#06b6d4", bg: "#cffafe", border: "#a5f3fc", surface: "#ecfeff" },
  { id: "green", label: "Green", accent: "#22c55e", bg: "#dcfce7", border: "#bbf7d0", surface: "#f0fdf4" },
  { id: "amber", label: "Amber", accent: "#f59e0b", bg: "#fef3c7", border: "#fde68a", surface: "#fffbeb" },
  { id: "orange", label: "Orange", accent: "#f97316", bg: "#ffedd5", border: "#fed7aa", surface: "#fff7ed" },
  { id: "rose", label: "Rose", accent: "#f43f5e", bg: "#ffe4e6", border: "#fecdd3", surface: "#fff1f2" },
  { id: "pink", label: "Pink", accent: "#ec4899", bg: "#fce7f3", border: "#fbcfe8", surface: "#fdf2f8" },
  { id: "slate", label: "Slate", accent: "#64748b", bg: "#e2e8f0", border: "#cbd5e1", surface: "#f8fafc" },
] as const;

export type ChecklistCardColorId = (typeof CHECKLIST_CARD_COLORS)[number]["id"];

export type ChecklistCardColorDef = (typeof CHECKLIST_CARD_COLORS)[number];

const DEFAULT_COLOR = CHECKLIST_CARD_COLORS[1]!;

export function resolveChecklistCardColor(cardColor: string | null | undefined): ChecklistCardColorDef {
  return CHECKLIST_CARD_COLORS.find((c) => c.id === cardColor) ?? DEFAULT_COLOR;
}

export function checklistCardColorStyles(cardColor: string | null | undefined): {
  background: string;
  borderColor: string;
  accent: string;
  iconBg: string;
} {
  const color = resolveChecklistCardColor(cardColor);
  return {
    background: color.surface,
    borderColor: color.border,
    accent: color.accent,
    iconBg: color.bg,
  };
}
