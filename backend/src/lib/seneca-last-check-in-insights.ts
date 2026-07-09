type CheckInField = { id: string; label: string; type: string };

function truncate(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatResponseValue(field: CheckInField, raw: string | number): string {
  if (field.type === "yes_no") {
    const answer = String(raw).toLowerCase();
    if (answer === "yes") return "Yes";
    if (answer === "no") return "No";
    return String(raw);
  }
  if (field.type === "rating") {
    return `Rated ${String(raw)}`;
  }
  return truncate(String(raw), field.type === "long_text" || field.type === "manager_notes" ? 220 : 120);
}

/** Text written for the associate to read before/after a meeting — not manager prep insights. */
export function isAssociateFacingLeaderText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const patterns = [
    /^during our (upcoming|next) check-?in/,
    /\b(upcoming|next) check-?in\b/,
    /\bi would like (you|to focus)\b/,
    /\bplease (share|discuss|reflect|prepare)\b/,
    /\byour (thoughts|accomplishments|goals)\b/,
    /\blet(?:'s| us) (focus|discuss|explore)\b/,
    /\bcome prepared\b/,
    /\bbefore (our|the) (next|upcoming) meeting\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export type LastCheckInInsightSource = {
  date: string;
  daysAgo: number;
  templateTitle: string;
  discussionPoints: Array<{ label: string; response: string }>;
  leaderSummaryForAssociate: string | null;
  associateFeedback: string | null;
  openFollowUpCount: number;
  openFollowUpTitles: string[];
};

export function extractLastCheckInSource(
  meeting: { createdAt: Date; publishedAt?: Date | null; status?: string; templateTitle: string },
  fields: CheckInField[],
  responses: Record<string, string | number>,
  openFollowUps: Array<{ title: string }>,
  now = new Date(),
): LastCheckInInsightSource {
  const completedAt = meeting.publishedAt ?? meeting.createdAt;
  const daysAgo = Math.max(
    0,
    Math.floor((now.getTime() - completedAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const discussionPoints: Array<{ label: string; response: string }> = [];
  let leaderSummaryForAssociate: string | null = null;
  let associateFeedback: string | null = null;

  for (const field of fields) {
    if (field.type === "section") continue;
    const raw = responses[field.id];
    if (raw === undefined || raw === "" || raw === 0) continue;

    if (field.type === "associate_notes") {
      associateFeedback = truncate(String(raw), 220);
      continue;
    }

    if (field.type === "manager_notes") {
      const text = String(raw).trim();
      if (text) leaderSummaryForAssociate = text;
      continue;
    }

    discussionPoints.push({
      label: field.label,
      response: formatResponseValue(field, raw),
    });
  }

  return {
    date: completedAt.toISOString(),
    daysAgo,
    templateTitle: meeting.templateTitle,
    discussionPoints,
    leaderSummaryForAssociate,
    associateFeedback,
    openFollowUpCount: openFollowUps.length,
    openFollowUpTitles: openFollowUps.map((task) => task.title),
  };
}

function formatCheckInDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysAgoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Manager-facing retrospective bullets from the previous published check-in. */
export function buildRuleBasedLastCheckInInsights(source: LastCheckInInsightSource | null): string[] {
  if (!source) return [];

  const insights: string[] = [];
  const when = formatCheckInDate(source.date);
  insights.push(
    `Last check-in was "${source.templateTitle}" on ${when} (${daysAgoLabel(source.daysAgo)}).`,
  );

  for (const point of source.discussionPoints.slice(0, 4)) {
    insights.push(`Previously noted in last check-in — ${point.label}: ${point.response}`);
  }

  if (source.associateFeedback) {
    insights.push(`Previously shared in last check-in — associate feedback: ${source.associateFeedback}`);
  }

  if (source.leaderSummaryForAssociate && !isAssociateFacingLeaderText(source.leaderSummaryForAssociate)) {
    insights.push(`Commitments recorded: ${truncate(source.leaderSummaryForAssociate, 200)}`);
  } else if (source.leaderSummaryForAssociate) {
    insights.push("Leader left summary notes for the associate — follow up on whether those commitments landed.");
  }

  if (source.openFollowUpCount > 0) {
    const titles = source.openFollowUpTitles.slice(0, 3).join("; ");
    const extra =
      source.openFollowUpCount > 3 ? ` (+${source.openFollowUpCount - 3} more)` : "";
    insights.push(
      `${source.openFollowUpCount} follow-up task${source.openFollowUpCount !== 1 ? "s" : ""} still open${titles ? `: ${titles}${extra}` : ""}.`,
    );
  }

  return insights.slice(0, 6);
}

export function mergeLastCheckInInsights(
  aiInsights: string[] | null | undefined,
  source: LastCheckInInsightSource | null,
): string[] {
  const fallback = buildRuleBasedLastCheckInInsights(source);
  const fromAi = (aiInsights ?? []).map((item) => item.trim()).filter(Boolean);
  if (fromAi.length === 0) return fallback;

  const associateText = source?.leaderSummaryForAssociate?.trim().toLowerCase() ?? "";
  const echoesAssociateScript = fromAi.some((item) => {
    const lower = item.toLowerCase();
    if (isAssociateFacingLeaderText(item)) return true;
    if (associateText && lower.includes(associateText.slice(0, 48))) return true;
    return false;
  });

  if (echoesAssociateScript) return fallback;
  return fromAi.slice(0, 6);
}
