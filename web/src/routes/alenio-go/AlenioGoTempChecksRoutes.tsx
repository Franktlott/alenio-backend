import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { TempCheckBuilderPage } from "../../components/temp-checks/TempCheckBuilderPage";
import { TempCheckEquipmentBuilderPage } from "../../components/temp-checks/TempCheckEquipmentBuilderPage";
import { TempCheckWorkspace } from "../../components/temp-checks/TempCheckWorkspace";
import {
  fetchTeamTempCheckEquipmentItem,
  fetchTeamTempCheckTemplate,
  patchTeamTempCheckEquipment,
  patchTeamTempCheckTemplate,
  postTeamTempCheckEquipment,
  postTeamTempCheckTemplate,
} from "../../lib/api";
import { formatTempCheckSaveError } from "../../lib/temp-checks-display";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function TempChecksWorkspaceLayout() {
  const { teamId, canManage } = useAlenioGoShell();
  const { templateId, equipmentId } = useParams();
  if (!teamId) return null;
  return (
    <TempCheckWorkspace
      teamId={teamId}
      canManage={canManage}
      initialTemplateId={templateId}
      initialEquipmentId={equipmentId}
    />
  );
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
      teamId={teamId}
      pageTitle="Create temp check"
      pageSubtitle="Set the schedule window, probe items, temperature ranges, and corrective actions when readings are out of range."
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
      equipmentId: string | null;
      label: string;
      tempMinF: number | null;
      tempMaxF: number | null;
      correctiveActions: string[];
    }[];
  } | null>(null);
  const [publishedLocked, setPublishedLocked] = useState(false);

  const load = useCallback(() => {
    if (!teamId || !templateId) return;
    setLoading(true);
    void fetchTeamTempCheckTemplate(teamId, templateId)
      .then((data) => {
        if (data.template.isPublished !== false) {
          setPublishedLocked(true);
          setInitial(null);
          return;
        }
        setPublishedLocked(false);
        setInitial({
          name: data.template.name,
          description: data.template.description ?? "",
          dueTimeLocal: data.template.dueTimeLocal,
          windowStartLocal: data.template.windowStartLocal,
          windowEndLocal: data.template.windowEndLocal,
          items: data.template.items.map((item) => ({
            equipmentId: item.equipmentId,
            label: item.label,
            tempMinF: item.tempMinF,
            tempMaxF: item.tempMaxF,
            correctiveActions: item.correctiveActions.map((action) => action.label),
          })),
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
  if (publishedLocked) return <Navigate to={`/go/temp-checks/${templateId}`} replace />;
  if (!initial) return <p className="enterprise-muted">Temp check not found.</p>;

  return (
    <TempCheckBuilderPage
      teamId={teamId}
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

function TempChecksEquipmentCreatePage() {
  const { teamId, canManage } = useAlenioGoShell();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return <Navigate to="/go/temp-checks" replace />;
  if (!teamId) return null;

  return (
    <TempCheckEquipmentBuilderPage
      pageTitle="Add equipment standard"
      pageSubtitle="Set the temperature range and corrective action steps leaders follow when this equipment is out of range."
      busy={busy}
      error={error}
      onCancel={() => navigate("/go/temp-checks")}
      onSubmit={async (payload) => {
        setBusy(true);
        setError(null);
        try {
          const created = await postTeamTempCheckEquipment(teamId, payload);
          navigate(`/go/temp-checks/equipment/${created.id}`);
        } catch (err) {
          setError(formatTempCheckSaveError(err));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function TempChecksEquipmentEditPage() {
  const { teamId, canManage } = useAlenioGoShell();
  const { equipmentId = "" } = useParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<{
    name: string;
    tempMinF: number | null;
    tempMaxF: number | null;
    correctiveActions: string[];
  } | null>(null);

  const load = useCallback(() => {
    if (!teamId || !equipmentId) return;
    setLoading(true);
    void fetchTeamTempCheckEquipmentItem(teamId, equipmentId)
      .then((data) => {
        setInitial({
          name: data.equipment.name,
          tempMinF: data.equipment.tempMinF,
          tempMaxF: data.equipment.tempMaxF,
          correctiveActions: data.equipment.correctiveActions.map((action) => action.label),
        });
      })
      .catch(() => setInitial(null))
      .finally(() => setLoading(false));
  }, [teamId, equipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage) return <Navigate to="/go/temp-checks" replace />;
  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading equipment…</p>;
  if (!initial) return <p className="enterprise-muted">Equipment not found.</p>;

  return (
    <TempCheckEquipmentBuilderPage
      pageTitle="Edit equipment standard"
      pageSubtitle="Update temperature standards and corrective action steps for this equipment."
      busy={busy}
      error={error}
      initial={initial}
      onCancel={() => navigate(`/go/temp-checks/equipment/${equipmentId}`)}
      onSubmit={async (payload) => {
        setBusy(true);
        setError(null);
        try {
          await patchTeamTempCheckEquipment(teamId, equipmentId, payload);
          navigate(`/go/temp-checks/equipment/${equipmentId}`);
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
      <Route path="new" element={<TempChecksCreatePage />} />
      <Route path="equipment/new" element={<TempChecksEquipmentCreatePage />} />
      <Route path="equipment/:equipmentId/edit" element={<TempChecksEquipmentEditPage />} />
      <Route path=":templateId/edit" element={<TempChecksEditPage />} />
      <Route element={<TempChecksWorkspaceLayout />}>
        <Route index element={null} />
        <Route path="equipment/:equipmentId" element={null} />
        <Route path=":templateId" element={null} />
      </Route>
    </Routes>
  );
}
