import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoLeaderPinGate } from "../components/alenio-go/GoLeaderPinGate";
import { WalkRunPanel } from "../components/walks/WalkRunPanel";
import { fetchGoWalkTemplate, postGoWalkComplete } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import {
  clearGoLeaderSession,
  loadGoLeaderSession,
  type GoLeaderSession,
} from "../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function WalksKioskRunPage() {
  const { hubToken = "", walkId = "" } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof fetchGoWalkTemplate>> | null>(null);
  const [leaderSession, setLeaderSession] = useState<GoLeaderSession | null>(() =>
    hubToken ? loadGoLeaderSession(hubToken) : null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/checklist/${hubToken}/walks`;

  useEffect(() => {
    if (!hubToken || !walkId) return;
    setLoading(true);
    void fetchGoWalkTemplate(hubToken, getGoDeviceId(), walkId)
      .then(setTemplate)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setTemplate(null);
        setError(err instanceof Error ? err.message : "Could not load walk.");
      })
      .finally(() => setLoading(false));
  }, [hubToken, walkId]);

  function signOutLeader() {
    clearGoLeaderSession(hubToken);
    setLeaderSession(null);
  }

  return (
    <div className="go-briefings-kiosk go-walks-kiosk go-walks-kiosk--run" data-testid="go-walks-kiosk-run">
      <div className="go-briefings-kiosk-body">
        {loading ? (
          <p className="go-dash-loading">Loading walk…</p>
        ) : !template ? (
          <p className="go-dash-error" role="alert">
            {error || "Walk not found."}
          </p>
        ) : !leaderSession ? (
          <GoLeaderPinGate
            hubToken={hubToken}
            title="Sign in to start this walk"
            subtitle="Enter your Alenio Go PIN so this walk is recorded under your name."
            onCancel={() => navigate(basePath)}
            onVerified={setLeaderSession}
          />
        ) : (
          <WalkRunPanel
            template={template}
            busy={busy}
            error={error}
            requireManagerName
            verifiedLeaderName={leaderSession.name}
            onSignOutLeader={signOutLeader}
            onCancel={() => navigate(basePath)}
            onComplete={async (payload) => {
              setBusy(true);
              setError(null);
              try {
                const completion = await postGoWalkComplete(walkId, {
                  hubToken,
                  deviceId: getGoDeviceId(),
                  leaderUserId: leaderSession.userId,
                  ...payload,
                });
                navigate(`${basePath}/history/${completion.id}`);
              } catch (err) {
                if (handleGoDeviceSessionError(err)) return;
                setError(err instanceof Error ? err.message : "Could not complete walk.");
                throw err;
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
