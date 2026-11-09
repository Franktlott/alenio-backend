import type { ReactNode } from "react";
import { MarketingFooter } from "./MarketingFooter";
import { SiteHeader, type SiteNavId } from "./SiteHeader";
import "./site-chrome.css";

type Props = {
  children: ReactNode;
  activeNav?: SiteNavId;
  /** Content shown inside the purple header band (eyebrow, title, copy, actions). */
  hero?: ReactNode;
};

export function WebsiteChrome({ children, activeNav, hero }: Props) {
  return (
    <div className="lp lp-page">
      <section className={`lp-hero lp-band${hero ? "" : " lp-band--slim"}`}>
        <div className="lp-hero-glow" aria-hidden />
        <SiteHeader active={activeNav} />
        {hero ? <div className="lp-band-hero">{hero}</div> : null}
        <svg className="lp-hero-wave" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden>
          <path d="M0 96C240 150 480 160 760 118S1210 30 1440 70V160H0Z" />
        </svg>
      </section>
      {children}
      <MarketingFooter />
    </div>
  );
}
