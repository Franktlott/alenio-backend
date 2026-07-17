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
  if (name === "checklists") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (name === "briefings") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </svg>
    );
  }
  if (name === "walks") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="5" r="2" />
        <path d="M10 22l2-6 2 2 3 4M8 10l4 2 3-4" />
      </svg>
    );
  }
  if (name === "temp") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

export function GoBackendAdminTile({ tile }: { tile: Tile }) {
  const body = (
    <>
      {tile.badge != null && tile.badge > 0 ? (
        <span className="go-backend-tile-badge">{tile.badge}</span>
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
