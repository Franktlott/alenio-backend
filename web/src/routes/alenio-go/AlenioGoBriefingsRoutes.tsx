import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { BriefingAdminPanel } from "../../components/briefings/BriefingAdminPanel";
import { BriefingCreateForm } from "../../components/briefings/BriefingCreateForm";
import { BriefingList } from "../../components/briefings/BriefingList";
import { BriefingReviewPanel } from "../../components/briefings/BriefingReviewPanel";
import {
  deleteBriefingCompletion,
  fetchBriefingAdminStats,
  fetchTeamBriefing,
  fetchTeamBriefings,
  postBriefingComplete,
  postTeamBriefing,
} from "../../lib/api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function BriefingsListPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const [briefings, setBriefings] = useState<Awaited<ReturnType<typeof fetchTeamBriefings>>["briefings"]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void fetchTeamBriefings(teamId)
      .then((data) => setBriefings(data.briefings))
      .catch(() => setBriefings([]))
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <GoBackendModuleShell
      title="Briefings"
      subtitle="Publish documents for your team to review and initial on the floor or in Alenio Go."
      tone="amber"
    >
      <div className="go-backend-module-panel go-backend-panel-card briefing-module-panel">
        {canManage ? (
          <div className="briefing-module-toolbar">
            <Link to="/go/briefings/new" className="enterprise-alenio-go-link-btn">
              Create briefing
            </Link>
          </div>
        ) : null}
        {loading ? (
          <p className="enterprise-muted">Loading briefings…</p>
        ) : (
          <BriefingList
            briefings={briefings}
            canManage={canManage}
            reviewBasePath="/go/briefings"
            adminBasePath="/go/briefings"
          />
        )}
      </div>
    </GoBackendModuleShell>
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

function BriefingReviewPage() {
  const { teamId } = useAlenioGoShell();
  const { briefingId = "" } = useParams();
  const [briefing, setBriefing] = useState<Awaited<ReturnType<typeof fetchTeamBriefing>>["briefing"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId || !briefingId) return;
    void fetchTeamBriefing(teamId, briefingId)
      .then((data) => setBriefing(data.briefing))
      .catch(() => setBriefing(null));
  }, [teamId, briefingId]);

  if (!teamId) return null;
  if (!briefing) return <p className="enterprise-muted">Loading briefing…</p>;

  return (
    <GoBackendModuleShell title={briefing.title} subtitle="Review the document and initial to complete." tone="amber">
      <div className="go-backend-module-panel go-backend-panel-card">
        <BriefingReviewPanel
          briefing={briefing}
          busy={busy}
          error={error}
          onComplete={async (payload) => {
            setBusy(true);
            setError(null);
            try {
              await postBriefingComplete(teamId, briefing.id, payload);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not complete briefing.");
              throw err;
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
      <Route index element={<BriefingsListPage />} />
      <Route path="new" element={<BriefingsCreatePage />} />
      <Route path=":briefingId/admin" element={<BriefingAdminPage />} />
      <Route path=":briefingId" element={<BriefingReviewPage />} />
    </Routes>
  );
}
