import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { WalkHistoryDetail } from "../components/walks/WalkHistoryDetail";
import { fetchGoWalkCompletion } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function WalksKioskHistoryPage() {
  const { hubToken = "", completionId = "" } = useParams();
  const [completion, setCompletion] = useState<Awaited<ReturnType<typeof fetchGoWalkCompletion>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/checklist/${hubToken}/walks`;

  useEffect(() => {
    if (!hubToken || !completionId) return;
    setLoading(true);
    void fetchGoWalkCompletion(hubToken, getGoDeviceId(), completionId)
      .then(setCompletion)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setCompletion(null);
        setError(err instanceof Error ? err.message : "Could not load walk record.");
      })
      .finally(() => setLoading(false));
  }, [hubToken, completionId]);

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--store go-walks-kiosk" data-testid="go-walks-kiosk-history">
      <div className="go-briefings-kiosk-nav">
        <Link to={basePath} className="go-briefings-kiosk-back">
          ← Walks
        </Link>
      </div>

      <div className="go-briefings-kiosk-body">
        <header className="go-briefings-kiosk-intro">
          <h1>Walk completed</h1>
          <p>Observation record saved to walk history.</p>
        </header>

        {loading ? (
          <p className="go-dash-loading">Loading walk record…</p>
        ) : !completion ? (
          <p className="go-dash-error" role="alert">
            {error || "Walk record not found."}
          </p>
        ) : (
          <WalkHistoryDetail completion={completion} />
        )}
      </div>
    </div>
  );
}
