import type { DevelopmentGoal } from "./api";
import { alenioLogoUrl, escapeHtml, printHtmlInHiddenFrame } from "./print-html";

export type DevelopmentPlanPrintOptions = {
  goals: DevelopmentGoal[];
  memberName: string;
  managerName: string | null;
};

function formatPrintDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatPrintDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function displayUserName(user: { name: string; email: string } | undefined): string {
  return user?.name?.trim() || user?.email || "—";
}

function lastUpdatedAt(goal: DevelopmentGoal): string {
  if (goal.notes.length === 0) return goal.createdAt;
  return goal.notes.reduce(
    (latest, note) => (new Date(note.createdAt) > new Date(latest) ? note.createdAt : latest),
    goal.notes[0].createdAt,
  );
}

function renderStepsHtml(steps: string[]): string {
  if (steps.length === 0) {
    return `<p class="empty-line">No steps listed.</p>`;
  }
  return `<ol class="step-list">${steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("")}</ol>`;
}

function renderNotesHtml(goal: DevelopmentGoal): string {
  if (goal.notes.length === 0) {
    return `<p class="empty-line">No notes yet.</p>`;
  }
  return goal.notes
    .map(
      (note) => `
        <div class="note">
          <div class="note-body">${escapeHtml(note.body)}</div>
          <div class="note-meta">${escapeHtml(displayUserName(note.createdBy))} · ${escapeHtml(formatPrintDateTime(note.createdAt))}</div>
        </div>
      `,
    )
    .join("");
}

function closedDateForGoal(goal: DevelopmentGoal): string {
  const iso = goal.closedAt ?? lastUpdatedAt(goal);
  return formatPrintDate(iso);
}

function renderActiveGoalHtml(goal: DevelopmentGoal, index: number): string {
  const addedBy = displayUserName(goal.createdBy);
  const created = formatPrintDate(goal.createdAt);
  const updated = formatPrintDate(lastUpdatedAt(goal));

  return `
    <div class="goal">
      <div class="goal-head">
        <span class="goal-num">${index + 1}</span>
        <div class="goal-title-block">
          <h2 class="goal-title">${escapeHtml(goal.skill)}</h2>
          <p class="goal-meta">Added ${escapeHtml(created)} · ${escapeHtml(addedBy)}</p>
        </div>
        <span class="goal-status goal-status--active">Active</span>
      </div>

      <div class="goal-block">
        <h3 class="block-label">Steps to develop this skill</h3>
        ${renderStepsHtml(goal.steps)}
      </div>

      <div class="goal-block">
        <h3 class="block-label">Progress notes</h3>
        ${renderNotesHtml(goal)}
      </div>

      <div class="goal-footer">
        <span>Created ${escapeHtml(created)}</span>
        <span>Last updated ${escapeHtml(updated)}</span>
      </div>
    </div>
  `;
}

function renderClosedGoalRowHtml(goal: DevelopmentGoal): string {
  const closed = closedDateForGoal(goal);
  return `
    <li class="closed-goal-row">
      <span class="closed-goal-title">${escapeHtml(goal.skill)}</span>
      <span class="closed-goal-date">Closed ${escapeHtml(closed)}</span>
    </li>
  `;
}

function renderSingleGoalHtml(goal: DevelopmentGoal, index: number): string {
  return renderActiveGoalHtml(goal, index);
}

function renderGoalsHtml(goals: DevelopmentGoal[]): string {
  if (goals.length === 0) {
    return `<p class="empty-doc">No developmental goals have been added yet.</p>`;
  }

  const active = goals.filter((g) => g.status !== "closed");
  const closed = goals.filter((g) => g.status === "closed");
  let html = "";
  let index = 0;

  for (const goal of active) {
    html += renderSingleGoalHtml(goal, index);
    index += 1;
  }

  if (closed.length > 0) {
    html += `<h2 class="print-closed-heading">Closed goals</h2>`;
    html += `<ul class="closed-goal-list">`;
    for (const goal of closed) {
      html += renderClosedGoalRowHtml(goal);
    }
    html += `</ul>`;
  }

  return html;
}

function buildPrintHtml(options: DevelopmentPlanPrintOptions, logoUrl: string): string {
  const { goals, memberName, managerName } = options;
  const printedOn = formatPrintDate(new Date().toISOString());
  const manager = managerName?.trim() || "—";
  const intro =
    "This development plan tracks skills to build, action steps, and progress notes over time. Use it to support ongoing growth and professional development.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(memberName)} — Development Plan</title>
  <style>
    @page { size: letter; margin: 0.38in 0.42in; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      font-size: 8.5pt;
      line-height: 1.32;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .doc { max-width: 100%; margin: 0 auto; }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 7px;
      margin-bottom: 9px;
    }
    .brand-logo {
      height: 28px;
      width: auto;
      max-width: 118px;
      display: block;
      object-fit: contain;
    }
    .doc-type { text-align: right; flex-shrink: 0; }
    .doc-type-kicker {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      color: #64748b;
      margin: 0 0 2px;
      text-transform: uppercase;
    }
    .doc-type-title {
      font-size: 11.5pt;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px 10px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .meta-item label {
      display: block;
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.11em;
      color: #64748b;
      margin-bottom: 1px;
      text-transform: uppercase;
    }
    .meta-item span {
      font-size: 8.5pt;
      font-weight: 600;
      color: #0f172a;
      line-height: 1.25;
    }
    .intro {
      font-size: 7.5pt;
      color: #475569;
      margin: 0 0 10px;
      line-height: 1.4;
    }
    .goal {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
    }
    .goal-head {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 7px 10px;
      background: #f5f3ff;
      border-bottom: 1px solid #e9e5ff;
    }
    .goal-num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #7c3aed;
      color: #fff;
      font-size: 7pt;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .goal-title-block { flex: 1; min-width: 0; }
    .goal-title {
      margin: 0;
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.25;
    }
    .goal-meta {
      margin: 2px 0 0;
      font-size: 7pt;
      color: #64748b;
    }
    .goal-status {
      flex-shrink: 0;
      font-size: 6.5pt;
      font-weight: 700;
      border-radius: 999px;
      padding: 2px 7px;
      white-space: nowrap;
    }
    .goal-status--active {
      color: #6d28d9;
      background: #ede9fe;
    }
    .goal-status--closed {
      color: #475569;
      background: #e2e8f0;
    }
    .goal--closed .goal-head {
      background: #f8fafc;
    }
    .goal--closed .goal-num {
      background: #94a3b8;
    }
    .print-closed-heading {
      margin: 14px 0 8px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
    }
    .closed-goal-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .closed-goal-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 10px;
      border-bottom: 1px solid #eef2f6;
      background: #fafbfc;
    }
    .closed-goal-row:last-child {
      border-bottom: none;
    }
    .closed-goal-title {
      font-size: 8.5pt;
      font-weight: 600;
      color: #334155;
    }
    .closed-goal-date {
      flex-shrink: 0;
      font-size: 7pt;
      color: #64748b;
      white-space: nowrap;
    }
    .goal-block {
      padding: 7px 10px;
      border-bottom: 1px solid #eef2f6;
    }
    .goal-block:last-of-type { border-bottom: none; }
    .block-label {
      margin: 0 0 4px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #64748b;
      text-transform: uppercase;
    }
    .step-list {
      margin: 0;
      padding-left: 16px;
      font-size: 8pt;
      color: #334155;
      line-height: 1.35;
    }
    .step-list li { margin-bottom: 2px; }
    .note {
      margin-bottom: 5px;
      padding-bottom: 4px;
      border-bottom: 1px solid #f1f5f9;
    }
    .note:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
    .note-body {
      font-size: 8pt;
      color: #1e293b;
      white-space: pre-wrap;
      line-height: 1.35;
    }
    .note-meta {
      margin-top: 2px;
      font-size: 6.5pt;
      color: #94a3b8;
    }
    .empty-line {
      margin: 0;
      font-size: 7.5pt;
      color: #94a3b8;
      font-style: italic;
    }
    .empty-doc {
      margin: 0;
      padding: 12px 0;
      font-size: 8pt;
      color: #64748b;
      font-style: italic;
      text-align: center;
    }
    .goal-footer {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 5px 10px;
      background: #fafbfc;
      font-size: 6.5pt;
      color: #94a3b8;
    }
    .bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #e2e8f0;
      margin-top: 10px;
      padding-top: 6px;
      font-size: 7pt;
      color: #64748b;
    }
    .bottom-bar .brand-logo {
      height: 16px;
      max-width: 72px;
      opacity: 0.85;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .goal-head { background: #f5f3ff !important; }
      .goal-status { background: #ede9fe !important; }
      .goal-num { background: #7c3aed !important; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="top-row">
      <img src="${escapeHtml(logoUrl)}" alt="Alenio" class="brand-logo" />
      <div class="doc-type">
        <p class="doc-type-kicker">Development Plan</p>
        <h1 class="doc-type-title">${escapeHtml(memberName)}</h1>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item"><label>Employee</label><span>${escapeHtml(memberName)}</span></div>
      <div class="meta-item"><label>Manager</label><span>${escapeHtml(manager)}</span></div>
      <div class="meta-item"><label>Printed</label><span>${escapeHtml(printedOn)}</span></div>
      <div class="meta-item"><label>Goals</label><span>${goals.length}</span></div>
    </div>

    <p class="intro">${escapeHtml(intro)}</p>

    ${renderGoalsHtml(goals)}

    <div class="bottom-bar">
      <img src="${escapeHtml(logoUrl)}" alt="Alenio" class="brand-logo" />
      <span>alenio.com</span>
    </div>
  </div>
</body>
</html>`;
}

/** Opens the browser print dialog; choose Save as PDF to download. */
export function printDevelopmentPlan(options: DevelopmentPlanPrintOptions): void {
  const html = buildPrintHtml(options, alenioLogoUrl());
  printHtmlInHiddenFrame(html, "Development plan print preview");
}

export const saveDevelopmentPlanPdf = printDevelopmentPlan;
