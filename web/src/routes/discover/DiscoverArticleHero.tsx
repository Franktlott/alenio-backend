import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArticleByline } from "./DiscoverByline";
import "./discover-doc.css";

type Props = {
  categoryName?: string | null;
  title: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  readingTimeMinutes: number;
  byline: { authorName?: string | null; publishedAt?: string | null; lastPublishedAt?: string | null };
  /** Save / share buttons on the reader; the editor preview has none. */
  actions?: ReactNode;
  /** The preview has no router destination worth leaving to. */
  linkBreadcrumb?: boolean;
};

export function DiscoverArticleHero({
  categoryName,
  title,
  excerpt,
  coverImageUrl,
  coverImageAlt,
  readingTimeMinutes,
  byline,
  actions,
  linkBreadcrumb = true,
}: Props) {
  const cover = coverImageUrl && /^https:\/\//i.test(coverImageUrl) ? coverImageUrl : null;
  return (
    <header className={`ddoc-hero${cover ? "" : " ddoc-hero--plain"}`} data-testid="ddoc-hero">
      {cover ? <img className="ddoc-hero-img" src={cover} alt={coverImageAlt ?? ""} /> : null}
      {actions ? <div className="ddoc-hero-actions">{actions}</div> : null}
      <div className="ddoc-hero-copy">
        <nav className="ddoc-crumbs" aria-label="Breadcrumb">
          <img className="ddoc-crumbs-mark" src="/alenio-mark-icon.svg" alt="" aria-hidden />
          {linkBreadcrumb ? <Link to="/discover">Discover</Link> : <span>Discover</span>}
          {categoryName ? (
            <>
              <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
              <span className="ddoc-crumb-current">{categoryName}</span>
            </>
          ) : null}
        </nav>
        <h1 className="ddoc-hero-title">{title || "Untitled"}</h1>
        {excerpt ? <p className="ddoc-hero-excerpt">{excerpt}</p> : null}
        <ArticleByline article={byline} minutes={readingTimeMinutes} />
      </div>
    </header>
  );
}
