import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchPublicChecklistByToken, fetchPublicChecklistHub } from "../lib/api";
import { LocationChecklistKioskPage } from "./LocationChecklistKioskPage";

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function WorkspaceChecklistHubPage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
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
      <div className="kiosk-app">
        <header className="kiosk-app-header">
          <div className="kiosk-app-header__row">
            <img src="/alenio-logo-white.png" alt="Alenio" className="kiosk-app-header__logo" width={108} height={26} />
            <div className="kiosk-app-header__date">{todayLabel()}</div>
          </div>
          <div className="kiosk-app-header__workspace">
            {teamImage ? (
              <img src={teamImage} alt="" className="kiosk-app-header__avatar" />
            ) : (
              <div className="kiosk-app-header__avatar kiosk-app-header__avatar--fallback" aria-hidden>
                {(teamName || "W").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="kiosk-app-header__meta">
              <p className="kiosk-app-header__team">{loading ? "Loading…" : teamName || "Workspace"}</p>
              <h1 className="kiosk-app-header__location">Today&apos;s Checklists</h1>
              <p className="kiosk-app-sub">Choose a checklist to sign off tasks. No login required.</p>
            </div>
          </div>
        </header>

        <main className="kiosk-app-main">
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
            <div className="kiosk-hub-tiles">
              {checklists.map((cl) => (
                <Link
                  key={cl.id}
                  to={`/checklist/${hubToken}/${cl.id}`}
                  className="kiosk-hub-tile"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/checklist/${hubToken}/${cl.id}`);
                  }}
                >
                  <span className="kiosk-hub-tile__eyebrow">
                    {cl.categories.filter(Boolean)[0] ?? "Checklist"}
                  </span>
                  <h2 className="kiosk-hub-tile__title">{cl.name}</h2>
                  <p className="kiosk-hub-tile__meta">
                    {cl.taskCount} task{cl.taskCount === 1 ? "" : "s"}
                  </p>
                  <span className="kiosk-hub-tile__cta">Open checklist →</span>
                </Link>
              ))}
            </div>
          )}
        </main>

        <footer className="kiosk-hub-foot">Powered by Alenio Enterprise · No account needed</footer>
      </div>
    </div>
  );
}
