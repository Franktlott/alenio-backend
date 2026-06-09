import type { OneOnOneMeeting, OneOnOneTemplateField } from "./api";

export type OneOnOnePrintOptions = {
  meeting: OneOnOneMeeting;
  memberName: string;
  managerName: string | null;
  meetingNumber: number;
  introText?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function renderSections(fields: OneOnOneTemplateField[], responses: Record<string, string | number>): string {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
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
    "This 1:1 template is designed to help managers and team members have meaningful conversations, align on priorities, and support ongoing growth and development.";
  const sectionsHtml = renderSections(meeting.templateFields, meeting.responses);
  const dateStr = formatPrintDate(meeting.createdAt);
  const manager = managerName?.trim() || "—";
  const preparedBy = meeting.createdBy?.name ?? meeting.createdBy?.email ?? "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(meeting.templateTitle)} — 1:1</title>
  <style>
    @page { size: letter; margin: 0.55in 0.6in; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      font-size: 11pt;
      line-height: 1.45;
      margin: 0;
      padding: 0;
    }
    .doc { max-width: 7.5in; margin: 0 auto; }
    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .logo-wrap { display: flex; align-items: center; gap: 8px; }
    .logo-wrap img { width: 28px; height: 28px; }
    .logo-text { font-size: 22pt; font-weight: 800; color: #1e293b; letter-spacing: -0.02em; }
    .doc-type { text-align: right; }
    .doc-type-kicker {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: #64748b;
      margin: 0 0 4px;
    }
    .doc-type-title { font-size: 16pt; font-weight: 800; margin: 0; color: #0f172a; }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .meta-item label {
      display: block;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #64748b;
      margin-bottom: 3px;
    }
    .meta-item span { font-size: 10pt; font-weight: 600; color: #0f172a; }
    .intro {
      font-size: 9.5pt;
      color: #475569;
      margin: 0 0 18px;
      line-height: 1.55;
    }
    .section { margin-bottom: 16px; }
    .section-head {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #e0f2fe;
      padding: 7px 12px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    .section-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #0284c7;
      flex-shrink: 0;
    }
    .section-title {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #0c4a6e;
    }
    .section-body { padding: 0 4px; }
    .question { margin-bottom: 14px; }
    .question-label {
      font-size: 10pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .answer-line {
      border-bottom: 1px solid #94a3b8;
      min-height: 22px;
      padding: 2px 0 4px;
      font-size: 10pt;
      color: #1e293b;
      white-space: pre-wrap;
    }
    .rating-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .rating-dot {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1.5px solid #64748b;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      font-weight: 700;
      color: #475569;
    }
    .rating-dot--filled {
      background: #0284c7;
      border-color: #0284c7;
      color: #fff;
    }
    .rating-hint {
      font-size: 8pt;
      color: #64748b;
      margin-left: 4px;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      border-top: 1px solid #cbd5e1;
      margin-top: 22px;
      padding-top: 14px;
    }
    .footer-col {
      padding: 0 14px;
      border-right: 1px solid #e2e8f0;
    }
    .footer-col:first-child { padding-left: 0; }
    .footer-col:last-child { border-right: none; padding-right: 0; }
    .footer-col h4 {
      margin: 0 0 2px;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #0f172a;
    }
    .footer-col p {
      margin: 0 0 8px;
      font-size: 8pt;
      color: #64748b;
    }
    .footer-line {
      border-bottom: 1px solid #94a3b8;
      min-height: 18px;
      margin-bottom: 8px;
    }
    .bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #cbd5e1;
      margin-top: 16px;
      padding-top: 10px;
      font-size: 9pt;
      color: #64748b;
    }
    .bottom-bar .logo-wrap img { width: 18px; height: 18px; }
    .bottom-bar .logo-text { font-size: 11pt; font-weight: 800; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="top-row">
      <div class="logo-wrap">
        <img src="${escapeHtml(logoUrl)}" alt="" />
        <span class="logo-text">Alenio</span>
      </div>
      <div class="doc-type">
        <p class="doc-type-kicker">1:1 MEETING TEMPLATE</p>
        <h1 class="doc-type-title">${escapeHtml(meeting.templateTitle)}</h1>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item"><label>EMPLOYEE</label><span>${escapeHtml(memberName)}</span></div>
      <div class="meta-item"><label>MANAGER</label><span>${escapeHtml(manager)}</span></div>
      <div class="meta-item"><label>DATE</label><span>${escapeHtml(dateStr)}</span></div>
      <div class="meta-item"><label>MEETING #</label><span>${meetingNumber}</span></div>
    </div>

    <p class="intro">${escapeHtml(intro)}</p>

    ${sectionsHtml}

    <div class="footer-grid">
      <div class="footer-col">
        <h4>ACTION ITEMS</h4>
        <p>Key takeaways and next steps</p>
        <div class="footer-line"></div>
        <div class="footer-line"></div>
        <div class="footer-line"></div>
      </div>
      <div class="footer-col">
        <h4>FOLLOW UP</h4>
        <p>Date of next 1:1</p>
        <div class="footer-line"></div>
      </div>
      <div class="footer-col">
        <h4>PREPARED BY</h4>
        <p>Manager signature</p>
        <div class="footer-line">${escapeHtml(preparedBy)}</div>
      </div>
    </div>

    <div class="bottom-bar">
      <div class="logo-wrap">
        <img src="${escapeHtml(logoUrl)}" alt="" />
        <span class="logo-text">Alenio</span>
      </div>
      <span>alenio.com</span>
    </div>
  </div>
  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;
}

/** Opens a print dialog; user can choose "Save as PDF". */
export function printOneOnOneMeeting(options: OneOnOnePrintOptions): void {
  const logoUrl = `${window.location.origin}/alenio-mark-icon.svg`;
  const html = buildPrintHtml(options, logoUrl);
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) {
    throw new Error("Pop-up blocked. Allow pop-ups to print this 1:1.");
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function meetingNumberFor(meetings: OneOnOneMeeting[], meetingId: string): number {
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const idx = sorted.findIndex((m) => m.id === meetingId);
  return idx >= 0 ? idx + 1 : sorted.length;
}
