import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { BriefingList } from "../components/briefings/BriefingList";
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
    <div className="go-briefings-kiosk" data-testid="go-briefings-kiosk">
      <header className="go-briefings-kiosk-head">
        <Link to={`/checklist/${hubToken}`} className="go-briefings-kiosk-back">
          ← Dashboard
        </Link>
        <AlenioGoLogo variant="header" className="go-briefings-kiosk-logo" />
        <h1>Briefings</h1>
        <p>{teamName ? `Review and initial briefings for ${teamName}.` : "Review workplace briefings."}</p>
      </header>

      {error ? (
        <p className="go-dash-error" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="go-dash-loading">Loading briefings…</p>
      ) : (
        <BriefingList
          briefings={briefings}
          reviewBasePath={`/checklist/${hubToken}/briefings`}
          kiosk
        />
      )}
    </div>
  );
}
