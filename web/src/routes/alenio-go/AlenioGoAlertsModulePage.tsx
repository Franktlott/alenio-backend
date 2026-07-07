import { Navigate } from "react-router-dom";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { WorkplaceAlertSoundSettings } from "../../components/alenio-go/WorkplaceAlertSoundSettings";
import { WorkplaceAlertPanel } from "../../components/WorkplaceAlertPanel";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoAlertsModulePage() {
  const { canManage, teamId } = useAlenioGoShell();

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  return (
    <GoBackendModuleShell
      title="Workplace alerts"
      subtitle="Choose your alert sound, push test alerts to linked floor devices, or notify everyone in this workspace."
      tone="indigo"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <WorkplaceAlertSoundSettings teamId={teamId} />
      </div>
      <div className="go-backend-module-panel go-backend-panel-card">
        <WorkplaceAlertPanel teamId={teamId} variant="module" />
      </div>
    </GoBackendModuleShell>
  );
}
