import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { GO_DASH_KIOSK_MODULES } from "../../lib/alenio-go-dashboard";
import type { GoBackendAdminTile } from "../../lib/alenio-go-backend";

const MODULE_COPY: Record<string, { title: string; subtitle: string; tone: GoBackendAdminTile["tone"]; blurb: string }> = {
  checklists: {
    title: "Checklists",
    subtitle: "Opening routines, sign-offs, and store execution on the floor.",
    tone: "cyan",
    blurb: "Frontline checklists will sync with your workspace standards — the same card your teams see on Alenio Go tablets.",
  },
  briefings: {
    title: "Briefings",
    subtitle: "Shift briefings and team updates pushed to floor devices.",
    tone: "amber",
    blurb: "Publish briefings from here and deliver them to linked tablets alongside workplace alerts.",
  },
  walks: {
    title: "Walks",
    subtitle: "Structured store walks and coaching observations.",
    tone: "violet",
    blurb: "Leader walks and follow-ups will connect to your team coaching workflow.",
  },
};

type Props = {
  moduleId: keyof typeof MODULE_COPY;
};

export function AlenioGoComingSoonModulePage({ moduleId }: Props) {
  const copy = MODULE_COPY[moduleId];
  const kioskModule = GO_DASH_KIOSK_MODULES.find((m) => m.id === moduleId);

  return (
    <GoBackendModuleShell title={copy.title} subtitle={copy.subtitle} tone={copy.tone}>
      <div className="go-backend-module-panel go-backend-panel-card go-backend-coming-soon">
        <span className="go-backend-coming-soon-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Coming soon
        </span>
        <h2 className="go-backend-coming-soon-title">{kioskModule?.title ?? copy.title} module</h2>
        <p className="enterprise-muted go-backend-coming-soon-copy">{copy.blurb}</p>
        <p className="go-backend-coming-soon-hint">
          This module appears on the Alenio Go floor dashboard today — admin controls will land here next.
        </p>
      </div>
    </GoBackendModuleShell>
  );
}
