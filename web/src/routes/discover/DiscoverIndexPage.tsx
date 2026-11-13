import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  discoverCategoryColor,
  fetchPublicDiscoverArticles,
  fetchPublicDiscoverCategories,
  type DiscoverPublicArticle,
  type DiscoverPublicCategory,
} from "../../lib/discover-public-api";
import { useDiscoverLibrary } from "../../lib/discover-library";
import "./discover-index.css";

type Tab = "for-you" | "all" | "saved";

const TOPIC_PHOTO: Record<string, string> = {
  reflection: "/discover-topics/discover-topic-reflection-editorial.jpg",
  growth: "/discover-topics/discover-topic-growth-editorial.jpg",
  leadership: "/discover-topics/discover-topic-leadership-editorial.jpg",
  communication: "/discover-topics/discover-topic-communication-editorial.jpg",
  connection: "/discover-topics/discover-topic-connection-editorial.jpg",
  wellbeing: "/discover-topics/discover-topic-wellbeing-editorial.jpg",
  "well-being": "/discover-topics/discover-topic-wellbeing-editorial.jpg",
  productivity: "/discover-topics/discover-topic-productivity-editorial.jpg",
  "help-article": "/discover-topics/discover-topic-help-article-editorial.jpg",
  help: "/discover-topics/discover-topic-help-article-editorial.jpg",
  "help article": "/discover-topics/discover-topic-help-article-editorial.jpg",
  change: "/discover-topics/discover-topic-leadership-editorial.jpg",
  teamwork: "/discover-topics/discover-topic-connection-editorial.jpg",
};

const TOPIC_PHOTO_FALLBACK = "/discover-topics/discover-topic-reflection-editorial.jpg";

function topicPhotoUrl(category: DiscoverPublicCategory): string {
  const slug = category.slug.trim().toLowerCase();
  const nameKey = category.name.trim().toLowerCase();
  const compact = `${slug} ${nameKey}`.replace(/[^a-z0-9]+/g, " ");
  const direct =
    TOPIC_PHOTO[slug] ??
    TOPIC_PHOTO[nameKey] ??
    TOPIC_PHOTO[nameKey.replace(/\s+/g, "-")];
  if (direct) return direct;
  if (/\bhelp\b/.test(compact)) return TOPIC_PHOTO["help-article"];
  if (/\breflect/.test(compact)) return TOPIC_PHOTO.reflection;
  if (/\bgrowth\b|\blearn/.test(compact)) return TOPIC_PHOTO.growth;
  if (/\blead/.test(compact)) return TOPIC_PHOTO.leadership;
  if (/\bcommunicat|\bmessage/.test(compact)) return TOPIC_PHOTO.communication;
  if (/\bconnect|\bteam/.test(compact)) return TOPIC_PHOTO.connection;
  if (/\bwell.?being|\bwellness|\bhealth/.test(compact)) return TOPIC_PHOTO.wellbeing;
  if (/\bproductiv|\bfocus/.test(compact)) return TOPIC_PHOTO.productivity;
  return TOPIC_PHOTO_FALLBACK;
}

function matches(article: DiscoverPublicArticle, term: string): boolean {
  const haystack = [article.title, article.excerpt, article.category?.name ?? ""].join(" ").toLowerCase();
  return term.split(/\s+/).every((word) => haystack.includes(word));
}

function publishedTime(article: DiscoverPublicArticle): number {
  return article.publishedAt ? Date.parse(article.publishedAt) : 0;
}

function readLabel(article: DiscoverPublicArticle): string {
  return article.readingTimeMinutes > 0 ? `${article.readingTimeMinutes} min read` : "Quick read";
}

function SaveButton({
  slug,
  className,
  size = 16,
}: {
  slug: string;
  className?: string;
  size?: number;
}) {
  const { isSaved, toggleSaved } = useDiscoverLibrary();
  const saved = isSaved(slug);
  return (
    <button
      type="button"
      className={`${className ?? "dx-save"}${saved ? " is-saved" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Saved" : "Save for later"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSaved(slug);
      }}
    >
      {saved ? <BookmarkCheck size={size} strokeWidth={2.2} /> : <Bookmark size={size} strokeWidth={2.2} />}
    </button>
  );
}

function ArticleCard({ article }: { article: DiscoverPublicArticle }) {
  const color = discoverCategoryColor(article.category?.slug);
  return (
    <article className="dx-card" data-testid={`dx-card-${article.slug}`}>
      <Link to={`/discover/${encodeURIComponent(article.slug)}`} className="dx-card-link" aria-label={article.title}>
        <div className="dx-card-media">
          {article.coverImageUrl ? (
            <img src={article.coverImageUrl} alt="" loading="lazy" />
          ) : (
            <div className="dx-card-media-blank" aria-hidden>
              <BookOpen size={22} strokeWidth={2} />
            </div>
          )}
        </div>
        <div className="dx-card-copy">
          <div className="dx-card-kicker">
            {article.category ? <span style={{ color }}>{article.category.name.toUpperCase()}</span> : null}
            {article.category ? <span className="dx-dot">·</span> : null}
            <span>{readLabel(article).toUpperCase()}</span>
          </div>
          <h3 className="dx-card-title">{article.title}</h3>
          {article.excerpt ? <p className="dx-card-excerpt">{article.excerpt}</p> : null}
        </div>
      </Link>
      <SaveButton slug={article.slug} className="dx-card-save" />
    </article>
  );
}

function FeaturedPlaceholder({
  kicker = "FEATURED",
  topicName,
}: {
  kicker?: string;
  topicName?: string;
}) {
  return (
    <div
      className="dx-featured"
      aria-label="Featured article coming soon"
      data-testid="dx-featured-placeholder"
    >
      <div className="dx-featured-card dx-featured-card--placeholder">
        <div className="dx-featured-photo dx-featured-photo--placeholder" aria-hidden>
          <span className="dx-featured-orb dx-featured-orb--one" />
          <span className="dx-featured-orb dx-featured-orb--two" />
          <span className="dx-featured-orb dx-featured-orb--three" />
          <Sparkles size={28} strokeWidth={1.8} className="dx-featured-placeholder-mark" />
        </div>
        <div className="dx-featured-fade" aria-hidden />
        <div className="dx-featured-copy">
          <span className="dx-featured-kicker">{kicker}</span>
          <h2 className="dx-featured-title">Featured article coming soon</h2>
          <p className="dx-featured-excerpt">
            {topicName
              ? `A premium pick for ${topicName} is on the way. Browse articles below while we finish it.`
              : "A premium Discover highlight is on the way. Browse articles below while we finish it."}
          </p>
          <div className="dx-featured-actions">
            <span className="dx-featured-soon">Coming soon</span>
          </div>
        </div>
      </div>
      <div className="dx-featured-dots" aria-hidden />
    </div>
  );
}

function FeaturedCarousel({
  articles,
  kicker = "FEATURED",
  topicName,
  onSeeAll,
}: {
  articles: DiscoverPublicArticle[];
  kicker?: string;
  topicName?: string;
  onSeeAll: () => void;
}) {
  const [index, setIndex] = useState(0);
  const count = articles.length;
  useEffect(() => {
    setIndex(0);
  }, [articles]);
  useEffect(() => {
    if (index > count - 1) setIndex(0);
  }, [count, index]);

  const article = count > 0 ? articles[Math.min(index, count - 1)]! : null;
  const go = (delta: number) => setIndex((current) => (current + delta + count) % count);

  return (
    <section className="dx-featured-block" data-testid="dx-featured">
      <div className="dx-section-head">
        <h2>{topicName ? `Featured in ${topicName}` : "Featured"}</h2>
        <button
          type="button"
          className="dx-link"
          onClick={onSeeAll}
          data-testid="dx-see-all-articles"
        >
          {topicName ? `See all in ${topicName}` : "See all articles"}
        </button>
      </div>
      {article ? (
        <div
          className="dx-featured"
          aria-roledescription="carousel"
          aria-label="Featured articles"
        >
          <div className="dx-featured-card" key={article.id}>
            {article.coverImageUrl ? (
              <img src={article.coverImageUrl} alt="" className="dx-featured-photo" />
            ) : (
              <div className="dx-featured-photo dx-featured-photo--blank" aria-hidden />
            )}
            <div className="dx-featured-fade" aria-hidden />
            <div className="dx-featured-copy">
              <span className="dx-featured-kicker">{kicker}</span>
              <h2 className="dx-featured-title">{article.title}</h2>
              {article.excerpt ? (
                <p className="dx-featured-excerpt">{article.excerpt}</p>
              ) : null}
              <div className="dx-featured-actions">
                <Link
                  to={`/discover/${encodeURIComponent(article.slug)}`}
                  className="dx-featured-read"
                >
                  Read article
                  <ArrowRight size={15} strokeWidth={2.4} />
                </Link>
                <SaveLabelButton slug={article.slug} />
              </div>
            </div>
            {count > 1 ? (
              <div className="dx-featured-nav">
                <button
                  type="button"
                  aria-label="Previous featured article"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft size={16} strokeWidth={2.4} />
                </button>
                <span>
                  {index + 1}/{count}
                </span>
                <button
                  type="button"
                  aria-label="Next featured article"
                  onClick={() => go(1)}
                >
                  <ChevronRight size={16} strokeWidth={2.4} />
                </button>
              </div>
            ) : null}
          </div>
          <div
            className="dx-featured-dots"
            role={count > 1 ? "tablist" : undefined}
            aria-label={count > 1 ? "Featured articles" : undefined}
            aria-hidden={count <= 1}
          >
            {count > 1
              ? articles.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Show featured article ${i + 1}`}
                    className={i === index ? "is-active" : undefined}
                    onClick={() => setIndex(i)}
                  />
                ))
              : null}
          </div>
        </div>
      ) : (
        <FeaturedPlaceholder kicker={kicker} topicName={topicName} />
      )}
    </section>
  );
}

function SaveLabelButton({ slug }: { slug: string }) {
  const { isSaved, toggleSaved } = useDiscoverLibrary();
  const saved = isSaved(slug);
  return (
    <button type="button" className={`dx-featured-save${saved ? " is-saved" : ""}`} aria-pressed={saved} onClick={() => toggleSaved(slug)}>
      {saved ? <BookmarkCheck size={16} strokeWidth={2.2} /> : <Bookmark size={16} strokeWidth={2.2} />}
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export function DiscoverIndexPage() {
  const [params, setParams] = useSearchParams();
  const term = (params.get("q") ?? "").trim().toLowerCase();
  const topic = params.get("topic") ?? "";
  const [tab, setTab] = useState<Tab>("for-you");
  const feedRef = useRef<HTMLElement | null>(null);
  const { saved, progress } = useDiscoverLibrary();

  const articlesQuery = useQuery({
    queryKey: ["discover", "all"],
    queryFn: fetchPublicDiscoverArticles,
    staleTime: 60_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ["discover", "categories"],
    queryFn: fetchPublicDiscoverCategories,
    staleTime: 5 * 60_000,
  });

  const all = articlesQuery.data ?? [];

  const categories = useMemo<DiscoverPublicCategory[]>(() => {
    if (categoriesQuery.data && categoriesQuery.data.length > 0) return categoriesQuery.data;
    const seen = new Map<string, DiscoverPublicCategory>();
    for (const article of all) if (article.category) seen.set(article.category.id, article.category);
    return [...seen.values()].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [categoriesQuery.data, all]);

  const featured = useMemo(() => {
    if (topic) {
      return all
        .filter((a) => a.category?.slug === topic && a.featuredInCategory)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .slice(0, 5);
    }
    return all
      .filter((a) => a.isFeatured)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .slice(0, 5);
  }, [all, topic]);

  const allSorted = useMemo(
    () => [...all].sort((a, b) => publishedTime(b) - publishedTime(a)),
    [all],
  );

  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 14 * 864e5;
    const recent = allSorted.filter((a) => publishedTime(a) >= cutoff);
    return (recent.length >= 3 ? recent : allSorted).slice(0, 3);
  }, [allSorted]);

  const reading = useMemo(
    () =>
      Object.values(progress)
        .filter((p) => p.pct > 0 && p.pct < 100)
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 3),
    [progress],
  );

  const visible = useMemo(() => {
    let list: DiscoverPublicArticle[];
    if (tab === "saved") {
      const order = new Map(saved.map((slug, i) => [slug, i]));
      list = all.filter((a) => order.has(a.slug)).sort((a, b) => order.get(a.slug)! - order.get(b.slug)!);
    } else if (tab === "all") {
      list = allSorted;
    } else {
      // For you: featured first, then the rest by date.
      list = [...all].sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return publishedTime(b) - publishedTime(a);
      });
    }
    if (topic) list = list.filter((a) => a.category?.slug === topic);
    if (term) list = list.filter((a) => matches(a, term));
    return list;
  }, [all, tab, saved, allSorted, topic, term]);

  const showAllArticles = () => {
    setTab("all");
    window.requestAnimationFrame(() => {
      feedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const setTopic = (slug: string) => {
    const next = new URLSearchParams(params);
    if (!slug || slug === topic) next.delete("topic");
    else next.set("topic", slug);
    setParams(next, { replace: true });
  };

  const searching = Boolean(term);
  const loading = articlesQuery.isLoading;
  const activeTopic = categories.find((c) => c.slug === topic) ?? null;
  const topicName = activeTopic?.name;
  const heroTitle = searching
    ? `Search results`
    : topicName
      ? topicName
      : "Discover";
  const heroSubtitle = searching
    ? `${visible.length} ${visible.length === 1 ? "article" : "articles"} for “${params.get("q")}”${
        topicName ? ` in ${topicName}` : ""
      }.`
    : topicName
      ? activeTopic?.description?.trim() ||
        `Ideas and resources in ${topicName} to help you grow, lead, and create impact.`
      : "Ideas, perspectives, and resources to help you grow, lead, and create impact.";

  return (
    <div className="dx-page" data-testid="discover-index">
      <header className="dx-hero">
        <img src="/alenio-home-hero-sunset.jpg" alt="" className="dx-hero-photo" />
        <div className="dx-hero-fade" aria-hidden />
        <div className="dx-hero-copy">
          {topicName && !searching ? (
            <p className="dx-hero-eyebrow">Discover · Topic</p>
          ) : null}
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
        </div>
      </header>

      <div className="dx-body">
        <div className="dx-main">
          {searching ? (
            <div className="dx-search-head">
              <h2>
                Results for “{params.get("q")}”
                <span className="dx-count">{visible.length}</span>
              </h2>
              <Link
                to={topic ? `/discover?topic=${encodeURIComponent(topic)}` : "/discover"}
                className="dx-link"
              >
                Clear search
              </Link>
            </div>
          ) : (
            <FeaturedCarousel
              key={topic || "home"}
              articles={featured}
              topicName={topicName}
              onSeeAll={showAllArticles}
              kicker={
                topicName
                  ? `FEATURED · ${topicName.toUpperCase()}`
                  : "FEATURED"
              }
            />
          )}

          {categories.length > 0 && !searching ? (
            <section className="dx-topics" aria-label="Explore topics">
              <div className="dx-section-head">
                <h2>Explore topics</h2>
                {topic || searching ? (
                  <button
                    type="button"
                    className="dx-link"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.delete("topic");
                      next.delete("q");
                      setParams(next, { replace: true });
                    }}
                    data-testid="dx-remove-all-filters"
                  >
                    Remove all filters
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dx-link"
                    onClick={() => {
                      const row = document.querySelector(".dx-topic-row");
                      row?.scrollTo({ left: row.scrollWidth, behavior: "smooth" });
                    }}
                    data-testid="dx-view-all-topics"
                  >
                    View all →
                  </button>
                )}
              </div>
              <div className="dx-topic-row" data-testid="dx-topic-row">
                {categories.map((category) => {
                  const active = category.slug === topic;
                  const photo = topicPhotoUrl(category);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className={`dx-topic-card${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setTopic(active ? "" : category.slug)}
                      data-testid={`dx-topic-${category.slug}`}
                    >
                      <img
                        src={photo}
                        alt=""
                        className="dx-topic-card-photo"
                      />
                      <span className="dx-topic-card-fade" aria-hidden />
                      <span className="dx-topic-card-label">{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section
            ref={feedRef}
            className="dx-feed"
            aria-label="Articles"
            data-testid="dx-feed"
          >
            <div className="dx-tabs-row">
              <div className="dx-tabs" role="tablist" aria-label="Article lists">
                {(
                  [
                    ["for-you", "For you"],
                    ["all", topicName ? `All in ${topicName}` : "All"],
                    ["saved", saved.length > 0 ? `Saved (${saved.length})` : "Saved"],
                  ] as Array<[Tab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`dx-tab${tab === id ? " is-active" : ""}`}
                    onClick={() => setTab(id)}
                    data-testid={`dx-tab-${id}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {topicName ? (
                <span className="dx-topic-chip">
                  {topicName}
                  <button type="button" aria-label={`Clear ${topicName} filter`} onClick={() => setTopic("")}>
                    ×
                  </button>
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="dx-grid" role="status" aria-label="Loading articles" data-testid="dx-skeleton">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="dx-card dx-card--skel" aria-hidden>
                    <div className="dx-card-media dx-skel" />
                    <div className="dx-card-copy">
                      <span className="dx-skel dx-skel-line" style={{ width: "45%" }} />
                      <span className="dx-skel dx-skel-title" />
                      <span className="dx-skel dx-skel-title" style={{ width: "62%" }} />
                      <span className="dx-skel dx-skel-line" style={{ width: "88%", marginTop: 10 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {articlesQuery.isError ? <p className="dx-note">Discover is not available right now.</p> : null}

            {!loading && !articlesQuery.isError && visible.length === 0 ? (
              <div className="dx-empty">
                {tab === "saved" && !term && !topic ? (
                  <>
                    <Bookmark size={22} strokeWidth={2} />
                    <h3>Nothing saved yet</h3>
                    <p>Tap the bookmark on any article to keep it here for later.</p>
                  </>
                ) : (
                  <>
                    <Sparkles size={22} strokeWidth={2} />
                    <h3>Nothing here yet</h3>
                    <p>{term || topic ? "Try another search or topic." : "New articles are on the way."}</p>
                  </>
                )}
              </div>
            ) : null}

            {visible.length > 0 ? (
              <div className="dx-grid">
                {visible.map((article) => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="dx-side">
          {newThisWeek.length > 0 ? (
            <section className="dx-panel" aria-label="New this week">
              <div className="dx-panel-head">
                <TrendingUp size={17} strokeWidth={2.2} />
                <h2>New this week</h2>
              </div>
              <ol className="dx-ranked">
                {newThisWeek.map((article, i) => (
                  <li key={article.id}>
                    <Link to={`/discover/${encodeURIComponent(article.slug)}`}>
                      <span className="dx-rank">{i + 1}</span>
                      <span className="dx-ranked-copy">
                        <span className="dx-ranked-title">{article.title}</span>
                        <span className="dx-ranked-meta">{readLabel(article)}</span>
                      </span>
                      <ChevronRight size={16} strokeWidth={2.2} className="dx-ranked-chevron" />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section className="dx-panel" aria-label="Your reading">
            <div className="dx-panel-head">
              <BookOpen size={17} strokeWidth={2.2} />
              <h2>Your reading</h2>
              {saved.length > 0 ? (
                <button type="button" className="dx-link" onClick={() => setTab("saved")}>
                  Saved
                </button>
              ) : null}
            </div>
            {reading.length === 0 ? (
              <p className="dx-panel-empty">Articles you start show up here so you can pick up where you left off.</p>
            ) : (
              <ul className="dx-reading">
                {reading.map((item) => (
                  <li key={item.slug}>
                    <Link to={`/discover/${encodeURIComponent(item.slug)}`}>
                      {item.coverImageUrl ? (
                        <img src={item.coverImageUrl} alt="" className="dx-reading-thumb" />
                      ) : (
                        <span className="dx-reading-thumb dx-reading-thumb--blank" aria-hidden />
                      )}
                      <span className="dx-reading-copy">
                        <span className="dx-reading-title">{item.title}</span>
                        <span className="dx-reading-bar">
                          <span className="dx-reading-track">
                            <span className="dx-reading-fill" style={{ width: `${item.pct}%` }} />
                          </span>
                          <span className="dx-reading-pct">{item.pct}%</span>
                        </span>
                      </span>
                      <ChevronRight size={16} strokeWidth={2.2} className="dx-ranked-chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
