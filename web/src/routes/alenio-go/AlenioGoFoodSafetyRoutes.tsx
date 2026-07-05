import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { FoodSafetyCalibrationFlow } from "../../components/food-safety/FoodSafetyCalibrationFlow";
import { FoodSafetyAdminSetup } from "../../components/food-safety/FoodSafetyAdminSetup";
import { FoodSafetyDashboardPanel } from "../../components/food-safety/FoodSafetyDashboardPanel";
import { FoodSafetyGuidedRun } from "../../components/food-safety/FoodSafetyGuidedRun";
import { FoodSafetyManagerDashboard } from "../../components/food-safety/FoodSafetyManagerDashboard";
import { GoWalkLeaderStartFlow, type WalkStartLeader } from "../../components/alenio-go/GoWalkLeaderStartFlow";
import type { WalkTemplateRow } from "../../lib/api";
import {
  fetchTeamFoodSafetyDashboard,
  fetchTeamFoodSafetyManager,
  fetchTeamHaccpRun,
  fetchTeamHaccpTemplates,
  postTeamFoodSafetySeed,
  postTeamHaccpCorrectiveAction,
  postTeamHaccpProbeCalibration,
  postTeamHaccpRunComplete,
  postTeamHaccpRunItem,
  postTeamHaccpRunStart,
  postTeamHaccpTemplate,
  type FoodSafetyDashboard,
  type HaccpRunRow,
  type HaccpTemplateRow,
} from "../../lib/food-safety-api";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function FoodSafetyHomePage() {
  const { teamId, canManage } = useAlenioGoShell();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"execute" | "manager" | "setup">("execute");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<FoodSafetyDashboard | null>(null);
  const [manager, setManager] = useState<Record<string, unknown> | null>(null);
  const [templates, setTemplates] = useState<HaccpTemplateRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    void Promise.all([
      fetchTeamFoodSafetyDashboard(teamId),
      canManage ? fetchTeamFoodSafetyManager(teamId).catch(() => null) : Promise.resolve(null),
      fetchTeamHaccpTemplates(teamId).catch(() => ({ templates: [], canManage: false })),
    ])
      .then(([dash, mgr, tmpl]) => {
        setDashboard(dash.dashboard);
        setManager(mgr);
        setTemplates(tmpl.templates);
        if (canManage && tmpl.templates.length === 0 && dash.dashboard.cards.tempChecks.length === 0) {
          return postTeamFoodSafetySeed(teamId).then(() => fetchTeamFoodSafetyDashboard(teamId));
        }
        return null;
      })
      .then((refreshed) => {
        if (refreshed) setDashboard(refreshed.dashboard);
      })
      .finally(() => setLoading(false));
  }, [canManage, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <GoBackendModuleShell
      title="Food Safety"
      subtitle="Guided temperature checks, corrective actions, and daily compliance — not a spreadsheet."
      tone="emerald"
      toolbar={
        canManage ? (
          <div className="fs-tabs" role="tablist">
            {(["execute", "manager", "setup"] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`fs-tab${tab === key ? " fs-tab--active" : ""}`}
                onClick={() => setTab(key)}
              >
                {key === "execute" ? "Execution hub" : key === "manager" ? "Corporate view" : "Admin setup"}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      {loading ? (
        <p className="enterprise-muted">Loading food safety hub…</p>
      ) : !dashboard ? (
        <p className="enterprise-muted">Could not load food safety dashboard.</p>
      ) : tab === "manager" && canManage ? (
        <div className="go-backend-module-panel go-backend-panel-card">
          <FoodSafetyManagerDashboard manager={(manager ?? {}) as never} />
        </div>
      ) : tab === "setup" && canManage ? (
        <div className="go-backend-module-panel go-backend-panel-card">
          <FoodSafetyAdminSetup
            templates={templates}
            busy={busy}
            onSeed={async () => {
              if (!teamId) return;
              setBusy(true);
              await postTeamFoodSafetySeed(teamId);
              load();
              setBusy(false);
            }}
            onCreate={async (payload) => {
              if (!teamId) return;
              setBusy(true);
              await postTeamHaccpTemplate(teamId, payload);
              load();
              setBusy(false);
            }}
          />
        </div>
      ) : (
        <div className="go-backend-module-panel go-backend-panel-card">
          <FoodSafetyDashboardPanel
            dashboard={dashboard}
            basePath="/go/food-safety"
            onStartCheck={(templateId) => navigate(`/go/food-safety/run/${templateId}`)}
          />
        </div>
      )}
    </GoBackendModuleShell>
  );
}

function FoodSafetyRunPage() {
  const { teamId } = useAlenioGoShell();
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const [leader, setLeader] = useState<WalkStartLeader | null>(null);
  const [template, setTemplate] = useState<HaccpTemplateRow | null>(null);
  const [run, setRun] = useState<HaccpRunRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !templateId) return;
    setLoading(true);
    void fetchTeamHaccpTemplates(teamId)
      .then((data) => setTemplate(data.templates.find((t) => t.id === templateId) ?? null))
      .finally(() => setLoading(false));
  }, [teamId, templateId]);

  useEffect(() => {
    if (!teamId || !templateId || !leader) return;
    void postTeamHaccpRunStart(teamId, templateId).then(setRun);
  }, [leader, teamId, templateId]);

  if (!teamId) return null;
  if (loading) return <p className="enterprise-muted">Loading check…</p>;
  if (!template) return <Navigate to="/go/food-safety" replace />;

  if (!leader) {
    const walkTemplate: WalkTemplateRow = {
      id: template.id,
      teamId,
      name: template.name,
      workplace: template.workplace,
      scoringEnabled: false,
      isActive: true,
      createdByUserId: "",
      createdAt: "",
      updatedAt: "",
      itemCount: template.itemCount,
      completionCount: 0,
      sectionCount: 1,
      sections: [{ id: "main", title: "Items", sortOrder: 0, items: template.items.map((i) => ({ id: i.id, label: i.label, sortOrder: 0 })) }],
      items: template.items.map((i, index) => ({ id: i.id, label: i.label, sortOrder: index, sectionId: "main" })),
    };
    return (
      <GoWalkLeaderStartFlow
        template={walkTemplate}
        teamId={teamId}
        onCancel={() => navigate("/go/food-safety")}
        onReady={setLeader}
      />
    );
  }

  if (!run) return <p className="enterprise-muted">Starting check…</p>;

  return (
    <FoodSafetyGuidedRun
      run={run}
      actorName={leader.name}
      busy={busy}
      onExit={() => navigate("/go/food-safety")}
      onSaveItem={async (itemId, payload) => {
        setBusy(true);
        const result = await postTeamHaccpRunItem(teamId, run.id, itemId, payload);
        const refreshed = await fetchTeamHaccpRun(teamId, run.id);
        setRun(refreshed);
        setBusy(false);
        return result;
      }}
      onCorrectiveAction={async (itemId, payload) => {
        setBusy(true);
        await postTeamHaccpCorrectiveAction(teamId, { runId: run.id, runItemId: itemId, ...payload });
        const refreshed = await fetchTeamHaccpRun(teamId, run.id);
        setRun(refreshed);
        setBusy(false);
      }}
      onComplete={async () => {
        setBusy(true);
        await postTeamHaccpRunComplete(teamId, run.id);
        navigate("/go/food-safety");
        setBusy(false);
      }}
    />
  );
}

function FoodSafetyCalibrationPage() {
  const { teamId } = useAlenioGoShell();
  const navigate = useNavigate();
  const { userName } = useAlenioGoShell();
  const [busy, setBusy] = useState(false);

  return (
    <GoBackendModuleShell title="Probe calibration" subtitle="Ice water calibration" tone="emerald">
      <div className="go-backend-module-panel go-backend-panel-card">
        <FoodSafetyCalibrationFlow
          actorName={userName?.trim() || "Leader"}
          busy={busy}
          onSave={async (actualTempF) => {
            if (!teamId) throw new Error("Missing team");
            setBusy(true);
            const result = await postTeamHaccpProbeCalibration(teamId, actualTempF);
            setBusy(false);
            return result;
          }}
        />
        <button type="button" className="fs-guided-secondary" onClick={() => navigate("/go/food-safety")}>
          Back
        </button>
      </div>
    </GoBackendModuleShell>
  );
}

export function AlenioGoFoodSafetyRoutes() {
  return (
    <Routes>
      <Route index element={<FoodSafetyHomePage />} />
      <Route path="run/:templateId" element={<FoodSafetyRunPage />} />
      <Route path="calibration" element={<FoodSafetyCalibrationPage />} />
      <Route path="cooling" element={<Navigate to="/go/food-safety" replace />} />
    </Routes>
  );
}
