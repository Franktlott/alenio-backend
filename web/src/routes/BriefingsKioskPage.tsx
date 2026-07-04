import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoDashKioskHeader } from "../components/alenio-go/go-dash-parts";
import { GoKioskBriefingsList } from "../components/briefings/GoKioskBriefingsList";
import { fetchGoBriefings, fetchPublicChecklistHub } from "../lib/api";
import { getGoDeviceId, saveGoLinkedWorkspace } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function BriefingsKioskPage() {
  const { hubToken = "" } = useParams();
  const [teamName, setTeamName] = useState("");
  const [briefings, setBriefings] = useState<Awaited<ReturnType<typeof fetchGoBriefings>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hubToken) {
      setError("Invalid workspace link.");
      setLoading(false);
      return;
    }
    const deviceId = getGoDeviceId();
    void fetchPublicChecklistHub(hubToken, deviceId)
      .then((data) => {
        setTeamName(data.team.name);
        saveGoLinkedWorkspace(hubToken, data.team.name);
      })
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setError("Workspace not found.");
      });

    void fetchGoBriefings(hubToken, deviceId)
      .then(setBriefings)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setBriefings([]);
      })
      .finally(() => setLoading(false));
  }, [hubToken]);

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--store" data-testid="go-briefings-kiosk">
      <div className="go-briefings-kiosk-nav">
        <Link to={`/checklist/${hubToken}`} className="go-briefings-kiosk-back">
          ← Dashboard
        </Link>
      </div>

      <GoDashKioskHeader teamName={teamName} />

      <div className="go-briefings-kiosk-body">
        <header className="go-briefings-kiosk-intro">
          <div className="go-briefings-kiosk-store-chip">
            <span className="go-briefings-kiosk-store-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            <div>
              <strong>{teamName || "Workspace"}</strong>
              <span>Execution Hub</span>
            </div>
          </div>

          <h1>Briefings</h1>
          <p>Stay informed. Review important updates and initial to confirm your understanding.</p>
        </header>

        {error ? (
          <p className="go-dash-error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="go-dash-loading">Loading briefings…</p>
        ) : (
          <GoKioskBriefingsList
            briefings={briefings}
            reviewBasePath={`/checklist/${hubToken}/briefings`}
          />
        )}
      </div>
    </div>
  );
}
