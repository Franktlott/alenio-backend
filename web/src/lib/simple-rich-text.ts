const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "UL", "OL", "LI", "A"]);

export function sanitizeRichHtml(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? "";
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node as HTMLElement;
      const tag = el.tagName.toUpperCase();
      if (!ALLOWED_TAGS.has(tag)) {
        return Array.from(el.childNodes).map(walk).join("");
      }
      if (tag === "BR") return "<br>";
      if (tag === "A") {
        const href = el.getAttribute("href")?.trim() ?? "";
        if (!/^https?:\/\//i.test(href)) {
          return Array.from(el.childNodes).map(walk).join("");
        }
        return `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${Array.from(el.childNodes).map(walk).join("")}</a>`;
      }
      const inner = Array.from(el.childNodes).map(walk).join("");
      return `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
    };
    return Array.from(doc.body.childNodes).map(walk).join("").trim();
  } catch {
    return html.replace(/<[^>]+>/g, "");
  }
}

export function looksLikeRichHtml(text: string): boolean {
  return /<(?:b|strong|i|em|u|br|p|div|ul|ol|li|a)\b/i.test(text);
}

export function richHtmlToPlainText(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, "");
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, "");
  }
}

export function descriptionHasVisibleText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  if (looksLikeRichHtml(text)) return richHtmlToPlainText(text).length > 0;
  return text.trim().length > 0;
}
