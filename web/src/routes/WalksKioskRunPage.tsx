import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoWalkLeaderStartFlow, type WalkStartLeader } from "../components/alenio-go/GoWalkLeaderStartFlow";
import { WalkRunPanel } from "../components/walks/WalkRunPanel";
import { fetchGoWalkTemplate, postGoWalkComplete } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { clearGoLeaderSession } from "../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function WalksKioskRunPage() {
  const { hubToken = "", walkId = "" } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof fetchGoWalkTemplate>> | null>(null);
  const [leader, setLeader] = useState<WalkStartLeader | null>(null);
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
    setLeader(null);
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
        ) : !leader ? (
          <GoWalkLeaderStartFlow
            hubToken={hubToken}
            template={template}
            onCancel={() => navigate(basePath)}
            onReady={setLeader}
          />
        ) : (
          <WalkRunPanel
            template={template}
            busy={busy}
            error={error}
            requireManagerName
            verifiedLeaderName={leader.name}
            onSignOutLeader={signOutLeader}
            onCancel={() => navigate(basePath)}
            onComplete={async (payload) => {
              setBusy(true);
              setError(null);
              try {
                const completion = await postGoWalkComplete(walkId, {
                  hubToken,
                  deviceId: getGoDeviceId(),
                  leaderUserId: leader.userId,
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
