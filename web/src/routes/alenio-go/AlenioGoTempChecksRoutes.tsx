import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { TemperatureProgramWorkspace } from "../../components/temperature-programs/TemperatureProgramWorkspace";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function TempChecksHomePage() {
  const { teamId, canManage } = useAlenioGoShell();
  if (!teamId) return null;
  return <TemperatureProgramWorkspace teamId={teamId} canManage={canManage} />;
}

function TempChecksDetailPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { programId = "" } = useParams();
  if (!teamId) return null;
  return <TemperatureProgramWorkspace teamId={teamId} canManage={canManage} initialProgramId={programId} />;
}

export function AlenioGoTempChecksRoutes() {
  return (
    <Routes>
      <Route index element={<TempChecksHomePage />} />
      <Route path=":programId" element={<TempChecksDetailPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
