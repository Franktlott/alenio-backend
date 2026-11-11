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
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`
    : null;
}
