import type { DiscoverArticleSummary } from "./discover";

export function articlesForHome(
  featured: DiscoverArticleSummary[],
  recent: DiscoverArticleSummary[],
  /** Home Explore shows one featured article. */
  limit = 1,
): DiscoverArticleSummary[] {
  const source = featured.length > 0 ? featured : recent;
  return source.slice(0, limit);
}
