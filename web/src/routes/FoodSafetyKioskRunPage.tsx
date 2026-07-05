import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoWalkLeaderStartFlow, type WalkStartLeader } from "../components/alenio-go/GoWalkLeaderStartFlow";
import { FoodSafetyGuidedRun } from "../components/food-safety/FoodSafetyGuidedRun";
import type { WalkTemplateRow } from "../lib/api";
import {
  fetchGoFoodSafetyDashboard,
  fetchGoHaccpRun,
  postGoHaccpCorrectiveAction,
  postGoHaccpRunComplete,
  postGoHaccpRunItem,
  postGoHaccpRunStart,
  type HaccpRunRow,
} from "../lib/food-safety-api";
import { getGoDeviceId } from "../lib/go-device";
import { handleGoDeviceSessionError } from "../lib/go-session";

export function FoodSafetyKioskRunPage() {
  const { hubToken = "", templateId = "" } = useParams();
  const navigate = useNavigate();
  const [leader, setLeader] = useState<WalkStartLeader | null>(null);
  const [run, setRun] = useState<HaccpRunRow | null>(null);
  const [templateMeta, setTemplateMeta] = useState<WalkTemplateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const basePath = `/checklist/${hubToken}/food-safety`;
  const deviceId = getGoDeviceId();

  useEffect(() => {
    if (!hubToken || !templateId) return;
    setLoading(true);
    void fetchGoFoodSafetyDashboard(hubToken, deviceId)
      .then((dash) => {
        const card = dash.cards.tempChecks.find((c) => c.templateId === templateId);
        if (!card) {
          setTemplateMeta(null);
          return;
        }
        setTemplateMeta({
          id: card.templateId,
          teamId: "",
          name: card.name,
          workplace: "Kitchen",
          scoringEnabled: false,
          isActive: true,
          createdByUserId: "",
          createdAt: "",
          updatedAt: "",
          itemCount: card.itemCount,
          completionCount: 0,
          sectionCount: 1,
          sections: [],
          items: [],
        });
      })
      .catch((err) => {
        if (handleGoDeviceSessionError(err)) return;
        setTemplateMeta(null);
      })
      .finally(() => setLoading(false));
  }, [deviceId, hubToken, templateId]);

  useEffect(() => {
    if (!hubToken || !templateId || !leader) return;
    void postGoHaccpRunStart(hubToken, deviceId, templateId, leader.name, leader.userId).then(setRun);
  }, [deviceId, hubToken, leader, templateId]);

  if (loading) return <p className="go-dash-loading">Loading check…</p>;
  if (!templateMeta) return <p className="go-dash-error">Check not found.</p>;

  if (!leader) {
    return (
      <GoWalkLeaderStartFlow
        hubToken={hubToken}
        template={templateMeta}
        onCancel={() => navigate(basePath)}
        onReady={setLeader}
      />
    );
  }

  if (!run) return <p className="go-dash-loading">Starting check…</p>;

  return (
    <FoodSafetyGuidedRun
      run={run}
      actorName={leader.name}
      busy={busy}
      onExit={() => navigate(basePath)}
      onSaveItem={async (itemId, payload) => {
        setBusy(true);
        const result = await postGoHaccpRunItem(hubToken, deviceId, run.id, itemId, {
          actorName: leader.name,
          ...payload,
        });
        setRun(await fetchGoHaccpRun(hubToken, deviceId, run.id));
        setBusy(false);
        return result;
      }}
      onCorrectiveAction={async (itemId, payload) => {
        setBusy(true);
        await postGoHaccpCorrectiveAction(hubToken, deviceId, {
          runId: run.id,
          runItemId: itemId,
          performedByName: leader.name,
          performedByUserId: leader.userId,
          ...payload,
        });
        setRun(await fetchGoHaccpRun(hubToken, deviceId, run.id));
        setBusy(false);
      }}
      onComplete={async () => {
        setBusy(true);
        await postGoHaccpRunComplete(hubToken, deviceId, run.id, leader.name);
        navigate(basePath);
        setBusy(false);
      }}
    />
  );
}
