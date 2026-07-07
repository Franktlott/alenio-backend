import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GoDashModule, GoDashQuickAction } from "../../lib/alenio-go-dashboard";
import {
  formatGoDashClock,
  formatGoDashHeaderDate,
} from "../../lib/alenio-go-dashboard";
import type { GoWorkplaceAlert } from "../../lib/api";
import { ALENIO_ALERT_SOUND_PATH } from "../../lib/go-alert-sounds";
import {
  hasGoAlertSoundPreference,
  isGoAlertSoundUnlocked,
  onGoAlertSoundUnlocked,
  unlockGoAlertSoundFromGesture,
} from "../../lib/go-alert-sound";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { GoKioskAlertBell } from "./GoKioskWorkplaceAlerts";

export function ModuleIcon({ name }: { name: GoDashModule["icon"] }) {
  if (name === "tasks") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  if (name === "checklists") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M5 6h.01M5 12h.01M5 18h.01" />
      </svg>
    );
  }
  if (name === "walks") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <circle cx="12" cy="4" r="2" />
        <path d="M10 22V12l-2-3 4-2 4 2-2 3v10" />
      </svg>
    );
  }
  if (name === "temp") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function GoDashKioskHeader({
  teamName,
  alerts = [],
}: {
  teamName: string;
  alerts?: GoWorkplaceAlert[];
}) {
  const [clock, setClock] = useState(() => formatGoDashClock());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatGoDashClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const headerDate = formatGoDashHeaderDate();

  return (
    <header className="go-dash-topbar go-dash-topbar--store" data-testid="go-kiosk-topbar">
      <div className="go-dash-topbar-logo">
        <AlenioGoLogo variant="header" />
      </div>

      <div className="go-dash-topbar-center go-dash-topbar-center--store">
        <strong className="go-dash-store-name">{teamName || "Workspace"}</strong>
      </div>

      <div className="go-dash-topbar-right go-dash-topbar-right--store">
        <GoKioskAlertBell alerts={alerts} />
        <div className="go-dash-header-clock" aria-live="polite">
          <span className="go-dash-header-clock-time">{clock.time}</span>
          <span className="go-dash-header-clock-date">{headerDate}</span>
        </div>
      </div>
    </header>
  );
}

function storeCardMetric(module: GoDashModule): string {
  if (module.count == null) return "—";
  return String(module.count);
}

export function GoDashStoreModuleCard({ module }: { module: GoDashModule }) {
  const body = (
    <>
      {!module.active ? (
        <div className="go-dash-store-card__soon-row">
          <span className="go-dash-store-card-soon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Coming soon
          </span>
        </div>
      ) : null}
      <div className="go-dash-store-card__head">
        <div className="go-dash-store-card__icon" aria-hidden>
          <ModuleIcon name={module.icon} />
        </div>
        <div className="go-dash-store-card__titles">
          <h2 className="go-dash-store-card__title">{module.title}</h2>
          <p className="go-dash-store-card__sub">{module.subtitle}</p>
        </div>
      </div>
      <div className="go-dash-store-card__metric-wrap">
        <span className="go-dash-store-card__metric">{storeCardMetric(module)}</span>
        <p className="go-dash-store-card__message">{module.countMessage ?? module.subtitle}</p>
      </div>
      <span className="go-dash-store-card__cta">
        {module.ctaLabel ?? `Open ${module.title.toLowerCase()}`}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </>
  );

  const className = `go-dash-store-card go-dash-store-card--${module.tone}${module.active ? "" : " go-dash-store-card--inactive"}`;

  if (module.active && module.href) {
    const isHash = module.href.startsWith("#");
    if (isHash) {
      return (
        <a href={module.href} className={className} data-testid={`go-dash-module-${module.id}`}>
          {body}
        </a>
      );
    }
    return (
      <Link to={module.href} className={className} data-testid={`go-dash-module-${module.id}`}>
        {body}
      </Link>
    );
  }

  return (
    <div className={className} aria-disabled data-testid={`go-dash-module-${module.id}`}>
      {body}
    </div>
  );
}

export function GoDashModuleWheel({ modules }: { modules: GoDashModule[] }) {
  const scrollable = modules.length > 4;

  return (
    <div
      className={`go-dash-module-wheel${scrollable ? " go-dash-module-wheel--scrollable" : ""}`}
      data-testid="go-dash-module-wheel"
    >
      <div className="go-dash-module-wheel-track" role="list">
        {modules.map((module) => (
          <div key={module.id} className="go-dash-module-wheel-item" role="listitem">
            <GoDashStoreModuleCard module={module} />
          </div>
        ))}
      </div>
      {scrollable ? <p className="go-dash-module-wheel-hint">Swipe for more modules</p> : null}
    </div>
  );
}

export function GoDashModuleCard({ module }: { module: GoDashModule }) {
  const body = (
    <>
      {module.active ? null : (
        <div className="go-dash-card-soon-row">
          <span className="go-dash-card-soon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Coming soon
          </span>
        </div>
      )}
      <div className="go-dash-card-icon">
        <ModuleIcon name={module.icon} />
      </div>
      <h2 className="go-dash-card-title">{module.title}</h2>
      <p className="go-dash-card-sub">{module.subtitle}</p>
      {module.active ? (
        <span className="go-dash-card-arrow" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      ) : null}
    </>
  );

  const className = `go-dash-module-card go-dash-module-card--${module.tone}${module.active ? "" : " go-dash-module-card--inactive"}`;

  if (module.active && module.href) {
    const isHash = module.href.startsWith("#");
    if (isHash) {
      return (
        <a href={module.href} className={className} data-testid={`go-dash-module-${module.id}`}>
          {body}
        </a>
      );
    }
    return (
      <Link to={module.href} className={className} data-testid={`go-dash-module-${module.id}`}>
        {body}
      </Link>
    );
  }

  return (
    <div className={className} aria-disabled data-testid={`go-dash-module-${module.id}`}>
      {body}
    </div>
  );
}

function QuickActionIcon({ icon }: { icon: GoDashQuickAction["icon"] }) {
  if (icon === "history") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }
  if (icon === "camera") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    );
  }
  if (icon === "note") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  if (icon === "temp") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function GoDashQuickActionsGrid({ actions }: { actions: GoDashQuickAction[] }) {
  return (
    <div className="go-dash-quick-grid">
      {actions.map((action) => {
        const inactive = !action.active;
        const className = `go-dash-quick-card go-dash-quick-card--${action.tone}${inactive ? " go-dash-quick-card--inactive" : ""}`;
        const inner = (
          <>
            {inactive ? (
              <span className="go-dash-quick-lock" aria-hidden>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            ) : null}
            <span className="go-dash-quick-icon" aria-hidden>
              <QuickActionIcon icon={action.icon} />
            </span>
            <span>{action.label}</span>
          </>
        );
        if (action.active && action.href) {
          const isHash = action.href.startsWith("#");
          if (isHash) {
            return (
              <a key={action.id} href={action.href} className={className}>
                {inner}
              </a>
            );
          }
          return (
            <Link key={action.id} to={action.href} className={className}>
              {inner}
            </Link>
          );
        }
        return (
          <div key={action.id} className={className} aria-disabled>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function GoDashFooter({
  onEndSession,
  endLabel = "End session",
  showAlertSoundStatus = false,
}: {
  onEndSession: () => void;
  endLabel?: string;
  showAlertSoundStatus?: boolean;
}) {
  const [soundReady, setSoundReady] = useState(isGoAlertSoundUnlocked());

  useEffect(() => onGoAlertSoundUnlocked(() => setSoundReady(true)), []);

  const soundStatus = (() => {
    if (!showAlertSoundStatus || soundReady) {
      return { tone: "ok" as const, message: "All systems operational" };
    }
    if (hasGoAlertSoundPreference()) {
      return { tone: "warn" as const, message: "Sound paused — tap once" };
    }
    return { tone: "warn" as const, message: "Sound not enabled yet" };
  })();

  function enableSoundFromFooter() {
    if (soundReady) return;
    unlockGoAlertSoundFromGesture(ALENIO_ALERT_SOUND_PATH);
    if (isGoAlertSoundUnlocked()) setSoundReady(true);
  }

  const statusBody = (
    <>
      <span className="go-dash-footer-dot" aria-hidden />
      {soundStatus.message}
    </>
  );

  return (
    <footer className="go-dash-footer">
      {soundStatus.tone === "warn" ? (
        <button
          type="button"
          className={`go-dash-footer-status go-dash-footer-status--${soundStatus.tone}`}
          onPointerUp={enableSoundFromFooter}
          data-testid="go-dash-footer-sound-status"
        >
          {statusBody}
        </button>
      ) : (
        <div className={`go-dash-footer-status go-dash-footer-status--${soundStatus.tone}`}>{statusBody}</div>
      )}
      <button type="button" className="go-dash-footer-end" onClick={onEndSession}>
        {endLabel}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </footer>
  );
}
