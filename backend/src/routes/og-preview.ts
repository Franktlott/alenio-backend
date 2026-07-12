import { Hono } from "hono";
import type { AppUser } from "../auth";

type Variables = {
  user: AppUser | null;
};

export const ogPreviewRouter = new Hono<{ Variables: Variables }>();

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function parseSafePreviewUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    throw new Error("URL not allowed");
  }
  return parsed;
}

/** Extract YouTube video id from watch / youtu.be / shorts / embed URLs. */
export function parseYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[\w-]{6,}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{6,}$/.test(v)) return v;
    const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/);
    return m?.[1] ?? null;
  }
  return null;
}

async function fetchYouTubePreview(pageUrl: URL, videoId: string) {
  let title: string | null = null;
  let image: string | null = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let description: string | null = null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl.toString())}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlenioPreview/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        title?: string;
        thumbnail_url?: string;
        author_name?: string;
      };
      title = data.title?.trim() || null;
      if (data.thumbnail_url) image = data.thumbnail_url;
      description = data.author_name ? `YouTube · ${data.author_name}` : "YouTube";
    }
  } catch {
    // Fall back to CDN thumbnail + generic title
  }

  return {
    title: title ?? "YouTube video",
    image,
    description: description ?? "YouTube",
    domain: "youtube.com",
    url: pageUrl.toString(),
    provider: "youtube" as const,
    videoId,
  };
}

ogPreviewRouter.get("/", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const url = c.req.query("url");
  if (!url) return c.json({ error: { message: "url required", code: "BAD_REQUEST" } }, 400);

  let safeUrl: URL;
  try {
    safeUrl = parseSafePreviewUrl(url);
  } catch (err) {
    return c.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Invalid URL",
          code: "BAD_REQUEST",
        },
      },
      400,
    );
  }

  const youtubeId = parseYouTubeVideoId(safeUrl);
  if (youtubeId) {
    const data = await fetchYouTubePreview(safeUrl, youtubeId);
    return c.json({ data });
  }

  try {
    const res = await fetch(safeUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    const html = await res.text();
    const finalUrl = new URL(res.url || safeUrl.toString());

    const getMeta = (prop: string): string | null => {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"'<>]+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
      return m?.[1]?.trim() ?? null;
    };

    const resolveUrl = (href: string | null): string | null => {
      if (!href) return null;
      try {
        return new URL(href, finalUrl).toString();
      } catch {
        return null;
      }
    };

    const getLinkHref = (...rels: string[]): string | null => {
      for (const rel of rels) {
        const m =
          html.match(
            new RegExp(
              `<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]+href=["']([^"'<>]+)["']`,
              "i",
            ),
          ) ??
          html.match(
            new RegExp(
              `<link[^>]+href=["']([^"'<>]+)["'][^>]+rel=["'][^"']*${rel}[^"']*["']`,
              "i",
            ),
          );
        const resolved = resolveUrl(m?.[1]?.trim() ?? null);
        if (resolved) return resolved;
      }
      return null;
    };

    const title =
      getMeta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const image = resolveUrl(getMeta("og:image") ?? getMeta("twitter:image"));
    const description = getMeta("og:description") ?? getMeta("description") ?? null;
    const domain = finalUrl.hostname.replace(/^www\./, "");
    const favicon =
      getLinkHref("apple-touch-icon", "icon", "shortcut icon") ??
      resolveUrl("/favicon.ico") ??
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

    return c.json({
      data: {
        title,
        image,
        favicon,
        description,
        domain,
        url: finalUrl.toString(),
      },
    });
  } catch {
    return c.json({ error: { message: "Failed to fetch preview", code: "FETCH_ERROR" } }, 400);
  }
});
