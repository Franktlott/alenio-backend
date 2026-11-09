import { discoverByline, type DiscoverArticleDetail, type DiscoverNode } from "@/lib/discover";
import { ALENIO_LOGO_URL, downloadHtmlAsPdf, escapeHtml, safePdfFilename } from "@/lib/print-html";

const TONES: Record<string, { fg: string; bg: string; border: string }> = {
  purple: { fg: "#6D28D9", bg: "#F1ECFF", border: "#E4DCFD" },
  blue: { fg: "#2563EB", bg: "#E8F0FE", border: "#D6E4FD" },
  green: { fg: "#15803D", bg: "#E7F8EE", border: "#CDEEDB" },
  orange: { fg: "#C2410C", bg: "#FFF1E6", border: "#FDE0C8" },
  pink: { fg: "#BE185D", bg: "#FDEEF5", border: "#FBD5E6" },
  teal: { fg: "#0F766E", bg: "#E6F7F5", border: "#C9ECE7" },
};

/** Lucide icon shapes, the same set the app shows, drawn as inline SVG so the PDF needs no icon font. */
const ICONS: Record<string, string> = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  zap: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  rocket: '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  lightbulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  message: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  trophy: '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  book: '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
  smile: '<path d="M15 10V9"/><path d="M16.472 15a6 6 0 01-8.943 0"/><path d="M9 10V9"/><circle cx="12" cy="12" r="10"/>',
};

function svgIcon(name: unknown, size: number, color: string): string {
  const shape = ICONS[str(name)] ?? ICONS.sparkles!;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
}

const WIDTHS: Record<string, string> = { "2/3": "66.666%", "1/2": "50%", "1/3": "33.333%" };

const str = (value: unknown) => (typeof value === "string" ? value : "");
const tone = (value: unknown) => TONES[str(value)] ?? TONES.purple!;
const https = (value: unknown) => (/^https:\/\//i.test(str(value)) ? str(value) : null);

function inline(nodes: DiscoverNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "<br/>";
      if (node.type !== "text" || !node.text) return "";
      let html = escapeHtml(node.text);
      if (node.marks?.some((mark) => mark.type === "bold")) html = `<strong>${html}</strong>`;
      if (node.marks?.some((mark) => mark.type === "italic")) html = `<em>${html}</em>`;
      const href = https(node.marks?.find((mark) => mark.type === "link")?.attrs?.href);
      return href ? `<a href="${escapeHtml(href)}">${html}</a>` : html;
    })
    .join("");
}

function tile(icon: unknown, color: ReturnType<typeof tone>, variant: "plain" | "soft" | "solid" = "plain"): string {
  const background = variant === "solid" ? color.fg : variant === "soft" ? color.bg : "#fff";
  const stroke = variant === "solid" ? "#fff" : color.fg;
  const size = variant === "soft" ? 20 : 18;
  return `<span class="tile ${variant}" style="background:${background};border-color:${color.border}">${svgIcon(icon, size, stroke)}</span>`;
}

function block(node: DiscoverNode): string {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  switch (node.type) {
    case "heading":
      return attrs.level === 3 ? `<h3>${inline(node.content)}</h3>` : `<h2>${inline(node.content)}</h2>`;
    case "bulletList":
    case "orderedList": {
      const tag = node.type === "orderedList" ? "ol" : "ul";
      const items = (node.content ?? []).map((item) => `<li>${(item.content ?? []).map((p) => inline(p.content)).join(" ")}</li>`);
      return `<${tag}>${items.join("")}</${tag}>`;
    }
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map((p) => `<p>${inline(p.content)}</p>`).join("")}</blockquote>`;
    case "image": {
      const src = https(attrs.src);
      return src ? `<img class="body-img" src="${escapeHtml(src)}" alt="${escapeHtml(str(attrs.alt))}"/>` : "";
    }
    case "discoverCallout": {
      const color = tone(attrs.tone);
      return `<div class="panel callout" style="background:linear-gradient(135deg,${color.bg},#fff 140%);border-color:${color.border}">${tile(attrs.icon, color)}<div>${
        str(attrs.title) ? `<div class="callout-title">${escapeHtml(str(attrs.title))}</div>` : ""
      }${str(attrs.text) ? `<p>${escapeHtml(str(attrs.text))}</p>` : ""}</div></div>`;
    }
    case "discoverCards": {
      const cards = (Array.isArray(attrs.cards) ? attrs.cards : []) as Record<string, unknown>[];
      return `<div class="cards" style="grid-template-columns:repeat(${Math.max(1, cards.length)},1fr)">${cards
        .map((card) => {
          const color = tone(card.tone);
          return `<div class="card">${tile(card.icon, color, "soft")}${
            str(card.kicker) ? `<div class="kicker" style="color:${color.fg}">${escapeHtml(str(card.kicker))}</div>` : ""
          }${str(card.title) ? `<div class="card-title">${escapeHtml(str(card.title))}</div>` : ""}${
            str(card.text) ? `<p>${escapeHtml(str(card.text))}</p>` : ""
          }</div>`;
        })
        .join("")}</div>`;
    }
    case "discoverChecklist": {
      const color = tone(attrs.tone);
      const items = (Array.isArray(attrs.items) ? attrs.items : []).map(str).filter((item) => item.trim());
      return `<div class="panel" style="background:linear-gradient(140deg,${color.bg},#fff 130%);border-color:${color.border}"><div class="check-head">${tile(attrs.icon, color, "solid")}<strong>${escapeHtml(
        str(attrs.title),
      )}</strong></div>${items
        .map((item) => `<div class="check-row"><span class="check" style="background:${color.fg}">${svgIcon("check", 11, "#fff")}</span><span>${escapeHtml(item)}</span></div>`)
        .join("")}</div>`;
    }
    case "paragraph":
      return `<p>${inline(node.content)}</p>`;
    default:
      return "";
  }
}

/** Blocks flow in rows by width, like the web article; legacy "beside text above" panels pair with the text before them. */
function body(blocks: DiscoverNode[]): string {
  const textTypes = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote"]);
  const widthOf = (node: DiscoverNode) => WIDTHS[str(node.attrs?.width)] ?? null;
  const out: string[] = [];
  let run: DiscoverNode[] = [];
  const flush = () => {
    out.push(...run.map((node) => `<div class="cell">${block(node)}</div>`));
    run = [];
  };
  for (const node of blocks) {
    if (textTypes.has(node.type ?? "") && !widthOf(node)) {
      run.push(node);
      continue;
    }
    const legacySide = node.attrs?.layout === "side" && !widthOf(node);
    if (legacySide && run.length > 0) {
      out.push(
        `<div class="cell" style="width:calc(55% - 0.14in)">${run.map(block).join("")}</div><div class="cell" style="width:calc(45% - 0.14in)">${block(node)}</div>`,
      );
      run = [];
      continue;
    }
    flush();
    const width = widthOf(node);
    out.push(`<div class="cell"${width ? ` style="width:calc(${width} - 0.2in)"` : ""}>${block(node)}</div>`);
  }
  flush();
  return out.join("");
}

export function discoverArticleHtml(article: DiscoverArticleDetail): string {
  const byline = discoverByline(article);
  const cover = https(article.coverImageUrl);
  const meta = [
    `By <strong>${escapeHtml(byline.author)}</strong>`,
    article.readingTimeMinutes > 0 ? `${article.readingTimeMinutes} min read` : "",
    byline.when ? escapeHtml(byline.when) : "",
  ].filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  @page { size: letter; margin: 0.5in 0 0.55in; }
  @page :first { margin-top: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 10pt; line-height: 1.55; }
  .hero { position: relative; overflow: hidden; min-height: ${cover ? "3.15in" : "2.4in"}; display: flex; align-items: center; background: ${cover ? "#fff" : "linear-gradient(120deg,#f3efff 0%,#fbfaff 55%,#fff 100%)"}; break-inside: avoid; }
  .hero-img { position: absolute; top: 0; right: 0; width: 74%; height: 100%; object-fit: cover; }
  .hero-fade { position: absolute; inset: 0; background: linear-gradient(90deg, #fff 30%, rgba(255,255,255,.82) 46%, rgba(255,255,255,0) 70%); }
  .hero-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: linear-gradient(90deg, #6d5ef8, #a78bfa 55%, #f59e0b); }
  .hero-copy { position: relative; width: ${cover ? "58%" : "100%"}; padding: 0.4in 0.6in 0.36in; }
  .crumbs { display: flex; align-items: center; gap: 6px; font-size: 9.5pt; font-weight: 600; color: #475467; margin-bottom: 14px; }
  .crumbs img { height: 16px; width: auto; margin-right: 4px; }
  .crumbs b { color: #6d5ef8; }
  h1 { margin: 0; font-size: 30pt; line-height: 1.06; letter-spacing: -0.02em; font-weight: 800; color: #0f172a; }
  .excerpt { margin: 10px 0 0; max-width: 3.9in; font-size: 12pt; line-height: 1.45; color: #344054; }
  .byline { margin-top: 16px; font-size: 9pt; color: #667085; }
  .byline strong { color: #111a2b; }
  .body { display: flex; flex-wrap: wrap; align-items: flex-start; column-gap: 0.28in; margin-top: 0.3in; padding: 0 0.6in; }
  .cell { width: 100%; break-inside: avoid; }
  p { margin: 8px 0 0; color: #344054; orphans: 3; widows: 3; }
  .cell > :first-child:not(.cards):not(.panel) { margin-top: 0; }
  h2 { margin: 0.22in 0 4px; font-size: 16pt; line-height: 1.2; letter-spacing: -0.01em; color: #0f172a; break-after: avoid; }
  h3 { margin: 0.18in 0 4px; font-size: 13pt; color: #0f172a; break-after: avoid; }
  ul, ol { margin: 8px 0 0; padding-left: 20px; color: #344054; }
  blockquote { margin: 0.18in 0; padding: 4px 0 4px 16px; border-left: 3px solid #6d5ef8; font-size: 12pt; font-style: italic; color: #1f2937; }
  blockquote p { margin: 0; color: inherit; }
  .body-img { width: 100%; max-height: 3.4in; object-fit: cover; border-radius: 12px; margin: 10px 0; }
  .panel { margin: 0.1in 0; padding: 14px 16px; border: 1px solid; border-radius: 14px; }
  .callout { display: flex; align-items: center; gap: 12px; }
  .callout-title { font-weight: 800; font-size: 11pt; color: #0f172a; }
  .callout p { margin-top: 2px; }
  .tile { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; border: 1px solid; border-radius: 10px; }
  .tile.soft { width: 40px; height: 40px; border: 0; border-radius: 11px; }
  .tile.solid { border: 0; }
  .cards { display: grid; gap: 0.13in; margin: 0.18in 0; }
  .card { display: flex; flex-direction: column; align-items: flex-start; padding: 14px 14px 15px; border: 1px solid #e6e2f0; border-radius: 14px; break-inside: avoid; }
  .kicker { margin-top: 10px; font-size: 21pt; line-height: 1; font-weight: 800; }
  .card-title { margin-top: 4px; font-size: 12pt; line-height: 1.25; font-weight: 800; color: #0f172a; }
  .card p { margin-top: 6px; font-size: 9pt; line-height: 1.45; color: #475467; }
  .check-head { display: flex; align-items: center; gap: 12px; font-size: 12.5pt; color: #0f172a; }
  .check-row { display: flex; gap: 9px; margin-top: 7px; font-size: 9.5pt; line-height: 1.4; color: #344054; }
  .check { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 17px; height: 17px; border-radius: 5px; }
  .foot { display: flex; align-items: center; justify-content: space-between; margin: 0.4in 0.6in 0; padding-top: 10px; border-top: 1px solid #eceaf3; font-size: 8pt; letter-spacing: 0.04em; break-inside: avoid; }
  .foot-brand { display: flex; align-items: center; gap: 6px; font-weight: 700; color: #6d5ef8; }
  .foot-brand img { height: 12px; }
  .foot-url { color: #98a2b3; }
  </style></head><body>
  <div class="hero">
    ${cover ? `<img class="hero-img" src="${escapeHtml(cover)}"/><div class="hero-fade"></div>` : ""}
    <div class="hero-bar"></div>
    <div class="hero-copy">
      <div class="crumbs"><img src="${ALENIO_LOGO_URL}"/>Discover${article.category ? ` &rsaquo; <b>${escapeHtml(article.category.name)}</b>` : ""}</div>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.excerpt ? `<p class="excerpt">${escapeHtml(article.excerpt)}</p>` : ""}
      <div class="byline">${meta.join(" &middot; ")}</div>
    </div>
  </div>
  <div class="body">${body(article.content?.content ?? [])}</div>
  <div class="foot"><span class="foot-brand"><img src="${ALENIO_LOGO_URL}"/>Alenio &middot; Discover</span><span class="foot-url">alenio.com/discover/${escapeHtml(article.slug)}</span></div>
  </body></html>`;
}

export async function shareDiscoverArticlePdf(article: DiscoverArticleDetail): Promise<void> {
  await downloadHtmlAsPdf(discoverArticleHtml(article), safePdfFilename(article.title));
}
