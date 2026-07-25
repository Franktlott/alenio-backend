import { Share, Platform } from "react-native";
import { ALENIO_LOGO_URL, downloadHtmlAsPdf, escapeHtml, printHtml, safePdfFilename } from "./print-html";

export type SenecaChatShareMessage = {
  role: "user" | "assistant";
  text: string;
};

function formatTimestamp(date = new Date()): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSenecaChatTranscript(
  messages: SenecaChatShareMessage[],
  workspaceName?: string | null,
): string {
  const header = [
    "Seneca chat",
    workspaceName ? `Workspace: ${workspaceName}` : null,
    `Exported ${formatTimestamp()}`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = messages
    .map((message) => {
      const label = message.role === "user" ? "You" : "Seneca";
      return `${label}:\n${message.text.trim()}`;
    })
    .join("\n\n");

  return `${header}${body}\n\n— Alenio · Seneca (AI guidance may contain inaccuracies)`;
}

function buildSenecaChatHtml(
  messages: SenecaChatShareMessage[],
  workspaceName?: string | null,
): string {
  const rows = messages
    .map((message) => {
      const label = message.role === "user" ? "You" : "Seneca";
      const cls = message.role === "user" ? "user" : "seneca";
      return `<div class="msg ${cls}"><div class="label">${escapeHtml(label)}</div><div class="body">${escapeHtml(message.text).replace(/\n/g, "<br/>")}</div></div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 24px; font-size: 11pt; line-height: 1.45; }
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
    .brand { height: 18px; }
    h1 { font-size: 16pt; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 9pt; margin: 0; }
    .msg { margin: 12px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid #e2e8f0; }
    .msg.user { background: #eef2ff; border-color: #c7d2fe; }
    .msg.seneca { background: #f8fafc; }
    .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #4361ee; margin-bottom: 4px; }
    .msg.user .label { color: #3730a3; }
    .body { white-space: pre-wrap; }
    .foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8pt; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>Seneca chat</h1>
      <p class="meta">${escapeHtml(workspaceName || "Workspace")} · ${escapeHtml(formatTimestamp())}</p>
    </div>
    <img src="${escapeHtml(ALENIO_LOGO_URL)}" alt="Alenio" class="brand" />
  </div>
  ${rows || "<p class=\"meta\">No messages in this session.</p>"}
  <div class="foot">Alenio · Seneca · AI-generated guidance may contain inaccuracies.</div>
</body>
</html>`;
}

/** Native share sheet with plain-text transcript (Mail, Messages, etc.). */
export async function shareSenecaChat(
  messages: SenecaChatShareMessage[],
  workspaceName?: string | null,
): Promise<void> {
  if (messages.length === 0) {
    throw new Error("Nothing to share yet. Ask Seneca something first.");
  }
  const message = formatSenecaChatTranscript(messages, workspaceName);
  await Share.share(
    Platform.OS === "ios"
      ? { message, title: "Seneca chat" }
      : { message, title: "Seneca chat" },
  );
}

/** Opens the native print dialog for the chat. */
export async function printSenecaChat(
  messages: SenecaChatShareMessage[],
  workspaceName?: string | null,
): Promise<void> {
  if (messages.length === 0) {
    throw new Error("Nothing to print yet. Ask Seneca something first.");
  }
  await printHtml(buildSenecaChatHtml(messages, workspaceName));
}

/** PDF via share sheet (Save to Files / Mail attachment). */
export async function downloadSenecaChatPdf(
  messages: SenecaChatShareMessage[],
  workspaceName?: string | null,
): Promise<void> {
  if (messages.length === 0) {
    throw new Error("Nothing to export yet. Ask Seneca something first.");
  }
  const html = buildSenecaChatHtml(messages, workspaceName);
  const filename = `${safePdfFilename(workspaceName || "workspace")}-seneca-chat.pdf`;
  await downloadHtmlAsPdf(html, filename);
}
