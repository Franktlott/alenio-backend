import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  searchHelpArticles,
  type HelpCategoryId,
} from "../lib/help-center-content";
import { LEGAL_CONTACT_EMAIL } from "../lib/legal-constants";

type CategoryFilter = HelpCategoryId | "all";

export function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<CategoryFilter>("all");
  const results = useMemo(
    () => searchHelpArticles(query, categoryId),
    [categoryId, query],
  );
  const featured = HELP_ARTICLES.filter((article) => article.featured).slice(0, 4);
  const filtering = query.trim().length > 0 || categoryId !== "all";

  return (
    <WebsiteChrome>
      <main className="help-page" data-testid="help-center-page">
        <section className="help-hero" aria-labelledby="help-heading">
          <p className="help-eyebrow">Alenio Help Center</p>
          <h1 id="help-heading">How can we help?</h1>
          <p className="help-hero-copy">
            Find clear guidance for Alenio, your workspace, and Seneca AI.
          </p>
          <div className="help-search">
            <span className="help-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
            </span>
            <label className="sr-only" htmlFor="help-search-input">
              Search Help Center
            </label>
            <input
              id="help-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guides and answers"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className="help-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear Help Center search"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="help-popular" aria-label="Popular guides">
            <span>Popular:</span>
            {featured.slice(0, 3).map((article) => (
              <Link key={article.slug} to={`/help/${article.slug}`}>
                {article.title}
              </Link>
            ))}
          </div>
        </section>

        <div className="help-shell">
          {!filtering ? (
            <section className="help-featured" aria-labelledby="help-featured-heading">
              <div className="help-section-heading">
                <div>
                  <p className="help-section-kicker">Start here</p>
                  <h2 id="help-featured-heading">Popular guides</h2>
                </div>
              </div>
              <div className="help-featured-grid">
                {featured.map((article, index) => (
                  <Link
                    key={article.slug}
                    to={`/help/${article.slug}`}
                    className="help-featured-card"
                  >
                    <span className="help-card-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{article.title}</h3>
                      <p>{article.summary}</p>
                    </div>
                    <span className="help-card-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="help-library" aria-labelledby="help-library-heading">
            <div className="help-section-heading help-library-heading">
              <div>
                <p className="help-section-kicker">Browse support</p>
                <h2 id="help-library-heading">
                  {filtering ? "Search results" : "All help topics"}
                </h2>
              </div>
              <span className="help-result-count" aria-live="polite">
                {results.length} {results.length === 1 ? "guide" : "guides"}
              </span>
            </div>

            <div className="help-category-tabs" role="group" aria-label="Filter help guides by category">
              <button
                type="button"
                className={categoryId === "all" ? "help-category-active" : undefined}
                onClick={() => setCategoryId("all")}
              >
                All
              </button>
              {HELP_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={categoryId === category.id ? "help-category-active" : undefined}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.title}
                </button>
              ))}
            </div>

            {results.length > 0 ? (
              <div className="help-article-grid">
                {results.map((article) => {
                  const category = HELP_CATEGORIES.find(
                    (candidate) => candidate.id === article.categoryId,
                  );
                  return (
                    <Link
                      key={article.slug}
                      to={`/help/${article.slug}`}
                      className="help-article-card"
                    >
                      <div className="help-article-meta">
                        <span>{category?.title}</span>
                        <span>{article.readMinutes} min read</span>
                      </div>
                      <h3>{article.title}</h3>
                      <p>{article.summary}</p>
                      <span className="help-article-link">Read guide →</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="help-empty">
                <span className="help-empty-mark" aria-hidden="true">
                  ?
                </span>
                <h3>No guides found</h3>
                <p>Try a shorter search or browse all help topics.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategoryId("all");
                  }}
                >
                  Show all guides
                </button>
              </div>
            )}
          </section>

          <section className="help-contact" aria-labelledby="help-contact-heading">
            <div>
              <p className="help-section-kicker">Still need help?</p>
              <h2 id="help-contact-heading">Talk with the Alenio team</h2>
              <p>
                Tell us what you were trying to do and what happened. Do not send passwords,
                payment-card details, or sensitive workspace information.
              </p>
            </div>
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Alenio%20support`}>
              Contact support
            </a>
          </section>
        </div>
      </main>
    </WebsiteChrome>
  );
}
