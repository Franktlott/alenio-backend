import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { FoodSafetyCalibrationFlow } from "../components/food-safety/FoodSafetyCalibrationFlow";
import { postGoHaccpProbeCalibration } from "../lib/food-safety-api";
import { getGoDeviceId } from "../lib/go-device";
import { loadGoLeaderSession } from "../lib/go-leader-session";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function FoodSafetyKioskCalibrationPage() {
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
      <FoodSafetyCalibrationFlow
        actorName={actorName}
        busy={busy}
        onSave={async (actualTempF) => {
          setBusy(true);
          try {
            return await postGoHaccpProbeCalibration(
              hubToken,
              getGoDeviceId(),
              actualTempF,
              actorName,
              session?.userId,
            );
          } catch (err) {
            if (handleGoDeviceSessionError(err)) throw err;
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
