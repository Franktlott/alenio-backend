import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { BriefingRow } from "../../lib/api";
import {
  briefingRequiresInitialsLabel,
  estimateBriefingReadMinutes,
  formatBriefingDate,
  formatBriefingPublishedLabel,
  isBriefingWithinNewBadgeWindow,
} from "../../lib/briefings-display";

type Props = {
  briefings: BriefingRow[];
  reviewBasePath: string;
};

function sortBriefings(rows: BriefingRow[]): BriefingRow[] {
  return [...rows].sort((a, b) => {
    const reviewedDelta = Number(a.status === "reviewed") - Number(b.status === "reviewed");
    if (reviewedDelta !== 0) return reviewedDelta;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function statusPill(
  status: BriefingRow["status"],
  publishedAt: string,
): { label: string; className: string } | null {
  if (status === "reviewed") {
    return { label: "Completed", className: "go-kiosk-briefing-pill go-kiosk-briefing-pill--done" };
  }
  if (status === "overdue") {
    return { label: "Overdue", className: "go-kiosk-briefing-pill go-kiosk-briefing-pill--overdue" };
  }
  if (isBriefingWithinNewBadgeWindow(publishedAt)) {
    return { label: "New", className: "go-kiosk-briefing-pill go-kiosk-briefing-pill--new" };
  }
  return null;
}

export function GoKioskBriefingsList({ briefings, reviewBasePath }: Props) {
  const sorted = useMemo(() => sortBriefings(briefings), [briefings]);

  if (sorted.length === 0) {
    return (
      <div className="go-kiosk-briefings-empty">
        <p>No briefings published yet.</p>
        <span>Check back when your workspace shares an update.</span>
      </div>
    );
  }

  return (
    <ul className="go-kiosk-briefings-list" data-testid="go-kiosk-briefings-list">
      {sorted.map((briefing) => {
        const pill = statusPill(briefing.status, briefing.publishedAt);
        const readMinutes = estimateBriefingReadMinutes(briefing.description);
        const initialsLabel = briefingRequiresInitialsLabel(
          briefing.allowInitials,
          briefing.requireSignature,
        );

        return (
          <li key={briefing.id} className="go-kiosk-briefing-card">
            <div className="go-kiosk-briefing-doc-icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span className="go-kiosk-briefing-doc-label">{initialsLabel}</span>
            </div>

            <div className="go-kiosk-briefing-card-copy">
              <div className="go-kiosk-briefing-card-head">
                <h2 className="go-kiosk-briefing-card-title">{briefing.title}</h2>
                {pill ? <span className={pill.className}>{pill.label}</span> : null}
              </div>
              <p className="go-kiosk-briefing-card-desc">{briefing.description}</p>
              <ul className="go-kiosk-briefing-card-meta">
                <li>{formatBriefingPublishedLabel(briefing.publishedAt)}</li>
                {briefing.dueAt ? <li>Due {formatBriefingDate(briefing.dueAt)}</li> : null}
                <li>Est. time {readMinutes} min read</li>
                <li>{initialsLabel}</li>
              </ul>
            </div>

            <Link
              to={`${reviewBasePath}/${briefing.id}`}
              className="go-kiosk-briefing-card-btn"
              data-testid={`go-kiosk-briefing-review-${briefing.id}`}
            >
              Review Briefing
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
