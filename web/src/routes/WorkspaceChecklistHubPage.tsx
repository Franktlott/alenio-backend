import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { KioskInstallBar } from "../components/checklists/kiosk/KioskInstallBar";
import { fetchPublicChecklistByToken, fetchPublicChecklistHub } from "../lib/api";
import { LocationChecklistKioskPage } from "./LocationChecklistKioskPage";

function useKioskClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function WorkspaceChecklistHubPage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
  const now = useKioskClock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [legacyToken, setLegacyToken] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<
    { id: string; name: string; taskCount: number; categories: (string | null)[] }[]
  >([]);

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

  if (legacyToken) {
    return <LocationChecklistKioskPage legacyToken={legacyToken} />;
  }

  return (
    <div className="kiosk-app-page" data-testid="workspace-checklist-hub">
      <div className="kiosk-app kiosk-app--hub">
        <header className="kiosk-app-header kiosk-hub-header">
          <div className="kiosk-app-header__top">
            <AlenioGoLogo variant="header" className="kiosk-app-header__go-logo" />
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
            <div className="kiosk-app-header__clock">
              <div className="kiosk-app-header__time">
                {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="kiosk-app-header__date">
                {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
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
            <ul className="kiosk-hub-list">
              {checklists.map((cl) => (
                <li key={cl.id}>
                  <Link
                    to={`/checklist/${hubToken}/${cl.id}`}
                    className="kiosk-hub-row"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/checklist/${hubToken}/${cl.id}`);
                    }}
                  >
                    <div className="kiosk-hub-row__main">
                      <span className="kiosk-hub-row__eyebrow">
                        {cl.categories.filter(Boolean)[0] ?? "Checklist"}
                      </span>
                      <h2 className="kiosk-hub-row__title">{cl.name}</h2>
                      <p className="kiosk-hub-row__meta">
                        {cl.taskCount} task{cl.taskCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="kiosk-hub-row__cta">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>

        <footer className="kiosk-hub-foot">Powered by Alenio Go · No account needed</footer>
      </div>
    </div>
  );
}
