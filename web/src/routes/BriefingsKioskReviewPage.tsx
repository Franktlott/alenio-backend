import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { BriefingReviewPanel } from "../components/briefings/BriefingReviewPanel";
import { GoBriefingLoadingOverlay } from "../components/briefings/GoBriefingLoadingOverlay";
import { fetchGoBriefing, goBriefingDocumentPath, postGoBriefingComplete } from "../lib/api";
import { waitForBriefingLoadingMin } from "../lib/briefing-loading";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function BriefingsKioskReviewPage() {
  const { hubToken = "", briefingId = "" } = useParams();
  const [briefing, setBriefing] = useState<Awaited<ReturnType<typeof fetchGoBriefing>> | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(true);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayStartedAtRef = useRef(Date.now());

  useEffect(() => {
    overlayStartedAtRef.current = Date.now();
    setPageLoading(true);
    setDocLoading(true);
    setOverlayVisible(true);
    setBriefing(null);
    setLoadError(null);
  }, [hubToken, briefingId]);

  useEffect(() => {
    if (!hubToken || !briefingId) return;
    let cancelled = false;
    setPageLoading(true);
    setLoadError(null);
    void fetchGoBriefing(hubToken, getGoDeviceId(), briefingId)
      .then((row) => {
        if (cancelled) return;
        setBriefing(row);
        setLoadError(null);
        setPageLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBriefing(null);
        setPageLoading(false);
        setDocLoading(false);
        setOverlayVisible(false);
        if (handleGoDeviceSessionError(err)) return;
        setLoadError(err instanceof Error ? err.message : "Could not load this briefing.");
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken, briefingId]);

  useEffect(() => {
    if (loadError) return;
    if (pageLoading || docLoading) {
      setOverlayVisible(true);
      return;
    }
    let cancelled = false;
    void waitForBriefingLoadingMin(overlayStartedAtRef.current).then(() => {
      if (!cancelled) setOverlayVisible(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pageLoading, docLoading, loadError]);

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--review" data-testid="go-briefing-review">
      {overlayVisible ? <GoBriefingLoadingOverlay /> : null}

      {loadError ? (
        <div className="go-briefing-review-error">
          <p className="go-dash-error" role="alert">
            {loadError}
          </p>
          <Link to={`/checklist/${hubToken}/briefings`} className="go-briefings-kiosk-back">
            ← Briefings
          </Link>
        </div>
      ) : briefing ? (
        <>
          <header className="go-briefings-kiosk-head">
            <Link to={`/checklist/${hubToken}/briefings`} className="go-briefings-kiosk-back">
              ← Briefings
            </Link>
          </header>
          <BriefingReviewPanel
            briefing={briefing}
            documentFetchPath={goBriefingDocumentPath(hubToken, getGoDeviceId(), briefingId)}
            alenioLoading
            onDocumentLoadingChange={setDocLoading}
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
        </>
      ) : null}
    </div>
  );
}
