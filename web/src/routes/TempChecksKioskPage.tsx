import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoDashKioskHeader } from "../components/alenio-go/go-dash-parts";
import { GoKioskTempChecksHistory, GoKioskTempChecksList } from "../components/temp-checks/GoKioskTempChecksList";
import { fetchGoTempCheckCompletions, fetchGoTempCheckTemplates, fetchPublicChecklistHub } from "../lib/api";
import { getGoDeviceId, saveGoLinkedWorkspace } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";
import { getKioskTimeZone } from "../lib/temp-checks-display";

type Tab = "programs" | "history";

export function TempChecksKioskPage() {
  const { hubToken = "" } = useParams();
  const [tab, setTab] = useState<Tab>("programs");
  const [teamName, setTeamName] = useState("");
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof fetchGoTempCheckTemplates>>>([]);
  const [completions, setCompletions] = useState<Awaited<ReturnType<typeof fetchGoTempCheckCompletions>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/checklist/${hubToken}/temp-checks`;

  useEffect(() => {
    if (!hubToken) {
      setError("Invalid workspace link.");
      setLoading(false);
      return;
    }
    const deviceId = getGoDeviceId();
    const timeZone = getKioskTimeZone();
    void fetchPublicChecklistHub(hubToken, deviceId)
      .then((data) => {
        setTeamName(data.team.name);
        saveGoLinkedWorkspace(hubToken, data.team.name, data.team.image);
      })
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setError("Workspace not found.");
      });

    void Promise.all([
      fetchGoTempCheckTemplates(hubToken, deviceId, timeZone),
      fetchGoTempCheckCompletions(hubToken, deviceId),
    ])
      .then(([programRows, historyRows]) => {
        setTemplates(programRows);
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
    <div className="go-briefings-kiosk go-briefings-kiosk--store go-walks-kiosk go-temp-checks-kiosk" data-testid="go-temp-checks-kiosk">
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
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
            </span>
            <div>
              <strong>{teamName || "Workspace"}</strong>
              <span>Temperature programs</span>
            </div>
          </div>

          <h1>Temp checks</h1>
          <p>Complete scheduled temperature readings on the floor. Leaders sign in with their PIN before each check.</p>
        </header>

        <div className="go-kiosk-walks-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`go-kiosk-walks-tab${tab === "programs" ? " go-kiosk-walks-tab--active" : ""}`}
            onClick={() => setTab("programs")}
          >
            Programs ({templates.length})
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
          <p className="go-dash-loading">Loading temp checks…</p>
        ) : tab === "programs" ? (
          <GoKioskTempChecksList templates={templates} basePath={basePath} />
        ) : (
          <GoKioskTempChecksHistory completions={completions} basePath={basePath} />
        )}
      </div>
    </div>
  );
}
