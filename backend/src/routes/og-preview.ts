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

  try {
    const res = await fetch(safeUrl.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlenioPreview/1.0)" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    const html = await res.text();

    const getMeta = (prop: string): string | null => {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"'<>]+)["']`, "i")) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
      return m?.[1]?.trim() ?? null;
    };

    const title =
      getMeta("og:title") ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    const image = getMeta("og:image") ?? getMeta("twitter:image") ?? null;
    const description = getMeta("og:description") ?? getMeta("description") ?? null;
    const domain = safeUrl.hostname.replace(/^www\./, "");

    return c.json({ data: { title, image, description, domain, url: safeUrl.toString() } });
  } catch {
    return c.json({ error: { message: "Failed to fetch preview", code: "FETCH_ERROR" } }, 400);
  }
});
