import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { BriefingAdminPanel } from "../../components/briefings/BriefingAdminPanel";
import { BriefingCreateForm } from "../../components/briefings/BriefingCreateForm";
import { BriefingDueDateEditor } from "../../components/briefings/BriefingDueDateEditor";
import { BriefingWorkspace } from "../../components/briefings/BriefingWorkspace";
import {
  deleteBriefingCompletion,
  fetchBriefingAdminStats,
  postTeamBriefing,
} from "../../lib/api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function BriefingsHomePage() {
  const { teamId, teamName, canManage } = useAlenioGoShell();
  if (!teamId) return null;
  return <BriefingWorkspace teamId={teamId} teamName={teamName} canManage={canManage} />;
}

function BriefingsDetailPage() {
  const { teamId, teamName, canManage } = useAlenioGoShell();
  const { briefingId = "" } = useParams();
  if (!teamId) return null;
  return (
    <BriefingWorkspace
      teamId={teamId}
      teamName={teamName}
      canManage={canManage}
      initialBriefingId={briefingId}
    />
  );
}

function BriefingsCreatePage() {
  const { teamId, canManage } = useAlenioGoShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <Navigate to="/go/briefings" replace />;
  if (!teamId) return null;

  return (
    <GoBackendModuleShell
      title="Create briefing"
      subtitle="Upload a document and publish it to your workspace and linked floor devices."
      tone="amber"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <BriefingCreateForm
          busy={busy}
          error={error}
          onSubmit={async (payload) => {
            setBusy(true);
            setError(null);
            try {
              await postTeamBriefing(teamId, payload);
              window.location.href = "/go/briefings";
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not publish briefing.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </GoBackendModuleShell>
  );
}

function BriefingAdminPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { briefingId = "" } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchBriefingAdminStats>> | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!teamId || !briefingId) return;
    void fetchBriefingAdminStats(teamId, briefingId).then(setData).catch(() => setData(null));
  }, [teamId, briefingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <Navigate to="/go/briefings" replace />;
  if (!data) return <p className="enterprise-muted">Loading tracking…</p>;

  return (
    <GoBackendModuleShell
      title={`Tracking · ${data.briefing.title}`}
      subtitle="See who has signed this briefing with their name and initials."
      tone="amber"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <BriefingDueDateEditor
          teamId={teamId}
          briefingId={briefingId}
          dueAt={data.briefing.dueAt}
          signedCount={data.stats.signed}
          onSaved={(dueAt) => setData((prev) => (prev ? { ...prev, briefing: { ...prev.briefing, dueAt } } : prev))}
        />
        <BriefingAdminPanel
          stats={data.stats}
          busyKey={busyKey}
          onReset={async (completionId) => {
            if (!teamId) return;
            setBusyKey(completionId);
            try {
              await deleteBriefingCompletion(teamId, briefingId, completionId);
              load();
            } finally {
              setBusyKey(null);
            }
          }}
        />
      </div>
    </GoBackendModuleShell>
  );
}

export function AlenioGoBriefingsRoutes() {
  return (
    <Routes>
      <Route index element={<BriefingsHomePage />} />
      <Route path="new" element={<BriefingsCreatePage />} />
      <Route path=":briefingId/admin" element={<BriefingAdminPage />} />
      <Route path=":briefingId" element={<BriefingsDetailPage />} />
    </Routes>
  );
}
