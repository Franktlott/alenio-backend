import { useParams } from "react-router-dom";
import { AlenioGoKioskDashboard } from "../components/alenio-go/AlenioGoKioskDashboard";

export function WorkspaceChecklistHubPage() {
  const { hubToken = "" } = useParams();
  return <AlenioGoKioskDashboard hubToken={hubToken} />;
}
