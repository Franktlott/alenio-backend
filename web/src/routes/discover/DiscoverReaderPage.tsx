import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Check, FileDown, Share2 } from "lucide-react";
import {
  discoverCategoryColor,
  fetchPublicDiscoverArticle,
  fetchPublicDiscoverArticles,
  recordDiscoverView,
  type DiscoverPublicArticle,
} from "../../lib/discover-public-api";
import { recordDiscoverProgress, useDiscoverLibrary } from "../../lib/discover-library";
import { DiscoverArticleBody } from "./DiscoverArticleBody";
import { DiscoverArticleHero } from "./DiscoverArticleHero";
import "./discover-read.css";
import "./discover-print.css";

/** Stable for this article, so the pair does not jump while the page is open. */
function pickExplore(articles: DiscoverPublicArticle[], slug: string) {
  const pool = articles.filter((item) => item.slug !== slug);
  if (pool.length <= 2) return pool;
  const seed = [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const score = (value: string) => {
    let hash = seed || 1;
    for (const char of value) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    return hash;
  };
  return [...pool].sort((a, b) => score(a.id) - score(b.id)).slice(0, 2);
}

function BodySkeleton() {
  return (
    <div className="dread-skel-body" aria-hidden>
      {[100, 96, 92, 64].map((width, index) => (
        <span key={index} className="dread-skel dread-skel-line" style={{ width: `${width}%` }} />
      ))}
      <span className="dread-skel dread-skel-line dread-skel-gap" style={{ width: "98%" }} />
      {[94, 100, 72].map((width, index) => (
        <span key={index} className="dread-skel dread-skel-line" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="dread-article" role="status" aria-label="Loading article" data-testid="dread-skeleton">
      <span className="dread-skel dread-article-cover" />
      <div className="dread-article-columns">
        <div className="dread-article-main">
          <span className="dread-skel dread-skel-pill" />
          <span className="dread-skel dread-skel-title" />
          <span className="dread-skel dread-skel-title" style={{ width: "58%" }} />
          <span className="dread-skel dread-skel-line dread-skel-excerpt" style={{ width: "80%" }} />
          <BodySkeleton />
        </div>
        <aside className="dread-article-side" aria-hidden>
          <span className="dread-skel dread-skel-heading" />
          {[0, 1].map((key) => (
            <div key={key} className="dread-explore-row">
              <span className="dread-skel dread-explore-thumb" />
              <span className="dread-explore-copy dread-skel-copy">
                <span className="dread-skel dread-skel-line" style={{ width: "40%" }} />
                <span className="dread-skel dread-skel-line" style={{ width: "90%" }} />
              </span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export function DiscoverReaderPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const query = useQuery({
    queryKey: ["discover", "article", slug],
    queryFn: () => fetchPublicDiscoverArticle(slug),
    enabled: Boolean(slug),
  });
  const listQuery = useQuery({
    queryKey: ["discover", "all"],
    queryFn: fetchPublicDiscoverArticles,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!slug || !query.data) return;
    void recordDiscoverView(slug).catch(() => undefined);
  }, [slug, query.data]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.querySelector(".dread-page")?.scrollTo({ top: 0 });
  }, [slug]);

  const article = query.data;
  // The Discover page already has this article's card, so its header can show at once.
  const preview = useMemo(() => (listQuery.data ?? []).find((item) => item.slug === slug) ?? null, [listQuery.data, slug]);
  const shown: DiscoverPublicArticle | null = article ?? preview;
  const more = useMemo(() => pickExplore(listQuery.data ?? [], slug), [listQuery.data, slug]);
  const { isSaved, toggleSaved } = useDiscoverLibrary();
  const saved = isSaved(slug);
  const [copied, setCopied] = useState(false);

  /** The browser's print dialog saves a vector PDF; the title becomes the suggested file name. */
  const downloadPdf = (title: string) => {
    const previous = document.title;
    document.title = title;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const share = async (title: string) => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall back to copying when the share sheet is dismissed or unavailable.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  // Remember how far down the article the reader got, for "Your reading" on the Discover page.
  useEffect(() => {
    if (!article) return;
    const scroller = document.querySelector<HTMLElement>(".dread-page");
    if (!scroller) return;
    const save = (pct: number) =>
      recordDiscoverProgress({
        slug: article.slug,
        title: article.title,
        coverImageUrl: article.coverImageUrl,
        categoryName: article.category?.name ?? null,
        pct,
      });
    const measure = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      const pct = max <= 0 ? 100 : ((scroller.scrollTop + scroller.clientHeight * 0.25) / scroller.scrollHeight) * 100;
      save(Math.max(5, pct));
    };
    const timer = window.setTimeout(measure, 1200);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [article]);

  return (
    <div className="dread-page" data-testid="discover-reader">
      <div className="dread-page-inner">
        {!article && query.isError ? (
          <div className="dread-missing">
            <h1>This article isn't available</h1>
            <p>It may have been unpublished or moved.</p>
            <Link to="/discover">Back to Discover</Link>
          </div>
        ) : null}
        {!shown && !query.isError ? <ReaderSkeleton /> : null}
        {shown && !(query.isError && !article) ? (
          <article className="dread-article ddoc" aria-busy={!article}>
            <DiscoverArticleHero
              categoryName={shown.category?.name}
              title={shown.title}
              excerpt={shown.excerpt}
              coverImageUrl={shown.coverImageUrl}
              coverImageAlt={shown.coverImageAlt}
              readingTimeMinutes={shown.readingTimeMinutes}
              byline={shown}
              actions={
                <>
                  <button
                    type="button"
                    className="ddoc-hero-action"
                    aria-pressed={saved}
                    aria-label={saved ? "Saved" : "Save"}
                    title={saved ? "Saved" : "Save"}
                    onClick={() => toggleSaved(shown.slug)}
                    data-testid="dread-save"
                  >
                    {saved ? <BookmarkCheck size={17} strokeWidth={2.2} /> : <Bookmark size={17} strokeWidth={2.2} />}
                  </button>
                  <button
                    type="button"
                    className="ddoc-hero-action"
                    aria-label={copied ? "Link copied" : "Share"}
                    title={copied ? "Link copied" : "Share"}
                    onClick={() => void share(shown.title)}
                  >
                    {copied ? <Check size={17} strokeWidth={2.4} /> : <Share2 size={17} strokeWidth={2.2} />}
                  </button>
                  <button
                    type="button"
                    className="ddoc-hero-action"
                    aria-label="Download PDF"
                    title="Download PDF"
                    onClick={() => downloadPdf(shown.title)}
                    disabled={!article}
                    data-testid="dread-pdf"
                  >
                    <FileDown size={17} strokeWidth={2.2} />
                  </button>
                </>
              }
            />
            {article ? <DiscoverArticleBody blocks={article.content?.content ?? []} /> : <BodySkeleton />}
            {more.length > 0 ? (
              <section className="dread-more" aria-label="More to explore">
                <h2 className="dread-explore-heading">More to explore</h2>
                <div className="dread-more-grid">
                  {more.map((item) => {
                    const itemColor = discoverCategoryColor(item.category?.slug);
                    return (
                      <Link
                        key={item.id}
                        to={`/discover/${encodeURIComponent(item.slug)}`}
                        className="dread-explore-row"
                      >
                        {item.coverImageUrl ? (
                          <img src={item.coverImageUrl} alt="" className="dread-explore-thumb" />
                        ) : (
                          <div className="dread-explore-thumb" aria-hidden />
                        )}
                        <span className="dread-explore-copy">
                          {item.category ? (
                            <span className="dread-explore-kicker" style={{ color: itemColor }}>
                              {item.category.name.toUpperCase()}
                            </span>
                          ) : null}
                          <span className="dread-explore-title">{item.title}</span>
                          {item.readingTimeMinutes > 0 ? (
                            <span className="dread-explore-meta">{item.readingTimeMinutes} min read</span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </article>
        ) : null}
      </div>
    </div>
  );
}
