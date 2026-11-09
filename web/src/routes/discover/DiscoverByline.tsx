import { discoverByline } from "../../lib/discover-public-api";
import "./discover-byline.css";

export function ArticleByline({
  article,
  minutes = 0,
}: {
  article: { authorName?: string | null; publishedAt?: string | null; lastPublishedAt?: string | null };
  minutes?: number;
}) {
  const { author, when } = discoverByline(article);
  return (
    <p className="discover-byline" data-testid="discover-byline">
      {article.authorName?.trim() ? null : (
        <img src="/icon.png" alt="" className="discover-byline-mark" aria-hidden />
      )}
      <span>
        By <strong>{author}</strong>
      </span>
      {minutes > 0 ? (
        <>
          <span className="discover-byline-dot" aria-hidden>
            ·
          </span>
          <span>{minutes} min read</span>
        </>
      ) : null}
      {when ? (
        <>
          <span className="discover-byline-dot" aria-hidden>
            ·
          </span>
          <span>{when}</span>
        </>
      ) : null}
    </p>
  );
}
