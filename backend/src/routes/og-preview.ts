import { Hono } from "hono";

export const ogPreviewRouter = new Hono();

ogPreviewRouter.get("/", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: { message: "url required", code: "BAD_REQUEST" } }, 400);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      signal: AbortSignal.timeout(6000),
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
    const domain = new URL(url).hostname.replace(/^www\./, "");

    return c.json({ data: { title, image, description, domain, url } });
  } catch {
    return c.json({ error: { message: "Failed to fetch preview", code: "FETCH_ERROR" } }, 400);
  }
});
