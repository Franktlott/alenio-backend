import type { ReactNode } from "react";

/** Strip trailing `)` / `]` from wrapped URLs (e.g. `(https://…)`). */
function hrefFromRaw(raw: string): string {
  return raw.trim().replace(/\)+$/g, "").replace(/\]+$/g, "").trim();
}

/**
 * Turn http(s) URLs in plain text into clickable links. Safe: only http(s), opens in new tab.
 */
export function linkifyText(text: string): ReactNode {
  const re = /(https?:\/\/[^\s<>"']+)/gi;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  const s = text;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      out.push(s.slice(last, m.index));
    }
    const raw = m[1];
    const href = hrefFromRaw(raw);
    out.push(
      <a
        key={`u-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="chat-inline-link"
      >
        {raw}
      </a>,
    );
    last = m.index + raw.length;
  }
  if (last < s.length) {
    out.push(s.slice(last));
  }
  return out.length === 1 && typeof out[0] === "string" ? out[0] : <>{out}</>;
}
