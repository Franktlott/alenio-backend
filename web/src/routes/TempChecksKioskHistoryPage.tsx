import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { TempCheckHistoryDetail } from "../components/temp-checks/TempCheckHistoryDetail";
import { fetchGoTempCheckCompletion } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function TempChecksKioskHistoryPage() {
  const { hubToken = "", completionId = "" } = useParams();
  const [completion, setCompletion] = useState<Awaited<ReturnType<typeof fetchGoTempCheckCompletion>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/checklist/${hubToken}/temp-checks`;

  useEffect(() => {
    if (!hubToken || !completionId) return;
    setLoading(true);
    void fetchGoTempCheckCompletion(hubToken, getGoDeviceId(), completionId)
      .then(setCompletion)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setCompletion(null);
        setError(err instanceof Error ? err.message : "Could not load temp check record.");
      })
      .finally(() => setLoading(false));
  }, [hubToken, completionId]);

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--store go-walks-kiosk go-temp-checks-kiosk" data-testid="go-temp-checks-kiosk-history">
      <div className="go-briefings-kiosk-nav">
        <Link to={basePath} className="go-briefings-kiosk-back">
          ← Temp checks
        </Link>
      </div>

      <div className="go-briefings-kiosk-body">
        <header className="go-briefings-kiosk-intro">
          <h1>Temp check completed</h1>
          <p>Reading record saved to temp check history.</p>
        </header>

        {loading ? (
          <p className="go-dash-loading">Loading temp check record…</p>
        ) : !completion ? (
          <p className="go-dash-error" role="alert">
            {error || "Temp check record not found."}
          </p>
        ) : (
          <TempCheckHistoryDetail completion={completion} />
        )}
      </div>
    </div>
  );
}
