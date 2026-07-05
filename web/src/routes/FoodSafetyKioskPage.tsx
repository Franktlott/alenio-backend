import { useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { FoodSafetyDashboardPanel } from "../components/food-safety/FoodSafetyDashboardPanel";
import { fetchGoFoodSafetyDashboard } from "../lib/food-safety-api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function FoodSafetyKioskPage() {
  const { hubToken = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchGoFoodSafetyDashboard>> | null>(null);
  const basePath = `/checklist/${hubToken}/food-safety`;

  const load = useCallback(() => {
    if (!hubToken) return;
    setLoading(true);
    void fetchGoFoodSafetyDashboard(hubToken, getGoDeviceId())
      .then(setDashboard)
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setDashboard(null);
      })
      .finally(() => setLoading(false));
  }, [hubToken]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="go-briefings-kiosk go-walks-kiosk go-food-safety-kiosk" data-testid="go-food-safety-kiosk">
      <div className="go-briefings-kiosk-body">
        {loading ? (
          <p className="go-dash-loading">Loading food safety hub…</p>
        ) : !dashboard ? (
          <p className="go-dash-error">Could not load food safety. Ask a leader to set up templates in Alenio Go.</p>
        ) : (
          <FoodSafetyDashboardPanel
            dashboard={dashboard}
            basePath={basePath}
            onStartCheck={(templateId) => navigate(`${basePath}/run/${templateId}`)}
          />
        )}
      </div>
    </div>
  );
}
