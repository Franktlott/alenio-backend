import type { DiscoverNode } from "../../lib/discover-public-api";
import { DiscoverArticleBody } from "./DiscoverArticleBody";
import { DiscoverArticleHero } from "./DiscoverArticleHero";
import "./discover-read.css";

export function DiscoverArticleView({
  category,
  title,
  excerpt,
  coverImageUrl,
  coverImageAlt,
  readingTimeMinutes,
  content,
  senecaEnabled,
  senecaPrompt,
  authorName,
  publishedAt,
}: {
  category?: string | null;
  title: string;
  excerpt: string;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  readingTimeMinutes: number;
  content: { content?: unknown[] } | null;
  senecaEnabled?: boolean;
  senecaPrompt?: string;
  authorName?: string;
  publishedAt?: string | null;
}) {
  const blocks = Array.isArray(content?.content) ? (content.content as DiscoverNode[]) : [];
  return (
    <article className="ddoc discover-preview-doc">
      <DiscoverArticleHero
        categoryName={category}
        title={title}
        excerpt={excerpt}
        coverImageUrl={coverImageUrl}
        coverImageAlt={coverImageAlt}
        readingTimeMinutes={readingTimeMinutes}
        byline={{ authorName, publishedAt, lastPublishedAt: publishedAt }}
        linkBreadcrumb={false}
      />
      <DiscoverArticleBody blocks={blocks} />
      {senecaEnabled && senecaPrompt ? (
        <section className="discover-seneca">
          <div className="discover-kicker">Reflect with Seneca</div>
          <p>{senecaPrompt}</p>
        </section>
      ) : null}
    </article>
  );
}
