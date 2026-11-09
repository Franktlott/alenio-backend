import type { DiscoverArticleSummary } from "./discover";

export function articlesForHome(
  featured: DiscoverArticleSummary[],
  recent: DiscoverArticleSummary[],
  limit = 3,
): DiscoverArticleSummary[] {
  const source = featured.length > 0 ? featured : recent;
  return source.slice(0, limit);
}
