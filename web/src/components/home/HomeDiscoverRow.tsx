import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  discoverCategoryColor,
  fetchHomeDiscoverArticles,
  type DiscoverPublicArticle,
} from "../../lib/discover-public-api";
import "./home-discover-row.css";

const CARD_WIDTH = 196;
const CARD_GAP = 10;

export function DiscoverCard({ article }: { article: DiscoverPublicArticle }) {
  const color = discoverCategoryColor(article.category?.slug);
  return (
    <Link
      to={`/discover/${encodeURIComponent(article.slug)}`}
      className="home-discover-card"
      data-testid={`home-discover-${article.slug}`}
      aria-label={article.title}
    >
      {article.coverImageUrl ? (
        <img src={article.coverImageUrl} alt="" className="home-discover-card-image" loading="lazy" />
      ) : (
        <div className="home-discover-card-image" aria-hidden />
      )}
      <div className="home-discover-card-copy">
        <div className="home-discover-card-kicker">
          {article.category ? <span style={{ color }}>{article.category.name.toUpperCase()}</span> : null}
          {article.category ? <span className="home-discover-card-dot">·</span> : null}
          <span>{article.readingTimeMinutes > 0 ? `${article.readingTimeMinutes} MIN READ` : "QUICK READ"}</span>
        </div>
        <span className="home-discover-card-title">{article.title}</span>
        {article.excerpt ? <span className="home-discover-card-excerpt">{article.excerpt}</span> : null}
      </div>
    </Link>
  );
}

export function HomeDiscoverRow() {
  const query = useQuery({
    queryKey: ["discover", "home"],
    queryFn: fetchHomeDiscoverArticles,
    staleTime: 60_000,
  });
  const articles = query.data ?? [];
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanBack(el.scrollLeft > 2);
    setCanForward(el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, articles.length]);

  const scrollBy = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.max(CARD_WIDTH + CARD_GAP, Math.floor(el.clientWidth * 0.8));
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (articles.length === 0) return null;

  return (
    <section className="home-discover" data-testid="home-discover" aria-labelledby="home-discover-heading">
      <div className="home-discover-head">
        <Sparkles size={16} strokeWidth={2.3} className="home-discover-spark" aria-hidden />
        <h2 id="home-discover-heading" className="home-discover-heading">
          Discover
        </h2>
        <Link to="/discover" className="home-discover-link" data-testid="home-discover-explore">
          Explore all
          <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
        </Link>
      </div>
      <p className="home-discover-subtitle">Ideas, perspectives, and tools to help you grow.</p>
      <div className="home-discover-shelf">
        <div className="home-discover-scroller" ref={scrollerRef} onScroll={measure}>
          {articles.map((article) => (
            <DiscoverCard key={article.id} article={article} />
          ))}
        </div>
        {canBack ? (
          <button
            type="button"
            className="home-discover-arrow home-discover-arrow--back"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll back"
          >
            <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
        {canForward ? (
          <button
            type="button"
            className="home-discover-arrow home-discover-arrow--forward"
            onClick={() => scrollBy(1)}
            aria-label="Scroll forward"
          >
            <ChevronRight size={18} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
      </div>
    </section>
  );
}
