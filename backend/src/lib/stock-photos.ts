export type StockPhoto = {
  id: string;
  title: string;
  thumbUrl: string;
  url: string;
};

const USER_AGENT = "Alenio/1.0 (https://alenio.com; calendar-event-photos)";
const WIKIMEDIA_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeStockPhotoQuery(raw: string): string | null {
  const cleaned = raw.replace(/[^a-zA-Z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  return cleaned;
}

export function isUnrestrictedLicense(license: string): boolean {
  const value = license.trim().toLowerCase();
  if (!value) return false;
  if (/\b(by|sa|nc|nd|fair use|copyrighted)\b/.test(value) && !value.includes("cc0")) {
    return false;
  }
  return (
    value.includes("cc0") ||
    value.includes("cc-zero") ||
    value.includes("cc zero") ||
    value === "pd" ||
    value.startsWith("pd-") ||
    value.includes("public domain") ||
    value.includes("pdm")
  );
}

export function cleanMediaUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_")) parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

type WikiImageInfo = {
  mime?: string;
  url?: string;
  thumburl?: string;
  extmetadata?: {
    LicenseShortName?: { value?: string };
  };
};

type WikiPage = {
  pageid?: number;
  title?: string;
  imageinfo?: WikiImageInfo[];
};

type WikiSearchResponse = {
  query?: {
    pages?: Record<string, WikiPage>;
  };
};

function fileTitle(raw: string | undefined): string {
  return (raw ?? "")
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ")
    .trim();
}

export function mapWikimediaPages(pages: Record<string, WikiPage> | undefined): StockPhoto[] {
  if (!pages) return [];
  const photos: StockPhoto[] = [];
  const ordered = Object.values(pages).sort(
    (a, b) => (a.pageid ?? 0) - (b.pageid ?? 0),
  );
  for (const page of ordered) {
    const info = page.imageinfo?.[0];
    if (!info?.mime || !ALLOWED_MIME.has(info.mime)) continue;
    const license = info.extmetadata?.LicenseShortName?.value ?? "";
    if (!isUnrestrictedLicense(license)) continue;
    const thumbUrl = cleanMediaUrl(info.thumburl ?? info.url ?? "");
    const url = cleanMediaUrl(info.thumburl ?? info.url ?? "");
    if (!thumbUrl || !url || !page.pageid) continue;
    photos.push({
      id: String(page.pageid),
      title: fileTitle(page.title) || "Photo",
      thumbUrl,
      url,
    });
  }
  return photos;
}

export async function searchStockPhotos(query: string): Promise<StockPhoto[]> {
  const q = normalizeStockPhotoQuery(query);
  if (!q) return [];

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "24",
    gsrsearch: `${q} hastemplate:CC-Zero filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "960",
    iiextmetadatafilter: "LicenseShortName",
  });

  const response = await fetch(`${WIKIMEDIA_ENDPOINT}?${params.toString()}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error("Photo search is unavailable right now.");
  }
  const payload = (await response.json()) as WikiSearchResponse;
  return mapWikimediaPages(payload.query?.pages).slice(0, 21);
}
