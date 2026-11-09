import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import {
  discoverIcon,
  discoverTone,
  type DiscoverCalloutAttrs,
  type DiscoverCardGridAttrs,
  type DiscoverChecklistAttrs,
} from "../../lib/discover-blocks";
import "./discover-doc.css";

function toneStyle(tone: string | undefined): CSSProperties {
  const value = discoverTone(tone);
  return { "--ddoc-fg": value.fg, "--ddoc-bg": value.bg, "--ddoc-border": value.border } as CSSProperties;
}

export function DiscoverCallout({ attrs }: { attrs: Partial<DiscoverCalloutAttrs> }) {
  const Icon = discoverIcon(attrs.icon);
  return (
    <aside className="ddoc-callout" style={toneStyle(attrs.tone)} data-testid="ddoc-callout">
      <span className="ddoc-icon-tile" aria-hidden>
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <div className="ddoc-callout-copy">
        {attrs.title ? <strong className="ddoc-callout-title">{attrs.title}</strong> : null}
        {attrs.text ? <p>{attrs.text}</p> : null}
      </div>
    </aside>
  );
}

export function DiscoverCardGrid({ attrs }: { attrs: Partial<DiscoverCardGridAttrs> }) {
  const cards = Array.isArray(attrs.cards) ? attrs.cards : [];
  return (
    <div className="ddoc-cards" data-count={cards.length} data-testid="ddoc-cards">
      {cards.map((card, index) => {
        const Icon = discoverIcon(card.icon);
        return (
          <section key={index} className="ddoc-card" style={toneStyle(card.tone)}>
            <span className="ddoc-icon-tile ddoc-icon-tile--lg" aria-hidden>
              <Icon size={24} strokeWidth={2.1} />
            </span>
            {card.kicker ? <span className="ddoc-card-kicker">{card.kicker}</span> : null}
            {card.title ? <h4 className="ddoc-card-title">{card.title}</h4> : null}
            {card.text ? <p className="ddoc-card-text">{card.text}</p> : null}
          </section>
        );
      })}
    </div>
  );
}

export function DiscoverChecklist({ attrs }: { attrs: Partial<DiscoverChecklistAttrs> }) {
  const Icon = discoverIcon(attrs.icon);
  const items = Array.isArray(attrs.items) ? attrs.items.filter((item) => item.trim()) : [];
  return (
    <aside className="ddoc-checklist" style={toneStyle(attrs.tone)} data-testid="ddoc-checklist">
      <div className="ddoc-checklist-head">
        <span className="ddoc-icon-tile" aria-hidden>
          <Icon size={20} strokeWidth={2.2} />
        </span>
        {attrs.title ? <strong className="ddoc-checklist-title">{attrs.title}</strong> : null}
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={index}>
              <span className="ddoc-check" aria-hidden>
                <Check size={12} strokeWidth={3} />
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
