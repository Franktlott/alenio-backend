import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ackGoWorkplaceAlert,
  fetchGoWorkplaceAlerts,
  fetchPublicChecklistHub,
  type GoWorkplaceAlert,
} from "../../lib/api";
import { ALENIO_ALERT_SOUND_PATH, resolveWorkplaceAlertSoundUrl } from "../../lib/go-alert-sounds";
import { stopGoAlertSoundLoop, setGoAlertSoundWorkspaceUrl } from "../../lib/go-alert-sound";
import {
  GO_DASH_KIOSK_MODULES,
  GO_DASH_QUICK_ACTIONS,
  greetingForHour,
  type GoDashModule,
} from "../../lib/alenio-go-dashboard";
import { clearGoLinkedWorkspace, getGoDeviceId, saveGoLinkedWorkspace } from "../../lib/go-device";
import { probeImageUrl } from "../../lib/image-probe";
import { handleGoDeviceSessionError } from "../../lib/go-session";
import {
  GoDashFooter,
  GoDashKioskHeader,
  GoDashModuleWheel,
  GoDashQuickActionsGrid,
} from "./go-dash-parts";
import { GoKioskAlertModal, GoAlertSoundUnlockBanner } from "./GoKioskWorkplaceAlerts";

type Props = {
  hubToken: string;
};

function buildKioskModules(): GoDashModule[] {
  return GO_DASH_KIOSK_MODULES.map((module) => ({
    ...module,
    count: 0,
    countMessage: module.active ? module.countMessage : "Coming soon",
  }));
}

async function resolveDisplayHeroImage(url: string | null | undefined): Promise<string | null> {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return (await probeImageUrl(trimmed)) ? trimmed : null;
}

export function AlenioGoKioskDashboard({ hubToken }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<GoWorkplaceAlert[]>([]);
  const [activeAlert, setActiveAlert] = useState<GoWorkplaceAlert | null>(null);
  const handledAlertIds = useRef(new Set<string>());
  const alertQueueRef = useRef<GoWorkplaceAlert[]>([]);
  const hubRequestRef = useRef(0);

  const kioskModules = useMemo(() => buildKioskModules(), []);

  const enqueueAlertsForModal = useCallback((incoming: GoWorkplaceAlert[]) => {
    if (incoming.length === 0) return;
    setActiveAlert((current) => {
      if (current) {
        alertQueueRef.current.push(...incoming);
        return current;
      }
      if (incoming.length > 1) {
        alertQueueRef.current.push(...incoming.slice(1));
      }
      return incoming[0]!;
    });
  }, []);

  const acknowledgeActiveAlert = useCallback(() => {
    stopGoAlertSoundLoop();
    const next = alertQueueRef.current.shift() ?? null;
    setActiveAlert(next);
  }, []);

  const handleIncomingAlerts = useCallback(
    (incoming: GoWorkplaceAlert[]) => {
      if (incoming.length === 0) return;
      const deviceId = getGoDeviceId();
      const fresh: GoWorkplaceAlert[] = [];
      for (const alert of incoming) {
        if (handledAlertIds.current.has(alert.id)) continue;
        handledAlertIds.current.add(alert.id);
        fresh.push({
          ...alert,
          soundUrl: resolveWorkplaceAlertSoundUrl(alert),
        });
        void ackGoWorkplaceAlert(alert.id, hubToken, deviceId);
      }
      if (fresh.length > 0) {
        enqueueAlertsForModal(fresh);
      }
      setAlerts((prev) => {
        const merged = [...fresh, ...prev.filter((a) => !fresh.some((n) => n.id === a.id))];
        return merged.slice(0, 20);
      });
    },
    [hubToken, enqueueAlertsForModal],
  );

  useEffect(() => () => stopGoAlertSoundLoop(), []);

  useEffect(() => {
    if (!hubToken) {
      setError("Invalid workspace link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const deviceId = getGoDeviceId();

    const refreshHub = (initialLoad: boolean) => {
      const reqId = ++hubRequestRef.current;
      if (initialLoad) {
        setLoading(true);
        setError(null);
        setHeroImage(null);
      }

      void fetchPublicChecklistHub(hubToken, deviceId)
        .then(async (data) => {
          if (cancelled || reqId !== hubRequestRef.current) return;

          const resolvedHero = await resolveDisplayHeroImage(data.team.image);
          if (cancelled || reqId !== hubRequestRef.current) return;

          setTeamName(data.team.name);
          setHeroImage(resolvedHero);
          setGoAlertSoundWorkspaceUrl(ALENIO_ALERT_SOUND_PATH);
          saveGoLinkedWorkspace(hubToken, data.team.name, resolvedHero);
        })
        .catch((err) => {
          if (cancelled || reqId !== hubRequestRef.current) return;
          if (handleGoDeviceSessionError(err)) return;
          setError("Workspace not found.");
        })
        .finally(() => {
          if (!cancelled && reqId === hubRequestRef.current && initialLoad) {
            setLoading(false);
          }
        });
    };

    refreshHub(true);
    const hubPollId = window.setInterval(() => refreshHub(false), 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(hubPollId);
    };
  }, [hubToken]);

  useEffect(() => {
    if (!hubToken || loading || error) return;
    const deviceId = getGoDeviceId();
    let cancelled = false;

    const poll = () => {
      void fetchGoWorkplaceAlerts(hubToken, deviceId)
        .then((rows) => {
          if (!cancelled) handleIncomingAlerts(rows);
        })
        .catch(() => {
          /* session gate handles unlink logout */
        });
    };

    poll();
    const pollId = window.setInterval(poll, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [hubToken, loading, error, handleIncomingAlerts]);

  const greeting = greetingForHour(new Date().getHours());

  function endSession() {
    clearGoLinkedWorkspace();
    navigate("/aleniogo", { replace: true });
  }

  const heroStyle = heroImage
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.76), rgba(67,97,238,0.52)), url(${heroImage})`,
      }
    : undefined;

  if (loading) {
    return (
      <div className="go-dash go-dash--kiosk go-dash--store" data-testid="alenio-go-kiosk-dashboard">
        <GoDashKioskHeader teamName="" />
        <p className="go-dash-loading">Loading workspace…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="go-dash go-dash--kiosk go-dash--store" data-testid="alenio-go-kiosk-dashboard">
        <GoDashKioskHeader teamName="" />
        <p className="go-dash-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="go-dash go-dash--kiosk go-dash--store" data-testid="alenio-go-kiosk-dashboard">
      <GoDashKioskHeader teamName={teamName} alerts={alerts} />

      <GoAlertSoundUnlockBanner />

      {activeAlert ? (
        <GoKioskAlertModal alert={activeAlert} onAcknowledge={acknowledgeActiveAlert} />
      ) : null}

      <div className="go-dash-scroll">
        <section className="go-dash-hero go-dash-hero--store" style={heroStyle}>
          <div className="go-dash-hero-copy">
            <h1>{greeting}!</h1>
            <p>Here&apos;s what&apos;s ahead for {teamName} today.</p>
          </div>

          <div className="go-dash-stats-bar go-dash-stats-bar--store">
            <div className="go-dash-progress">
              <div className="go-dash-progress-ring" style={{ ["--pct" as string]: "0" }}>
                <span>0%</span>
              </div>
              <div>
                <strong>Today&apos;s progress</strong>
                <span>More modules coming soon</span>
              </div>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--indigo">0</span>
              <span className="go-dash-stat-label">Active modules</span>
              <span className="go-dash-stat-hint">Alerts are live today</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--amber">—</span>
              <span className="go-dash-stat-label">Briefings</span>
              <span className="go-dash-stat-hint">Coming soon</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--green">—</span>
              <span className="go-dash-stat-label">Checklists</span>
              <span className="go-dash-stat-hint">Coming soon</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--violet">—</span>
              <span className="go-dash-stat-label">Walks</span>
              <span className="go-dash-stat-hint">Coming soon</span>
            </div>
          </div>
        </section>

        <div className="go-dash-body go-dash-body--kiosk go-dash-body--store">
          <GoDashModuleWheel modules={kioskModules} />
        </div>
      </div>

      <div className="go-dash-bottom-dock go-dash-bottom-dock--store">
        <section className="go-dash-quick go-dash-quick--dock" aria-labelledby="go-kiosk-quick-title">
          <h2 id="go-kiosk-quick-title" className="go-dash-quick-title">
            Quick actions
          </h2>
          <GoDashQuickActionsGrid actions={GO_DASH_QUICK_ACTIONS} />
        </section>
        <GoDashFooter onEndSession={endSession} endLabel="Disconnect device" showAlertSoundStatus />
      </div>
    </div>
  );
}
