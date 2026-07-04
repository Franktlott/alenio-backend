import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { WalkTemplateForm } from "../components/walks/WalkTemplateForm";
import { postGoWalkTemplate } from "../lib/api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function WalksKioskCreatePage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/checklist/${hubToken}/walks`;

  return (
    <div className="go-briefings-kiosk go-briefings-kiosk--store go-walks-kiosk" data-testid="go-walks-kiosk-create">
      <div className="go-briefings-kiosk-nav">
        <Link to={basePath} className="go-briefings-kiosk-back">
          ← Walks
        </Link>
      </div>

      <div className="go-briefings-kiosk-body">
        <header className="go-briefings-kiosk-intro">
          <h1>Create walk</h1>
          <p>Define observation items for a structured manager walk on the floor.</p>
        </header>

        <div className="go-kiosk-walks-form-panel">
          <WalkTemplateForm
            busy={busy}
            error={error}
            submitLabel="Create & start walk"
            onSubmit={async (payload) => {
              setBusy(true);
              setError(null);
              try {
                const created = await postGoWalkTemplate({
                  hubToken,
                  deviceId: getGoDeviceId(),
                  ...payload,
                });
                navigate(`${basePath}/${created.id}/run`);
              } catch (err) {
                if (handleGoDeviceSessionError(err)) return;
                setError(err instanceof Error ? err.message : "Could not create walk.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
