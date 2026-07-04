import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { WalkHistoryDetail } from "../../components/walks/WalkHistoryDetail";
import { WalkRunPanel } from "../../components/walks/WalkRunPanel";
import { WalkTemplateForm } from "../../components/walks/WalkTemplateForm";
import { WalkWorkspace } from "../../components/walks/WalkWorkspace";
import {
  fetchTeamWalkCompletion,
  fetchTeamWalkTemplate,
  postTeamWalkComplete,
  postTeamWalkTemplate,
  patchTeamWalkTemplate,
} from "../../lib/api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function WalksHomePage() {
  const { teamId, canManage } = useAlenioGoShell();
  if (!teamId) return null;
  return <WalkWorkspace teamId={teamId} canManage={canManage} />;
}

function WalksDetailPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { walkId = "" } = useParams();
  if (!teamId) return null;
  return <WalkWorkspace teamId={teamId} canManage={canManage} initialWalkId={walkId} />;
}

function WalksHistoryDetailPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { completionId = "" } = useParams();
  if (!teamId) return null;
  return <WalkWorkspace teamId={teamId} canManage={canManage} initialCompletionId={completionId} />;
}

function WalksCreatePage() {
  const { teamId, canManage } = useAlenioGoShell();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <Navigate to="/go/walks" replace />;
  if (!teamId) return null;

  return (
    <GoBackendModuleShell
      title="Create walk"
      subtitle="Define observation items for structured manager walks on the floor."
      tone="violet"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <WalkTemplateForm
          busy={busy}
          error={error}
          onSubmit={async (payload) => {
            setBusy(true);
            setError(null);
            try {
              const created = await postTeamWalkTemplate(teamId, payload);
              navigate(`/go/walks/${created.id}/run`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create walk.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </GoBackendModuleShell>
  );
}

function WalksEditPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { walkId = "" } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<{
    name: string;
    workplace: string;
    scoringEnabled: boolean;
    items: { label: string }[];
  } | null>(null);

  const load = useCallback(() => {
    if (!teamId || !walkId) return;
    setLoading(true);
    void fetchTeamWalkTemplate(teamId, walkId)
      .then((data) => {
        setInitial({
          name: data.template.name,
          workplace: data.template.workplace,
          scoringEnabled: data.template.scoringEnabled,
          items: data.template.items.map((item) => ({ label: item.label })),
        });
      })
      .catch(() => setInitial(null))
      .finally(() => setLoading(false));
  }, [teamId, walkId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <Navigate to="/go/walks" replace />;
  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading walk…</p>;
  if (!initial) return <p className="enterprise-muted">Walk not found.</p>;

  return (
    <GoBackendModuleShell
      title="Edit walk"
      subtitle="Update observation items and scoring settings."
      tone="violet"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <WalkTemplateForm
          busy={busy}
          error={error}
          initial={initial}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            setBusy(true);
            setError(null);
            try {
              await patchTeamWalkTemplate(teamId, walkId, payload);
              navigate(`/go/walks/${walkId}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not update walk.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </GoBackendModuleShell>
  );
}

function WalksRunPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { walkId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<Awaited<ReturnType<typeof fetchTeamWalkTemplate>>["template"] | null>(
    null,
  );

  useEffect(() => {
    if (!teamId || !walkId) return;
    setLoading(true);
    void fetchTeamWalkTemplate(teamId, walkId)
      .then((data) => setTemplate(data.template))
      .catch(() => setTemplate(null))
      .finally(() => setLoading(false));
  }, [teamId, walkId]);

  if (!canManage) return <Navigate to="/go/walks" replace />;
  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading walk…</p>;
  if (!template) return <p className="enterprise-muted">Walk not found.</p>;

  return (
    <div className="walk-console walk-console--run">
      <WalkRunPanel
        template={template}
        busy={busy}
        error={error}
        onCancel={() => navigate(`/go/walks/${walkId}`)}
        onComplete={async (payload) => {
          setBusy(true);
          setError(null);
          try {
            const completion = await postTeamWalkComplete(teamId, walkId, payload);
            navigate(`/go/walks/history/${completion.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete walk.");
            throw err;
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function WalksHistoryStandalonePage() {
  const { teamId } = useAlenioGoShell();
  const { completionId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [completion, setCompletion] = useState<Awaited<ReturnType<typeof fetchTeamWalkCompletion>>["completion"] | null>(
    null,
  );

  useEffect(() => {
    if (!teamId || !completionId) return;
    setLoading(true);
    void fetchTeamWalkCompletion(teamId, completionId)
      .then((data) => setCompletion(data.completion))
      .catch(() => setCompletion(null))
      .finally(() => setLoading(false));
  }, [teamId, completionId]);

  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading walk history…</p>;
  if (!completion) return <Navigate to="/go/walks" replace />;

  return (
    <GoBackendModuleShell
      title="Walk completed"
      subtitle="Observation record saved to walk history."
      tone="violet"
    >
      <div className="go-backend-module-panel go-backend-panel-card">
        <WalkHistoryDetail completion={completion} />
      </div>
    </GoBackendModuleShell>
  );
}

export function AlenioGoWalksRoutes() {
  return (
    <Routes>
      <Route index element={<WalksHomePage />} />
      <Route path="new" element={<WalksCreatePage />} />
      <Route path="history/:completionId" element={<WalksHistoryStandalonePage />} />
      <Route path=":walkId/run" element={<WalksRunPage />} />
      <Route path=":walkId/edit" element={<WalksEditPage />} />
      <Route path=":walkId" element={<WalksDetailPage />} />
    </Routes>
  );
}
