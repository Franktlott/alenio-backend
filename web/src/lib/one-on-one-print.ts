import type { OneOnOneMeeting, OneOnOneTemplateField } from "./api";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  formatAssociateResponseDisplay,
} from "./one-on-one-feedback";
import { alenioLogoUrl, escapeHtml, printHtmlInHiddenFrame } from "./print-html";

export type OneOnOnePrintOptions = {
  meeting: OneOnOneMeeting;
  memberName: string;
  managerName: string | null;
  meetingNumber: number;
  introText?: string | null;
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

function answerText(responses: Record<string, string | number>, field: OneOnOneTemplateField): string {
  const raw = responses[field.id];
  if (raw === undefined || raw === "" || raw === 0) return "";
  if (field.type === "associate_notes") return formatAssociateResponseDisplay(raw);
  return String(raw);
}

function renderRatingAnswer(field: OneOnOneTemplateField, value: string): string {
  const max = field.ratingMax ?? 5;
  const current = Number(value) || 0;
  const circles = Array.from({ length: max }, (_, i) => {
    const n = i + 1;
    const filled = n === current;
    return `<span class="rating-dot${filled ? " rating-dot--filled" : ""}">${n}</span>`;
  }).join("");
  return `<div class="rating-row">${circles}<span class="rating-hint">1 = Not great · ${max} = Excellent</span></div>`;
}

function renderQuestion(
  num: number,
  field: OneOnOneTemplateField,
  responses: Record<string, string | number>,
): string {
  const answer = answerText(responses, field);
  const label = escapeHtml(field.label);
  let answerHtml: string;
  if (field.type === "rating") {
    answerHtml = renderRatingAnswer(field, answer);
  } else {
    answerHtml = `<div class="answer-line">${answer ? escapeHtml(answer) : "&nbsp;"}</div>`;
  }
  return `
    <div class="question">
      <div class="question-label">${num}. ${label}</div>
      ${answerHtml}
    </div>
  `;
}

function formatFollowUpDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function renderFollowUpTasksHtml(
  tasks: NonNullable<OneOnOnePrintOptions["meeting"]["followUpTasks"]>,
): string {
  if (!tasks.length) {
    return `<div class="footer-task footer-task--empty">No follow up tasks</div>`;
  }
  return tasks
    .map((task) => {
      const dueLabel = formatFollowUpDueDate(task.dueDate);
      const dueText = dueLabel ? `Due ${dueLabel}` : "No due date";
      return `<div class="footer-task"><span class="footer-task-title">${escapeHtml(task.title)}</span><span class="footer-task-due">${escapeHtml(dueText)}</span></div>`;
    })
    .join("");
}

function renderAssociateFeedbackHtml(meeting: OneOnOneMeeting): string {
  const answer = meeting.responses[ASSOCIATE_FEEDBACK_FIELD_ID];
  if (answer === undefined || answer === "" || answer === 0) {
    if (!meeting.associateFeedbackPending) return "";
    return `
      <div class="section">
        <div class="section-head">
          <span class="section-dot"></span>
          <span class="section-title">${escapeHtml(ASSOCIATE_FEEDBACK_LABEL.toUpperCase())}</span>
        </div>
        <div class="section-body">
          <div class="question">
            <div class="question-label">${escapeHtml(ASSOCIATE_FEEDBACK_LABEL)}</div>
            <div class="answer-line enterprise-muted">Awaiting associate feedback</div>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <div class="section">
      <div class="section-head">
        <span class="section-dot"></span>
        <span class="section-title">${escapeHtml(ASSOCIATE_FEEDBACK_LABEL.toUpperCase())}</span>
      </div>
      <div class="section-body">
        <div class="question">
          <div class="question-label">${escapeHtml(ASSOCIATE_FEEDBACK_LABEL)}</div>
          <div class="answer-line">${escapeHtml(formatAssociateResponseDisplay(answer))}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSections(fields: OneOnOneTemplateField[], responses: Record<string, string | number>): string {
  const sorted = [...fields].filter((field) => field.type !== "associate_notes").sort((a, b) => a.order - b.order);
  let html = "";
  let questionNum = 0;
  let sectionOpen = false;

  for (const field of sorted) {
    if (field.type === "section") {
      if (sectionOpen) html += "</div>";
      sectionOpen = true;
      html += `
        <div class="section">
          <div class="section-head">
            <span class="section-dot"></span>
            <span class="section-title">${escapeHtml(field.label).toUpperCase()}</span>
          </div>
          <div class="section-body">
      `;
      continue;
    }
    questionNum += 1;
    html += renderQuestion(questionNum, field, responses);
  }

  if (sectionOpen) html += "</div></div>";
  else if (questionNum > 0) {
    html = `<div class="section"><div class="section-body">${html}</div></div>`;
  }

  return html;
}

function buildPrintHtml(options: OneOnOnePrintOptions, logoUrl: string): string {
  const { meeting, memberName, managerName, meetingNumber, introText } = options;
  const intro =
    introText?.trim() ||
    "This check-in template is designed to help managers and team members have meaningful conversations, align on priorities, and support ongoing growth and development.";
  const sectionsHtml = renderSections(meeting.templateFields, meeting.responses) + renderAssociateFeedbackHtml(meeting);
  const followUpTasksHtml = renderFollowUpTasksHtml(meeting.followUpTasks ?? []);
  const dateStr = formatPrintDate(meeting.createdAt);
  const manager = managerName?.trim() || "—";
  const preparedBy = meeting.createdBy?.name ?? meeting.createdBy?.email ?? "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(meeting.templateTitle)} — Check-in</title>
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
    .section { margin-bottom: 9px; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #e8f4fc;
      border-left: 3px solid #0284c7;
      padding: 4px 8px;
      margin-bottom: 6px;
    }
    .section-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #0284c7;
      flex-shrink: 0;
    }
    .section-title {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #0c4a6e;
    }
    .section-body { padding: 0 2px; }
    .question {
      margin-bottom: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .question-label {
      font-size: 8pt;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 2px;
      line-height: 1.25;
    }
    .answer-line {
      border-bottom: 1px solid #cbd5e1;
      min-height: 14px;
      padding: 1px 0 2px;
      font-size: 8pt;
      color: #334155;
      white-space: pre-wrap;
      line-height: 1.3;
    }
    .rating-row {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .rating-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid #94a3b8;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 7pt;
      font-weight: 700;
      color: #475569;
    }
    .rating-dot--filled {
      background: #0284c7;
      border-color: #0284c7;
      color: #fff;
    }
    .rating-hint {
      font-size: 6.5pt;
      color: #64748b;
      margin-left: 2px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      border-top: 1px solid #cbd5e1;
      margin-top: 12px;
      padding-top: 8px;
    }
    .footer-col {
      padding: 0 10px;
      border-right: 1px solid #e2e8f0;
    }
    .footer-col:first-child { padding-left: 0; }
    .footer-col:last-child { border-right: none; padding-right: 0; }
    .footer-col h4 {
      margin: 0 0 1px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.09em;
      color: #0f172a;
      text-transform: uppercase;
    }
    .footer-col p {
      margin: 0 0 4px;
      font-size: 6.5pt;
      color: #64748b;
      line-height: 1.25;
    }
    .footer-line {
      border-bottom: 1px solid #cbd5e1;
      min-height: 12px;
      margin-bottom: 4px;
    }
    .footer-task {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      border-bottom: 1px solid #cbd5e1;
      padding: 2px 0 3px;
      margin-bottom: 4px;
      font-size: 7.5pt;
      line-height: 1.3;
    }
    .footer-task-title {
      font-weight: 600;
      color: #1e293b;
      flex: 1;
      min-width: 0;
    }
    .footer-task-due {
      font-size: 7pt;
      color: #64748b;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .footer-task--empty {
      justify-content: flex-start;
      font-style: italic;
      color: #64748b;
      font-weight: 500;
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
      .section-head { background: #e8f4fc !important; }
      .rating-dot--filled { background: #0284c7 !important; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="top-row">
      <img src="${escapeHtml(logoUrl)}" alt="Alenio" class="brand-logo" />
      <div class="doc-type">
        <p class="doc-type-kicker">Check-in</p>
        <h1 class="doc-type-title">${escapeHtml(meeting.templateTitle)}</h1>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item"><label>Employee</label><span>${escapeHtml(memberName)}</span></div>
      <div class="meta-item"><label>Manager</label><span>${escapeHtml(manager)}</span></div>
      <div class="meta-item"><label>Date</label><span>${escapeHtml(dateStr)}</span></div>
      <div class="meta-item"><label>Check-in #</label><span>${meetingNumber}</span></div>
    </div>

    <p class="intro">${escapeHtml(intro)}</p>

    ${sectionsHtml}

    <div class="footer-grid">
      <div class="footer-col">
        <h4>Action items</h4>
        <p>Follow-up tasks from this check-in</p>
        ${followUpTasksHtml}
      </div>
      <div class="footer-col">
        <h4>Prepared by</h4>
        <p>Manager signature</p>
        <div class="footer-line">${escapeHtml(preparedBy)}</div>
      </div>
    </div>

    <div class="bottom-bar">
      <img src="${escapeHtml(logoUrl)}" alt="Alenio" class="brand-logo" />
      <span>alenio.com</span>
    </div>
  </div>
</body>
</html>`;
}

/** Opens the browser print dialog; choose Save as PDF to download. */
export function printOneOnOneMeeting(options: OneOnOnePrintOptions): void {
  const html = buildPrintHtml(options, alenioLogoUrl());
  printHtmlInHiddenFrame(html, "Check-in print preview");
}

export function meetingNumberFor(meetings: OneOnOneMeeting[], meetingId: string): number {
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const idx = sorted.findIndex((m) => m.id === meetingId);
  return idx >= 0 ? idx + 1 : sorted.length;
}
