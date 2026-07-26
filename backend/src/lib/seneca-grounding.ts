/** Shared rules injected into Seneca prompts so answers stay tied to Alenio data. */
export const SENECA_DATA_GROUNDING_RULES = `DATA GROUNDING (critical):
- Alenio is the only source of CURRENT task and follow-up state. Use memberStats.overdueTasks, alenioOverdueTasks, openTasks, and lastCheckIn.openFollowUps for live facts.
- lastCheckIn discussion points, check-in responses, and lastCheckInInsights are HISTORICAL from the previous published check-in. Phrase them as "On the last check-in it was noted…" or "Previously discussed…" — never as present-tense current fact.
- Do NOT state that someone is overdue, behind, or non-compliant in Workday, LMS, email, HRIS, or any system outside Alenio unless that exact item appears as an open Alenio task in the context.
- If the last check-in mentioned external overdue items (training, Workday Learning, compliance courses, etc.) and they are NOT listed in alenioOverdueTasks or openFollowUps, suggest the manager check whether support is still needed — do not assert they are still overdue.
- When memberStats.overdueTasks > 0, cite the count and titles from alenioOverdueTasks as current Alenio overdue work.`;

/** Extra rules for workspace Seneca chat (live team health for the current team only). */
export const SENECA_WORKSPACE_CHAT_GROUNDING_RULES = `WORKSPACE CHAT GROUNDING (critical):
- Live facts for THIS workspace only are in the team health JSON: teamHealth, members[], overdueTasks, openTasks, membersNeedingCheckIn, upcomingCalendar, activeGoalDetails, recentWins, and development goal alerts.
- lastCheckIns highlights are HISTORICAL from each member's last published check-in. Phrase as "On the last check-in it was noted…" — never as present-tense current fact unless confirmed by openTasks / overdueTasks.
- scope is always current_workspace_only. Never cite, invent, compare against, or request data from other workspaces or teams.
- Be SPECIFIC, not generic. Prefer named people, task titles, dates, and check-in notes from context over abstract leadership advice.
- Never answer with vague platitudes (e.g. "communication is key", "stay engaged", "be a better coach") unless tied to a concrete fact and next step from this workspace.
- When coaching or prioritizing, name the top people at risk and cite overdueTasks / openTasks / membersNeedingCheckIn / lastCheckIns / activeGoalDetails.
- When asked about what's coming up, use upcomingCalendar (next 7 days in this workspace only).
- When asked about prioritization or workload, cite openTasks (priority, dueDate, overdue) and overdueTasks.
- When asked how someone is doing, combine members[] stats with lastCheckIns / activeGoalDetails / recentWins for that member — still this workspace only.
- When asked about team health or compliance, cite teamHealth.teamHealthPct, checkInCompliancePct, and developmentPlanCompliancePct when present.
- Cite overdue Alenio tasks from overdueTasks / openTasks / members[].overdueTasks. Cite who needs a check-in from membersNeedingCheckIn / members[].checkInStatus.
- CHECK-IN LANGUAGE (critical):
  - If noPublishedCheckInsYet is true OR publishedCheckInCount is 0, say this workspace has no published check-ins yet. Do NOT say members are "overdue for check-ins."
  - If members[].checkInRisk is "no_check_in_yet" OR daysSinceLastOneOnOne is null, say "no check-in on record yet" — never "overdue."
  - Only use "overdue check-in" when checkInRisk is "overdue" (they had a prior check-in that is past due).
  - membersNeedingCheckIn[].reason tells you which phrasing to use: no_check_in_yet | overdue | due_soon.
- End actionable answers with one clear next step the manager can take in Alenio (schedule check-in, assign task, review a person).
- On follow-ups, answer the new question with relevant facts only — do not rehash the prior reply.
- Workspace notes, Studio rules, and knowledge docs are coaching guidance — not live health numbers. Do not treat them as metrics.
- If a field is null or a list is empty, say the data is clear or unavailable — do not guess.`;

const EXTERNAL_SYSTEM_PATTERN =
  /\b(workday|work\s*day(?:\s+learning)?|cornerstone|docebo|linkedin\s*learning|udemy|skillsoft|absorb|lms|hris|adp|paylocity|ultipro|ukg|kronos|e-?learning|compliance\s+training|mandatory\s+training)\b/i;

const CURRENT_STATUS_CLAIM_PATTERN =
  /\b(is|are|has|have|still|currently)\s+(overdue|behind|incomplete|outstanding|non-?compliant)\b/i;

const OVERDUE_TOPIC_PATTERN = /\b(overdue|behind on|incomplete|outstanding|non-?compliant|past due)\b/i;

const ALREADY_GROUNDED_PATTERN =
  /^(previously noted|on the last check-in|last check-in was|currently \d+ overdue alenio|this is not verified in current alenio)/i;

export type SenecaGroundingContext = {
  alenioOverdueTitles: string[];
  openFollowUpTitles: string[];
  overdueTaskCount: number;
};

export function mentionsExternalSystem(text: string): boolean {
  return EXTERNAL_SYSTEM_PATTERN.test(text);
}

function isCurrentStatusClaim(text: string): boolean {
  return CURRENT_STATUS_CLAIM_PATTERN.test(text);
}

function matchesAlenioOverdueTask(text: string, titles: string[]): string | null {
  const lower = text.toLowerCase();
  for (const title of titles) {
    if (title && lower.includes(title.toLowerCase())) return title;
  }
  return null;
}

function buildCurrentAlenioOverdueBullet(count: number, titles: string[]): string | null {
  if (count <= 0) return null;
  const preview = titles.slice(0, 3).join("; ");
  const extra = titles.length > 3 ? ` (+${titles.length - 3} more)` : "";
  return `Currently ${count} overdue Alenio task${count !== 1 ? "s" : ""}${preview ? `: ${preview}${extra}` : ""}.`;
}

/** Rephrase a single insight so external or unverified overdue claims stay historical. */
export function groundInsightBullet(bullet: string, ctx: SenecaGroundingContext): string {
  const trimmed = bullet.trim();
  if (!trimmed || ALREADY_GROUNDED_PATTERN.test(trimmed)) return trimmed;

  const matchedAlenioTask = matchesAlenioOverdueTask(trimmed, ctx.alenioOverdueTitles);
  if (matchedAlenioTask) return trimmed;

  if (ctx.openFollowUpTitles.some((title) => title && trimmed.includes(title))) return trimmed;

  const external = mentionsExternalSystem(trimmed);
  const overdueTopic = OVERDUE_TOPIC_PATTERN.test(trimmed);

  if (external || overdueTopic) {
    const soundsCurrent = isCurrentStatusClaim(trimmed) || !/last (1:1|check-?in)|previously|noted/i.test(trimmed);
    if (soundsCurrent) {
      const topic = trimmed.replace(/^[^:]+:\s*/, "").trim() || trimmed;
      return `On the last check-in it was noted: ${topic}. This is not verified in current Alenio data — consider asking whether they still need support.`;
    }
  }

  if (!/last (check-?in|1:1)|previously/i.test(trimmed) && trimmed.includes(":")) {
    return `Previously noted in last check-in — ${trimmed}`;
  }

  return trimmed;
}

/** Post-process last-check-in insight bullets and inject current Alenio overdue facts when present. */
export function applyGroundedLastCheckInInsights(
  bullets: string[],
  ctx: SenecaGroundingContext,
): string[] {
  const grounded = bullets
    .map((bullet) => groundInsightBullet(bullet, ctx))
    .filter(Boolean);

  const alenioBullet = buildCurrentAlenioOverdueBullet(ctx.overdueTaskCount, ctx.alenioOverdueTitles);
  if (!alenioBullet) return grounded.slice(0, 6);

  const alreadyHasAlenioOverdue = grounded.some((item) =>
    /currently \d+ overdue alenio/i.test(item),
  );
  if (alreadyHasAlenioOverdue) return grounded.slice(0, 6);

  const header = grounded[0]?.toLowerCase().includes("last check-in was") ? 1 : 0;
  return [...grounded.slice(0, header), alenioBullet, ...grounded.slice(header)].slice(0, 6);
}

export function groundingContextFromSenecaRaw(ctx: {
  memberStats: { overdueTasks: number } | null;
  alenioOverdueTasks: string[];
  lastCheckIn: { openFollowUps: Array<{ title: string }> } | null;
}): SenecaGroundingContext {
  return {
    alenioOverdueTitles: ctx.alenioOverdueTasks,
    openFollowUpTitles: ctx.lastCheckIn?.openFollowUps.map((task) => task.title) ?? [],
    overdueTaskCount: ctx.memberStats?.overdueTasks ?? 0,
  };
}
