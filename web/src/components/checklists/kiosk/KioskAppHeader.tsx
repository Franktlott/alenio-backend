import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

function useKioskClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

type Props = {
  teamName: string;
  checklistName?: string;
  hubTitle?: string;
  signedCount?: number;
  totalCount?: number;
  loading?: boolean;
  backHref?: string;
  backLabel?: string;
  variant?: "checklist" | "hub";
};

export function KioskAppHeader({
  teamName,
  checklistName,
  hubTitle = "Today's checklists",
  signedCount = 0,
  totalCount = 0,
  loading = false,
  backHref,
  backLabel = "All checklists",
  variant = "checklist",
}: Props) {
  const now = useKioskClock();
  const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const workspaceName = loading ? "…" : teamName || "Workspace";
  const progressPct = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : 0;
  const showProgress = variant === "checklist" && totalCount > 0 && !loading;

  return (
    <header className={`kiosk-app-header kiosk-app-header--${variant}`}>
      <div className="kiosk-app-header__bar">
        {backHref ? (
          <Link to={backHref} className="kiosk-app-header__back">
            ← {backLabel}
          </Link>
        ) : (
          <span className="kiosk-app-header__back-spacer" aria-hidden />
        )}
        <p className="kiosk-app-header__time" aria-label="Current time">
          {timeLabel}
        </p>
      </div>

      <p className="kiosk-app-header__context">
        Alenio Go · {workspaceName}
      </p>

      <h1 className="kiosk-app-header__checklist-name">
        {loading ? "Loading…" : variant === "hub" ? hubTitle : checklistName || "Checklist"}
      </h1>

      {showProgress ? (
        <div className="kiosk-app-header__progress" aria-label="Checklist progress">
          <div className="kiosk-app-header__progress-row">
            <span>
              {signedCount} of {totalCount} complete
            </span>
            <span>{progressPct}%</span>
          </div>
          <div
            className="kiosk-app-header__progress-bar"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
