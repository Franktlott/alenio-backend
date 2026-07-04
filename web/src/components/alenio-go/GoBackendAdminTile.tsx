import { Link } from "react-router-dom";
import type { GoBackendAdminTile as Tile } from "../../lib/alenio-go-backend";

function AdminTileIcon({ name }: { name: Tile["icon"] }) {
  if (name === "alerts") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  if (name === "devices") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  if (name === "frontend") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <circle cx="7" cy="6" r="1" />
        <circle cx="10" cy="6" r="1" />
      </svg>
    );
  }
  if (name === "checklists") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M5 6h.01M5 12h.01M5 18h.01" />
      </svg>
    );
  }
  if (name === "walks") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="4" r="2" />
        <path d="M10 22V12l-2-3 4-2 4 2-2 3v10" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function GoBackendAdminTile({ tile }: { tile: Tile }) {
  const isComingSoonModule = tile.href?.startsWith("/go/") && ["checklists", "walks"].includes(tile.id);

  const body = (
    <>
      {tile.badge != null && tile.badge > 0 ? (
        <span className="go-backend-tile-badge">{tile.badge}</span>
      ) : null}
      {isComingSoonModule ? (
        <span className="go-dash-card-soon">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Coming soon
        </span>
      ) : null}
      <div className="go-dash-card-icon">
        <AdminTileIcon name={tile.icon} />
      </div>
      <h2 className="go-dash-card-title">{tile.title}</h2>
      <p className="go-dash-card-sub">{tile.subtitle}</p>
      {tile.active && tile.href ? (
        <span className="go-dash-card-arrow" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      ) : null}
    </>
  );

  const className = `go-dash-module-card go-backend-tile go-dash-module-card--${tile.tone}${tile.active ? "" : " go-dash-module-card--inactive"}`;

  if (tile.active && tile.href?.startsWith("/go")) {
    return (
      <Link to={tile.href} className={className} data-testid={`go-backend-tile-${tile.id}`}>
        {body}
      </Link>
    );
  }

  if (tile.active && tile.href) {
    return (
      <a href={tile.href} className={className} data-testid={`go-backend-tile-${tile.id}`}>
        {body}
      </a>
    );
  }

  return (
    <div className={className} aria-disabled data-testid={`go-backend-tile-${tile.id}`}>
      {body}
    </div>
  );
}
