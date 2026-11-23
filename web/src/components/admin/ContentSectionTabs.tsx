import { Building2, FileText, Megaphone, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Section = "discover" | "home-insights" | "home-workspace" | "feed-posts";

export function ContentSectionTabs({
  active,
  extra,
}: {
  active: Section;
  extra?: ReactNode;
}) {
  return (
    <nav className="dm-tabs" aria-label="Content sections">
      <Link
        to="/admin/discover"
        className={`dm-tab${active === "discover" ? " dm-tab--active" : ""}`}
        aria-current={active === "discover" ? "page" : undefined}
        style={{ textDecoration: "none" }}
      >
        <FileText size={15} strokeWidth={2.2} />
        Discover
      </Link>
      <Link
        to="/admin/home-insights"
        className={`dm-tab${active === "home-insights" ? " dm-tab--active" : ""}`}
        aria-current={active === "home-insights" ? "page" : undefined}
        data-testid="dm-tab-home-insights"
        style={{ textDecoration: "none" }}
      >
        <Sparkles size={15} strokeWidth={2.2} />
        Home insights
      </Link>
      <Link
        to="/admin/home-workspace"
        className={`dm-tab${active === "home-workspace" ? " dm-tab--active" : ""}`}
        aria-current={active === "home-workspace" ? "page" : undefined}
        data-testid="dm-tab-home-workspace"
        style={{ textDecoration: "none" }}
      >
        <Building2 size={15} strokeWidth={2.2} />
        Workspace card
      </Link>
      <Link
        to="/admin/feed-posts"
        className={`dm-tab${active === "feed-posts" ? " dm-tab--active" : ""}`}
        aria-current={active === "feed-posts" ? "page" : undefined}
        data-testid="dm-tab-feed-posts"
        style={{ textDecoration: "none" }}
      >
        <Megaphone size={15} strokeWidth={2.2} />
        Feed posts
      </Link>
      {extra}
    </nav>
  );
}
