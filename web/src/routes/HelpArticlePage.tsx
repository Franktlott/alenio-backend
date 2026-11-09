import { Link, useParams } from "react-router-dom";
import { WebsiteChrome } from "../components/WebsiteChrome";
import {
  HELP_ARTICLES,
  helpArticleBySlug,
  helpCategory,
} from "../lib/help-center-content";
import { LEGAL_CONTACT_EMAIL } from "../lib/legal-constants";

export function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = helpArticleBySlug(slug);

  if (!article) {
    return (
      <WebsiteChrome>
        <main className="help-page help-not-found" data-testid="help-article-not-found">
          <div className="help-not-found-card">
            <span className="help-empty-mark" aria-hidden="true">
              ?
            </span>
            <p className="help-section-kicker">Help Center</p>
            <h1>We couldn’t find that guide</h1>
            <p>The link may have changed, or the guide may no longer be available.</p>
            <Link to="/help">Browse Help Center</Link>
          </div>
        </main>
      </WebsiteChrome>
    );
  }

  const category = helpCategory(article.categoryId);
  const explicitRelated = (article.relatedSlugs ?? [])
    .map((relatedSlug) => helpArticleBySlug(relatedSlug))
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
  const related = (
    explicitRelated.length > 0
      ? explicitRelated
      : HELP_ARTICLES.filter(
          (candidate) =>
            candidate.categoryId === article.categoryId &&
            candidate.slug !== article.slug,
        )
  ).slice(0, 3);

  return (
    <WebsiteChrome>
      <main className="help-page help-article-page" data-testid="help-article-page">
        <div className="help-article-shell">
          <nav className="help-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/help">Help Center</Link>
            <span aria-hidden="true">/</span>
            <Link to="/help">{category.title}</Link>
          </nav>

          <header className="help-article-hero">
            <p className="help-section-kicker">{category.title}</p>
            <h1>{article.title}</h1>
            <p>{article.summary}</p>
            <div className="help-article-byline">
              <span>{article.readMinutes} min read</span>
              <span>Written by Alenio</span>
            </div>
          </header>

          <div className="help-article-layout">
            <aside className="help-article-toc" aria-label="In this guide">
              <p>In this guide</p>
              <ol>
                {article.sections.map((section, index) => (
                  <li key={section.heading}>
                    <a href={`#section-${index + 1}`}>{section.heading}</a>
                  </li>
                ))}
              </ol>
              <div className="help-article-support">
                <span>Need more help?</span>
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Alenio%20support`}>
                  Contact support
                </a>
              </div>
            </aside>

            <article className="help-article-content">
              {article.youtubeId ? (
                <div className="help-video">
                  <div className="help-video-frame">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(article.youtubeId)}`}
                      title={`${article.title} video guide`}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <p>Prefer reading? The complete instructions are included below.</p>
                </div>
              ) : null}

              {article.sections.map((section, index) => (
                <section
                  key={section.heading}
                  id={`section-${index + 1}`}
                  className="help-article-section"
                >
                  <span className="help-section-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{section.heading}</h2>
                  {section.paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.steps ? (
                    <ol className="help-steps">
                      {section.steps.map((step) => (
                        <li key={step}>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {section.bullets ? (
                    <ul className="help-bullets">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ))}

              <div className="help-article-finish">
                <h2>Was this guide helpful?</h2>
                <p>
                  If something is missing or unclear, let the Alenio team know so we can improve it.
                </p>
                <a
                  href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent(
                    `Help Center feedback: ${article.title}`,
                  )}`}
                >
                  Send guide feedback
                </a>
              </div>
            </article>
          </div>

          {related.length > 0 ? (
            <section className="help-related" aria-labelledby="help-related-heading">
              <div className="help-section-heading">
                <div>
                  <p className="help-section-kicker">Keep learning</p>
                  <h2 id="help-related-heading">Related guides</h2>
                </div>
              </div>
              <div className="help-article-grid">
                {related.map((relatedArticle) => (
                  <Link
                    key={relatedArticle.slug}
                    to={`/help/${relatedArticle.slug}`}
                    className="help-article-card"
                  >
                    <div className="help-article-meta">
                      <span>{category.title}</span>
                      <span>{relatedArticle.readMinutes} min read</span>
                    </div>
                    <h3>{relatedArticle.title}</h3>
                    <p>{relatedArticle.summary}</p>
                    <span className="help-article-link">Read guide →</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </WebsiteChrome>
  );
}
