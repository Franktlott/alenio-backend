import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlenioGoKioskDashboard } from "../components/alenio-go/AlenioGoKioskDashboard";
import { fetchPublicChecklistByToken, fetchPublicChecklistHub } from "../lib/api";
import { LocationChecklistKioskPage } from "./LocationChecklistKioskPage";

export function WorkspaceChecklistHubPage() {
  const { hubToken = "" } = useParams();
  const [legacyToken, setLegacyToken] = useState<string | null>(null);
  const [resolved, setResolved] = useState(!hubToken);

  useEffect(() => {
    if (!hubToken) return;
    let cancelled = false;
    setResolved(false);
    setLegacyToken(null);
    void fetchPublicChecklistHub(hubToken)
      .then(() => {
        if (!cancelled) setResolved(true);
      })
      .catch(async () => {
        if (cancelled) return;
        try {
          await fetchPublicChecklistByToken(hubToken);
          setLegacyToken(hubToken);
        } catch {
          /* kiosk dashboard shows not found */
        }
        setResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken]);

  if (legacyToken) {
    return <LocationChecklistKioskPage legacyToken={legacyToken} />;
  }

  if (!resolved) {
    return (
      <div className="go-dash go-dash--kiosk" data-testid="workspace-checklist-hub">
        <p className="go-dash-loading">Loading workspace…</p>
      </div>
    );
  }

  return <AlenioGoKioskDashboard hubToken={hubToken} />;
}
