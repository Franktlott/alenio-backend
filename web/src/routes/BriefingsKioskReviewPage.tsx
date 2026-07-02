import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { BriefingReviewPanel } from "../components/briefings/BriefingReviewPanel";
import { fetchGoBriefing, postGoBriefingComplete } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";

export function BriefingsKioskReviewPage() {
  const { hubToken = "", briefingId = "" } = useParams();
  const [briefing, setBriefing] = useState<Awaited<ReturnType<typeof fetchGoBriefing>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hubToken || !briefingId) return;
    void fetchGoBriefing(hubToken, getGoDeviceId(), briefingId)
      .then(setBriefing)
      .catch(() => setBriefing(null));
  }, [hubToken, briefingId]);

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
        busy={busy}
        error={error}
        kioskMode
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
            setBriefing({ ...briefing, status: "reviewed", completedAt: new Date().toISOString() });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete briefing.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
