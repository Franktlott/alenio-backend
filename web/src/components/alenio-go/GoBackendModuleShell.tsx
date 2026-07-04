import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { GoBackendAdminTile } from "../../lib/alenio-go-backend";

type Props = {
  title: string;
  subtitle: string;
  tone: GoBackendAdminTile["tone"];
  toolbar?: ReactNode;
  children: ReactNode;
};

export function GoBackendModuleShell({ title, subtitle, tone, toolbar, children }: Props) {
  return (
    <div className={`go-backend go-backend--module go-backend-module--${tone}`} data-testid="go-backend-module">
      <header className={`go-backend-module-hero go-backend-module-hero--${tone}`}>
        <Link to="/go" className="go-backend-module-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Alenio Go console
        </Link>
        <div className="go-backend-module-hero-copy">
          <p className="go-backend-module-kicker">Admin module</p>
          <h1 className="go-backend-module-title">{title}</h1>
          <p className="go-backend-module-sub">{subtitle}</p>
        </div>
      </header>
      {toolbar ? <div className="go-backend-module-toolbar">{toolbar}</div> : null}
      <div className="go-backend-scroll">
        <div className="go-backend-module-body">{children}</div>
      </div>
    </div>
  );
}
