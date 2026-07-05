import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { TempCheckBuilderPage } from "../../components/temp-checks/TempCheckBuilderPage";
import { TempCheckWorkspace } from "../../components/temp-checks/TempCheckWorkspace";
import {
  fetchTeamTempCheckTemplate,
  patchTeamTempCheckTemplate,
  postTeamTempCheckTemplate,
} from "../../lib/api";
import { formatTempCheckSaveError } from "../../lib/temp-checks-display";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function TempChecksHomePage() {
  const { teamId, canManage } = useAlenioGoShell();
  if (!teamId) return null;
  return <TempCheckWorkspace teamId={teamId} canManage={canManage} />;
}

function TempChecksDetailPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { templateId = "" } = useParams();
  if (!teamId) return null;
  return <TempCheckWorkspace teamId={teamId} canManage={canManage} initialTemplateId={templateId} />;
}

function TempChecksCreatePage() {
  const { teamId, canManage } = useAlenioGoShell();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <Navigate to="/go/temp-checks" replace />;
  if (!teamId) return null;

  return (
    <TempCheckBuilderPage
      pageTitle="Create temp check"
      pageSubtitle="Set the due time, check window, probe items, and corrective actions for this food safety check."
      busy={busy}
      error={error}
      onCancel={() => navigate("/go/temp-checks")}
      onSubmit={async (payload) => {
        setBusy(true);
        setError(null);
        try {
          const created = await postTeamTempCheckTemplate(teamId, payload);
          navigate(`/go/temp-checks/${created.id}`);
        } catch (err) {
          setError(formatTempCheckSaveError(err));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function TempChecksEditPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<{
    name: string;
    description: string;
    dueTimeLocal: string;
    windowStartLocal: string;
    windowEndLocal: string;
    items: {
      label: string;
      tempMinF: number | null;
      tempMaxF: number | null;
      correctiveActions: string[];
    }[];
    outOfWindowActions: string[];
  } | null>(null);

  const load = useCallback(() => {
    if (!teamId || !templateId) return;
    setLoading(true);
    void fetchTeamTempCheckTemplate(teamId, templateId)
      .then((data) => {
        setInitial({
          name: data.template.name,
          description: data.template.description ?? "",
          dueTimeLocal: data.template.dueTimeLocal,
          windowStartLocal: data.template.windowStartLocal,
          windowEndLocal: data.template.windowEndLocal,
          items: data.template.items.map((item) => ({
            label: item.label,
            tempMinF: item.tempMinF,
            tempMaxF: item.tempMaxF,
            correctiveActions: item.correctiveActions.map((action) => action.label),
          })),
          outOfWindowActions: data.template.outOfWindowActions.map((action) => action.label),
        });
      })
      .catch(() => setInitial(null))
      .finally(() => setLoading(false));
  }, [teamId, templateId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <Navigate to="/go/temp-checks" replace />;
  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading temp check…</p>;
  if (!initial) return <p className="enterprise-muted">Temp check not found.</p>;

  return (
    <TempCheckBuilderPage
      pageTitle="Edit temp check"
      pageSubtitle="Update schedule, items, temperature windows, and corrective actions."
      busy={busy}
      error={error}
      initial={initial}
      onCancel={() => navigate(`/go/temp-checks/${templateId}`)}
      onSubmit={async (payload) => {
        setBusy(true);
        setError(null);
        try {
          await patchTeamTempCheckTemplate(teamId, templateId, payload);
          navigate(`/go/temp-checks/${templateId}`);
        } catch (err) {
          setError(formatTempCheckSaveError(err));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

export function AlenioGoTempChecksRoutes() {
  return (
    <Routes>
      <Route index element={<TempChecksHomePage />} />
      <Route path="new" element={<TempChecksCreatePage />} />
      <Route path=":templateId/edit" element={<TempChecksEditPage />} />
      <Route path=":templateId" element={<TempChecksDetailPage />} />
    </Routes>
  );
}
