export const DISCOVER_STATUSES = ["draft", "scheduled", "published", "unpublished", "archived"] as const;
export type DiscoverStatus = (typeof DISCOVER_STATUSES)[number];

export type DiscoverMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string } };

export type DiscoverTextNode = {
  type: "text";
  text: string;
  marks?: DiscoverMark[];
};

export type DiscoverHardBreak = { type: "hardBreak" };
export type DiscoverInline = DiscoverTextNode | DiscoverHardBreak;

export const DISCOVER_WIDTHS = ["full", "2/3", "1/2", "1/3"] as const;
export type DiscoverWidth = (typeof DISCOVER_WIDTHS)[number];
/** Top-level blocks may sit side by side; "full" is the default and is never stored. */
type Sized = { width?: Exclude<DiscoverWidth, "full"> };

export type DiscoverParagraph = { type: "paragraph"; attrs?: Sized; content?: DiscoverInline[] };
export type DiscoverHeading = {
  type: "heading";
  attrs: { level: 2 | 3 } & Sized;
  content?: DiscoverInline[];
};
export type DiscoverListItem = { type: "listItem"; content: DiscoverParagraph[] };
export type DiscoverBulletList = { type: "bulletList"; attrs?: Sized; content: DiscoverListItem[] };
export type DiscoverOrderedList = { type: "orderedList"; attrs?: Sized; content: DiscoverListItem[] };
export type DiscoverBlockquote = { type: "blockquote"; attrs?: Sized; content: DiscoverParagraph[] };
export type DiscoverImage = { type: "image"; attrs: { src: string; alt: string | null } & Sized };
export type DiscoverYoutube = {
  type: "discoverYoutube";
  attrs: { videoId: string; title: string } & Sized;
};

export const DISCOVER_BLOCK_ICONS = [
  "users", "target", "zap", "heart", "rocket", "star", "lightbulb", "shield",
  "message", "compass", "trophy", "sparkles", "check", "clock", "book", "smile",
] as const;
export const DISCOVER_BLOCK_TONES = ["purple", "blue", "green", "orange", "pink", "teal"] as const;
export const MAX_DISCOVER_CARDS = 4;
export const MAX_DISCOVER_CHECKLIST_ITEMS = 12;

type BlockLayout = "full" | "side";
export type DiscoverCallout = {
  type: "discoverCallout";
  attrs: { icon: string; tone: string; title: string; text: string; layout: BlockLayout } & Sized;
};
export type DiscoverCard = { icon: string; tone: string; kicker: string; title: string; text: string };
export type DiscoverCards = { type: "discoverCards"; attrs: { cards: DiscoverCard[] } & Sized };
export type DiscoverChecklist = {
  type: "discoverChecklist";
  attrs: { icon: string; tone: string; title: string; items: string[]; layout: BlockLayout } & Sized;
};

export type DiscoverBlock =
  | DiscoverParagraph
  | DiscoverHeading
  | DiscoverBulletList
  | DiscoverOrderedList
  | DiscoverBlockquote
  | DiscoverImage
  | DiscoverYoutube
  | DiscoverCallout
  | DiscoverCards
  | DiscoverChecklist;

/** 11-character YouTube ids only — never store arbitrary watch URLs in the doc. */
const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

export function parseYoutubeVideoId(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (YOUTUBE_ID.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return YOUTUBE_ID.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const fromQuery = url.searchParams.get("v")?.trim() ?? "";
      if (YOUTUBE_ID.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live");
      if (embedIndex >= 0) {
        const id = parts[embedIndex + 1] ?? "";
        return YOUTUBE_ID.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type DiscoverDoc = { type: "doc"; content: DiscoverBlock[] };

export const EMPTY_DISCOVER_DOC: DiscoverDoc = { type: "doc", content: [] };

const HTTPS_URL = /^https:\/\/[^\s]+$/i;

export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL.test(value) && !/[\u0000-\u001f]/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sanitizeMarks(value: unknown): DiscoverMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks: DiscoverMark[] = [];
  for (const mark of value) {
    const record = asRecord(mark);
    if (!record) continue;
    if (record.type === "bold" || record.type === "italic") {
      marks.push({ type: record.type });
      continue;
    }
    if (record.type === "link") {
      const attrs = asRecord(record.attrs);
      const href = typeof attrs?.href === "string" ? attrs.href.trim() : "";
      if (isHttpsUrl(href)) marks.push({ type: "link", attrs: { href } });
    }
  }
  return marks.length > 0 ? marks : undefined;
}

function sanitizeInlines(value: unknown): DiscoverInline[] {
  if (!Array.isArray(value)) return [];
  const inlines: DiscoverInline[] = [];
  for (const node of value) {
    const record = asRecord(node);
    if (!record) continue;
    if (record.type === "hardBreak") {
      inlines.push({ type: "hardBreak" });
      continue;
    }
    if (record.type !== "text" || typeof record.text !== "string" || record.text.length === 0) continue;
    const marks = sanitizeMarks(record.marks);
    inlines.push(marks ? { type: "text", text: record.text, marks } : { type: "text", text: record.text });
  }
  return inlines;
}

function sanitizeParagraph(value: unknown): DiscoverParagraph | null {
  const record = asRecord(value);
  if (!record || record.type !== "paragraph") return null;
  const content = sanitizeInlines(record.content);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function sanitizeLayout(value: unknown): BlockLayout {
  return value === "side" ? "side" : "full";
}

function sanitizeCallout(attrs: Record<string, unknown> | null): DiscoverCallout | null {
  const title = cleanText(attrs?.title, 120);
  const text = cleanText(attrs?.text, 1000);
  if (!title && !text) return null;
  return {
    type: "discoverCallout",
    attrs: {
      icon: pick(attrs?.icon, DISCOVER_BLOCK_ICONS, "sparkles"),
      tone: pick(attrs?.tone, DISCOVER_BLOCK_TONES, "purple"),
      title,
      text,
      layout: sanitizeLayout(attrs?.layout),
    },
  };
}

function sanitizeCards(attrs: Record<string, unknown> | null): DiscoverCards | null {
  const raw = Array.isArray(attrs?.cards) ? attrs.cards : [];
  const cards: DiscoverCard[] = [];
  for (const entry of raw) {
    const card = asRecord(entry);
    if (!card) continue;
    const title = cleanText(card.title, 80);
    const text = cleanText(card.text, 400);
    if (!title && !text) continue;
    cards.push({
      icon: pick(card.icon, DISCOVER_BLOCK_ICONS, "sparkles"),
      tone: pick(card.tone, DISCOVER_BLOCK_TONES, "purple"),
      kicker: cleanText(card.kicker, 3),
      title,
      text,
    });
    if (cards.length === MAX_DISCOVER_CARDS) break;
  }
  return cards.length > 0 ? { type: "discoverCards", attrs: { cards } } : null;
}

function sanitizeChecklist(attrs: Record<string, unknown> | null): DiscoverChecklist | null {
  const raw = Array.isArray(attrs?.items) ? attrs.items : [];
  const items = raw
    .map((item) => cleanText(item, 240))
    .filter(Boolean)
    .slice(0, MAX_DISCOVER_CHECKLIST_ITEMS);
  const title = cleanText(attrs?.title, 120);
  if (items.length === 0 && !title) return null;
  return {
    type: "discoverChecklist",
    attrs: {
      icon: pick(attrs?.icon, DISCOVER_BLOCK_ICONS, "rocket"),
      tone: pick(attrs?.tone, DISCOVER_BLOCK_TONES, "purple"),
      title,
      items,
      layout: sanitizeLayout(attrs?.layout),
    },
  };
}

function sanitizeYoutube(attrs: Record<string, unknown> | null): DiscoverYoutube | null {
  const fromId =
    typeof attrs?.videoId === "string" ? parseYoutubeVideoId(attrs.videoId) : null;
  const fromUrl =
    typeof attrs?.url === "string" ? parseYoutubeVideoId(attrs.url) : null;
  const videoId = fromId ?? fromUrl;
  if (!videoId) return null;
  return {
    type: "discoverYoutube",
    attrs: {
      videoId,
      title: cleanText(attrs?.title, 160) || "YouTube video",
    },
  };
}

function sanitizeWidth(value: unknown): Sized["width"] | undefined {
  return value === "2/3" || value === "1/2" || value === "1/3" ? value : undefined;
}

function sanitizeBlocks(value: unknown): DiscoverBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: DiscoverBlock[] = [];
  for (const node of value) {
    const record = asRecord(node);
    if (!record || typeof record.type !== "string") continue;
    const width = sanitizeWidth(asRecord(record.attrs)?.width);
    const push = (block: DiscoverBlock) =>
      blocks.push(width ? ({ ...block, attrs: { ...block.attrs, width } } as DiscoverBlock) : block);
    if (record.type === "paragraph") {
      const paragraph = sanitizeParagraph(record);
      if (paragraph) push(paragraph);
      continue;
    }
    if (record.type === "heading") {
      const attrs = asRecord(record.attrs);
      const level = attrs?.level === 3 ? 3 : attrs?.level === 2 ? 2 : null;
      if (!level) continue;
      const content = sanitizeInlines(record.content);
      push(content.length > 0 ? { type: "heading", attrs: { level }, content } : { type: "heading", attrs: { level } });
      continue;
    }
    if (record.type === "bulletList" || record.type === "orderedList") {
      const items: DiscoverListItem[] = [];
      if (Array.isArray(record.content)) {
        for (const item of record.content) {
          const itemRecord = asRecord(item);
          if (!itemRecord || itemRecord.type !== "listItem" || !Array.isArray(itemRecord.content)) continue;
          const paragraphs = itemRecord.content
            .map((child) => sanitizeParagraph(child))
            .filter((child): child is DiscoverParagraph => child !== null);
          if (paragraphs.length > 0) items.push({ type: "listItem", content: paragraphs });
        }
      }
      if (items.length > 0) push({ type: record.type, content: items });
      continue;
    }
    if (record.type === "blockquote") {
      const paragraphs: DiscoverParagraph[] = [];
      if (Array.isArray(record.content)) {
        for (const child of record.content) {
          const paragraph = sanitizeParagraph(child);
          if (paragraph) paragraphs.push(paragraph);
        }
      }
      if (paragraphs.length > 0) push({ type: "blockquote", content: paragraphs });
      continue;
    }
    if (record.type === "image") {
      const attrs = asRecord(record.attrs);
      const src = typeof attrs?.src === "string" ? attrs.src.trim() : "";
      if (!isHttpsUrl(src)) continue;
      const alt = typeof attrs?.alt === "string" ? attrs.alt.slice(0, 200) : null;
      push({ type: "image", attrs: { src, alt } });
      continue;
    }
    if (record.type === "discoverYoutube") {
      const youtube = sanitizeYoutube(asRecord(record.attrs));
      if (youtube) push(youtube);
      continue;
    }
    const designed =
      record.type === "discoverCallout"
        ? sanitizeCallout(asRecord(record.attrs))
        : record.type === "discoverCards"
          ? sanitizeCards(asRecord(record.attrs))
          : record.type === "discoverChecklist"
            ? sanitizeChecklist(asRecord(record.attrs))
            : null;
    if (designed) push(designed);
  }
  return blocks;
}

/** Keep only the nodes the phone app is allowed to render. Drops HTML and unknown nodes. */
export function sanitizeDiscoverDoc(value: unknown): DiscoverDoc {
  const record = asRecord(value);
  if (!record || record.type !== "doc") return EMPTY_DISCOVER_DOC;
  return { type: "doc", content: sanitizeBlocks(record.content) };
}

function inlineText(nodes: DiscoverInline[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => (node.type === "hardBreak" ? " " : node.text))
    .join("");
}

export function discoverPlainText(doc: DiscoverDoc): string {
  const parts: string[] = [];
  for (const block of doc.content) {
    if (block.type === "image") {
      if (block.attrs.alt) parts.push(block.attrs.alt);
      continue;
    }
    if (block.type === "discoverYoutube") {
      if (block.attrs.title) parts.push(block.attrs.title);
      continue;
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const item of block.content) {
        for (const paragraph of item.content) parts.push(inlineText(paragraph.content));
      }
      continue;
    }
    if (block.type === "blockquote") {
      for (const paragraph of block.content) parts.push(inlineText(paragraph.content));
      continue;
    }
    if (block.type === "discoverCallout") {
      parts.push(block.attrs.title, block.attrs.text);
      continue;
    }
    if (block.type === "discoverCards") {
      for (const card of block.attrs.cards) parts.push(card.title, card.text);
      continue;
    }
    if (block.type === "discoverChecklist") {
      parts.push(block.attrs.title, ...block.attrs.items);
      continue;
    }
    parts.push(inlineText(block.content));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function readingTimeMinutes(doc: DiscoverDoc): number {
  const words = discoverPlainText(doc).split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / 200));
}

export function slugifyDiscoverTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "article";
}
