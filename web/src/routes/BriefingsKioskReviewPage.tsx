import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { BriefingReviewPanel } from "../components/briefings/BriefingReviewPanel";
import { fetchGoBriefing, goBriefingDocumentPath, postGoBriefingComplete } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function BriefingsKioskReviewPage() {
  const { hubToken = "", briefingId = "" } = useParams();
  const [briefing, setBriefing] = useState<Awaited<ReturnType<typeof fetchGoBriefing>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hubToken || !briefingId) return;
    setLoadError(null);
    void fetchGoBriefing(hubToken, getGoDeviceId(), briefingId)
      .then((row) => {
        setBriefing(row);
        setLoadError(null);
      })
      .catch((err) => {
        setBriefing(null);
        if (handleGoDeviceSessionError(err)) return;
        setLoadError(err instanceof Error ? err.message : "Could not load this briefing.");
      });
  }, [hubToken, briefingId]);

  if (loadError) {
    return (
      <div className="go-briefings-kiosk go-briefings-kiosk--review">
        <p className="go-dash-error" role="alert">
          {loadError}
        </p>
        <Link to={`/checklist/${hubToken}/briefings`} className="go-briefings-kiosk-back">
          ← Briefings
        </Link>
      </div>
    );
  }

  if (!briefing) return <p className="go-dash-loading">Loading briefing…</p>;

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--review" data-testid="go-briefing-review">
      <header className="go-briefings-kiosk-head">
        <Link to={`/checklist/${hubToken}/briefings`} className="go-briefings-kiosk-back">
          ← Briefings
        </Link>
      </header>
      <BriefingReviewPanel
        briefing={briefing}
        documentFetchPath={goBriefingDocumentPath(hubToken, getGoDeviceId(), briefingId)}
        busy={busy}
        error={error}
        onComplete={async (payload) => {
          setBusy(true);
          setError(null);
          try {
            await postGoBriefingComplete(briefingId, {
              hubToken,
              deviceId: getGoDeviceId(),
              initials: payload.initials,
              signatureData: payload.signatureData,
              reviewerName: payload.reviewerName,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete briefing.");
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
