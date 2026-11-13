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
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      const fromQuery = url.searchParams.get("v")?.trim() ?? "";
      if (YOUTUBE_ID.test(fromQuery)) return fromQuery;
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex(
        (part) => part === "embed" || part === "shorts" || part === "live",
      );
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

export function youtubeEmbedUrl(videoId: string): string | null {
  const id = parseYoutubeVideoId(videoId);
  return id
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&rel=0`
    : null;
}

/** YouTube Error 153: embeds need a real page origin/referrer. WebViews don't send one when loading the embed URL alone. */
export const YOUTUBE_EMBED_BASE_URL = "https://alenio.com";

export function youtubeEmbedHtml(videoId: string, title = "YouTube video"): string | null {
  const src = youtubeEmbedUrl(videoId);
  if (!src) return null;
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body { margin: 0; height: 100%; background: #0f172a; overflow: hidden; }
      iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      src="${src}"
      title="${safeTitle}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </body>
</html>`;
}
