import { FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Section = "discover" | "home-insights";

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
      {extra}
    </nav>
  );
}
