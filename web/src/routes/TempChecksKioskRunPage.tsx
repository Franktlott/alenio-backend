import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoTempCheckLeaderStartFlow, type TempCheckStartLeader } from "../components/alenio-go/GoTempCheckLeaderStartFlow";
import { TempCheckRunPanel } from "../components/temp-checks/TempCheckRunPanel";
import { fetchGoTempCheckTemplate, postGoTempCheckComplete } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { clearGoLeaderSession } from "../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../lib/go-session";
import { getKioskTimeZone } from "../lib/temp-checks-display";

export function TempChecksKioskRunPage() {
  const { hubToken = "", templateId = "" } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof fetchGoTempCheckTemplate>> | null>(null);
  const [leader, setLeader] = useState<TempCheckStartLeader | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/checklist/${hubToken}/temp-checks`;

  useEffect(() => {
    if (!hubToken || !templateId) return;
    setLoading(true);
    void fetchGoTempCheckTemplate(hubToken, getGoDeviceId(), templateId, getKioskTimeZone())
      .then(setTemplate)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setTemplate(null);
        setError(err instanceof Error ? err.message : "Could not load temp check.");
      })
      .finally(() => setLoading(false));
  }, [hubToken, templateId]);

  function signOutLeader() {
    clearGoLeaderSession(hubToken);
    setLeader(null);
  }

  return (
    <div className="go-briefings-kiosk go-walks-kiosk go-walks-kiosk--run go-temp-checks-kiosk go-temp-checks-kiosk--run" data-testid="go-temp-checks-kiosk-run">
      <div className="go-briefings-kiosk-body">
        {loading ? (
          <p className="go-dash-loading">Loading temp check…</p>
        ) : !template ? (
          <p className="go-dash-error" role="alert">
            {error || "Temp check not found."}
          </p>
        ) : !leader ? (
          <GoTempCheckLeaderStartFlow
            hubToken={hubToken}
            template={template}
            onCancel={() => navigate(basePath)}
            onReady={setLeader}
          />
        ) : (
          <TempCheckRunPanel
            template={template}
            busy={busy}
            error={error}
            verifiedLeaderName={leader.name}
            onSignOutLeader={signOutLeader}
            onCancel={() => navigate(basePath)}
            onComplete={async (payload) => {
              setBusy(true);
              setError(null);
              try {
                const completion = await postGoTempCheckComplete(templateId, {
                  hubToken,
                  deviceId: getGoDeviceId(),
                  leaderUserId: leader.userId,
                  timeZone: getKioskTimeZone(),
                  ...payload,
                });
                navigate(`${basePath}/history/${completion.id}`);
              } catch (err) {
                if (handleGoDeviceSessionError(err)) return;
                setError(err instanceof Error ? err.message : "Could not complete temp check.");
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
