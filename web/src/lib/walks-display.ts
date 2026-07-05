import type { WalkCompletionRow, WalkItemResponse, WalkItemStatus, WalkTemplateRow } from "./api";

export function getWalkTemplateSections(
  template?: Pick<WalkTemplateRow, "sections" | "items"> | null,
): WalkTemplateRow["sections"] {
  if (!template) return [];
  const sections = template.sections ?? [];
  const items = template.items ?? [];
  if (sections.length > 0) return sections;
  if (items.length === 0) return [];
  return [
    {
      id: "legacy",
      title: "Observations",
      sortOrder: 0,
      items,
    },
  ];
}

export function formatWalkSaveError(err: unknown): string {
  if (!(err instanceof Error)) return "Could not save walk. Please try again.";
  const raw = err.message.trim();
  if (!raw.startsWith("[")) return raw || "Could not save walk. Please try again.";
  try {
    const issues = JSON.parse(raw) as Array<{ path?: string[]; message?: string }>;
    if (!Array.isArray(issues) || issues.length === 0) return "Could not save walk. Please check your entries.";
    const first = issues[0];
    if (first.path?.includes("items")) return "Add at least one observation item before saving.";
    if (first.path?.includes("sections")) return "Add at least one section with observations before saving.";
    return first.message || "Could not save walk. Please check your entries.";
  } catch {
    return raw || "Could not save walk. Please try again.";
  }
}

export function walkStatusLabel(status: WalkItemStatus): string {
  if (status === "pass") return "Pass";
  if (status === "needs_attention") return "Needs Attention";
  return "N/A";
}

export function walkStatusBadgeClass(status: WalkItemStatus): string {
  if (status === "pass") return "walk-badge walk-badge--pass";
  if (status === "needs_attention") return "walk-badge walk-badge--attention";
  return "walk-badge walk-badge--na";
}

export function formatWalkDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatWalkScore(completion: Pick<WalkCompletionRow, "scoringEnabled" | "score">): string {
  if (!completion.scoringEnabled) return "—";
  if (completion.score == null) return "—";
  return `${completion.score}%`;
}

export function computeWalkDraftStats(responses: WalkItemResponse[]) {
  let passCount = 0;
  let needsAttentionCount = 0;
  let naCount = 0;
  let photosCount = 0;
  let reviewed = 0;

  for (const row of responses) {
    if (!row.status) continue;
    reviewed += 1;
    if (row.status === "pass") passCount += 1;
    else if (row.status === "needs_attention") needsAttentionCount += 1;
    else naCount += 1;
    if (row.photoUrl) photosCount += 1;
  }

  return {
    totalReviewed: reviewed,
    passCount,
    needsAttentionCount,
    naCount,
    photosCount,
  };
}

export function allWalkItemsReviewed(totalItems: number, responses: WalkItemResponse[]): boolean {
  if (totalItems === 0) return false;
  return responses.filter((r) => r.status).length === totalItems;
}
