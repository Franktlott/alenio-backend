import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { KioskInstallBar } from "../components/checklists/kiosk/KioskInstallBar";
import { fetchPublicChecklistByToken, fetchPublicChecklistHub } from "../lib/api";
import { checklistCardColorStyles } from "../lib/checklist-card-colors";
import { kioskProgressPercent, loadKioskProgress } from "../lib/kiosk-checklist-progress";
import { LocationChecklistKioskPage } from "./LocationChecklistKioskPage";

function useKioskClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

type HubChecklist = { id: string; name: string; cardColor: string | null; taskCount: number; categories: (string | null)[] };

export function WorkspaceChecklistHubPage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
  const now = useKioskClock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacyToken, setLegacyToken] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<HubChecklist[]>([]);
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("alenio.kioskProgress:")) setProgressTick((n) => n + 1);
    };
    const refresh = () => setProgressTick((n) => n + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!hubToken) {
      setError("Invalid checklist link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLegacyToken(null);
    void fetchPublicChecklistHub(hubToken)
      .then((data) => {
        if (cancelled) return;
        setTeamName(data.team.name);
        setTeamImage(data.team.image);
        setChecklists(data.checklists);
        setProgressTick((n) => n + 1);
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          await fetchPublicChecklistByToken(hubToken);
          setLegacyToken(hubToken);
        } catch {
          setError("Checklist page not found.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken]);

  const tiles = useMemo(() => {
    void progressTick;
    return checklists.map((cl) => {
      const stored = loadKioskProgress(hubToken, cl.id);
      const percentComplete = kioskProgressPercent(stored, cl.taskCount);
      return { ...cl, percentComplete };
    });
  }, [checklists, hubToken, progressTick]);

  if (legacyToken) {
    return <LocationChecklistKioskPage legacyToken={legacyToken} />;
  }

  const clockLabel = `${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  return (
    <div className="kiosk-app-page" data-testid="workspace-checklist-hub">
      <div className="kiosk-app kiosk-app--hub">
        <header className="kiosk-app-header kiosk-hub-header">
          <div className="kiosk-app-header__brand-row">
            <AlenioGoLogo variant="page" className="kiosk-app-header__go-logo kiosk-app-header__go-logo--page" />
            <div className="kiosk-app-header__meta">
              <p className="kiosk-app-header__clock kiosk-app-header__clock--compact" aria-label="Current date and time">
                {clockLabel}
              </p>
              <div className="kiosk-app-header__workspace-pill">
                {teamImage ? (
                  <img src={teamImage} alt="" className="kiosk-app-header__pill-avatar" />
                ) : (
                  <span className="kiosk-app-header__pill-fallback" aria-hidden>
                    {(teamName || "W").charAt(0).toUpperCase()}
                  </span>
                )}
                <span>{loading ? "…" : teamName || "Workspace"}</span>
              </div>
            </div>
          </div>
          <h1 className="kiosk-app-header__title">Today&apos;s Checklists</h1>
          <p className="kiosk-app-header__subtitle">Choose a checklist to sign off tasks. No login required.</p>
        </header>

        <main className="kiosk-app-main kiosk-hub-main">
          {!loading && !error ? <KioskInstallBar teamName={teamName || undefined} /> : null}
          {loading ? (
            <p className="kiosk-app-loading">Loading checklists…</p>
          ) : error ? (
            <p className="kiosk-app-error" role="alert">
              {error}
            </p>
          ) : checklists.length === 0 ? (
            <div className="kiosk-hub-empty">
              <p className="kiosk-hub-empty__title">No checklists yet</p>
              <p className="kiosk-app-empty">Your manager can add checklists from the workspace dashboard.</p>
            </div>
          ) : (
            <ul className="kiosk-hub-tiles">
              {tiles.map((cl) => {
                const cardStyle = checklistCardColorStyles(cl.cardColor);
                return (
                <li key={cl.id}>
                  <Link
                    to={`/checklist/${hubToken}/${cl.id}`}
                    className="kiosk-hub-tile"
                    style={{
                      background: cardStyle.background,
                      borderColor: cardStyle.borderColor,
                      boxShadow: `inset 4px 0 0 ${cardStyle.accent}`,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/checklist/${hubToken}/${cl.id}`);
                    }}
                  >
                    <h2 className="kiosk-hub-tile__title">{cl.name}</h2>
                    <p className="kiosk-hub-tile__meta">
                      {cl.taskCount} task{cl.taskCount === 1 ? "" : "s"}
                    </p>
                    <div className="kiosk-hub-tile__progress-wrap">
                      <div className="kiosk-hub-tile__progress-head">
                        <span className="kiosk-hub-tile__progress-label">Progress</span>
                        <span className="kiosk-hub-tile__progress-pct">{cl.percentComplete}%</span>
                      </div>
                      <div
                        className="kiosk-hub-tile__progress-bar"
                        role="progressbar"
                        aria-valuenow={cl.percentComplete}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${cl.name} progress`}
                      >
                        <span style={{ width: `${cl.percentComplete}%`, background: cardStyle.accent }} />
                      </div>
                    </div>
                    <span className="kiosk-hub-tile__cta" style={{ color: cardStyle.accent }}>
                      Open checklist →
                    </span>
                  </Link>
                </li>
                );
              })}
            </ul>
          )}
        </main>

        <footer className="kiosk-hub-foot">Powered by Alenio Go · No account needed</footer>
      </div>
    </div>
  );
}
