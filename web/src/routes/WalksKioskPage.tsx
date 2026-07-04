import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoDashKioskHeader } from "../components/alenio-go/go-dash-parts";
import { GoKioskWalksHistory, GoKioskWalksList } from "../components/walks/GoKioskWalksList";
import { fetchGoWalkCompletions, fetchGoWalkTemplates, fetchPublicChecklistHub } from "../lib/api";
import { getGoDeviceId, saveGoLinkedWorkspace } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

type Tab = "walks" | "history";

export function WalksKioskPage() {
  const { hubToken = "" } = useParams();
  const [tab, setTab] = useState<Tab>("walks");
  const [teamName, setTeamName] = useState("");
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof fetchGoWalkTemplates>>>([]);
  const [completions, setCompletions] = useState<Awaited<ReturnType<typeof fetchGoWalkCompletions>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/checklist/${hubToken}/walks`;

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
        saveGoLinkedWorkspace(hubToken, data.team.name, data.team.image);
      })
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setError("Workspace not found.");
      });

    void Promise.all([fetchGoWalkTemplates(hubToken, deviceId), fetchGoWalkCompletions(hubToken, deviceId)])
      .then(([walkRows, historyRows]) => {
        setTemplates(walkRows);
        setCompletions(historyRows);
      })
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setTemplates([]);
        setCompletions([]);
      })
      .finally(() => setLoading(false));
  }, [hubToken]);

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--store go-walks-kiosk" data-testid="go-walks-kiosk">
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
                <circle cx="12" cy="4" r="2" />
                <path d="M10 22V12l-2-3 4-2 4 2-2 3v10" />
              </svg>
            </span>
            <div>
              <strong>{teamName || "Workspace"}</strong>
              <span>Manager walks</span>
            </div>
          </div>

          <h1>Walks</h1>
          <p>Create structured observations, complete walks on the floor, and review saved history.</p>
        </header>

        <div className="go-kiosk-walks-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`go-kiosk-walks-tab${tab === "walks" ? " go-kiosk-walks-tab--active" : ""}`}
            onClick={() => setTab("walks")}
          >
            Walks ({templates.length})
          </button>
          <button
            type="button"
            role="tab"
            className={`go-kiosk-walks-tab${tab === "history" ? " go-kiosk-walks-tab--active" : ""}`}
            onClick={() => setTab("history")}
          >
            History ({completions.length})
          </button>
        </div>

        {error ? (
          <p className="go-dash-error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="go-dash-loading">Loading walks…</p>
        ) : tab === "walks" ? (
          <GoKioskWalksList templates={templates} basePath={basePath} />
        ) : (
          <GoKioskWalksHistory completions={completions} basePath={basePath} />
        )}
      </div>
    </div>
  );
}
