import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { FoodSafetyCoolingFlow } from "../components/food-safety/FoodSafetyCoolingFlow";
import { postGoHaccpCoolingLog } from "../lib/food-safety-api";
import { getGoDeviceId } from "../lib/go-device";
import { loadGoLeaderSession } from "../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function FoodSafetyKioskCoolingPage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const session = hubToken ? loadGoLeaderSession(hubToken) : null;
  const actorName = session?.name ?? "Associate";
  const basePath = `/checklist/${hubToken}/food-safety`;

  return (
    <div className="go-food-safety-kiosk-page">
      <Link to={basePath} className="fs-guided-exit">
        ← Food Safety
      </Link>
      <FoodSafetyCoolingFlow
        actorName={actorName}
        busy={busy}
        onCreate={async (payload) => {
          setBusy(true);
          try {
            await postGoHaccpCoolingLog(hubToken, getGoDeviceId(), {
              ...payload,
              createdByName: actorName,
            });
          } catch (err) {
            if (handleGoDeviceSessionError(err)) return;
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />
      <button type="button" className="fs-guided-secondary" onClick={() => navigate(basePath)}>
        Done
      </button>
    </div>
  );
}
