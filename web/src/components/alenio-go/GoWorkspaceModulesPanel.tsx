import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { setWorkspaceModuleStatus, type WorkspaceModule } from "../../lib/api";
import {
  splitWorkspaceModuleLists,
  type WorkspaceModuleRow,
  type WorkspaceModuleRowIcon,
} from "../../lib/workspace-modules";

type Props = {
  open: boolean;
  onClose: () => void;
  teamId: string;
  modulesByKey: Record<string, WorkspaceModule>;
  onModulesChange: (modulesByKey: Record<string, WorkspaceModule>) => void;
};

function ModuleRowIcon({ name }: { name: WorkspaceModuleRowIcon }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, "aria-hidden": true as const };
  if (name === "alerts") {
    return (
      <svg {...common}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }
  if (name === "devices") {
    return (
      <svg {...common}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    );
  }
  if (name === "temp") {
    return (
      <svg {...common}>
        <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      </svg>
    );
  }
  if (name === "checklists") {
    return (
      <svg {...common}>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M5 6h.01M5 12h.01M5 18h.01" />
      </svg>
    );
  }
  if (name === "walks") {
    return (
      <svg {...common}>
        <circle cx="12" cy="4" r="2" />
        <path d="M10 22V12l-2-3 4-2 4 2-2 3v10" />
      </svg>
    );
  }
  if (name === "equipment") {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    );
  }
  if (name === "incidents") {
    return (
      <svg {...common}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (name === "cascades") {
    return (
      <svg {...common}>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    );
  }
  if (name === "training") {
    return (
      <svg {...common}>
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    );
  }
  if (name === "recognition") {
    return (
      <svg {...common}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EnabledModuleRow({ row }: { row: WorkspaceModuleRow }) {
  return (
    <div className="go-wsm-row go-wsm-row--enabled">
      <span className="go-wsm-row-icon">
        <ModuleRowIcon name={row.icon} />
      </span>
      <div className="go-wsm-row-copy">
        <strong>{row.moduleName}</strong>
        <span>{row.description}</span>
      </div>
      <span className="go-wsm-row-check" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {row.configureHref ? (
        <Link to={row.configureHref} className="go-wsm-row-configure">
          Configure
        </Link>
      ) : null}
      {row.configureHref ? (
        <Link to={row.configureHref} className="go-wsm-row-go" aria-label={`Open ${row.moduleName}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}

function AvailableModuleRow({
  row,
  busy,
  onEnable,
}: {
  row: WorkspaceModuleRow;
  busy: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="go-wsm-row go-wsm-row--available">
      <span className="go-wsm-row-icon">
        <ModuleRowIcon name={row.icon} />
      </span>
      <div className="go-wsm-row-copy">
        <strong>{row.moduleName}</strong>
        <span>{row.description}</span>
      </div>
      <button
        type="button"
        className="go-wsm-row-enable"
        disabled={busy || !row.enableable}
        onClick={onEnable}
        title={row.enableable ? undefined : "Coming soon"}
      >
        Enable
      </button>
    </div>
  );
}

export function GoWorkspaceModulesPanel({ open, onClose, teamId, modulesByKey, onModulesChange }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { enabled, available } = useMemo(() => splitWorkspaceModuleLists(modulesByKey), [modulesByKey]);

  async function enableModule(moduleKey: string) {
    setBusyKey(moduleKey);
    setError(null);
    try {
      const updated = await setWorkspaceModuleStatus(teamId, moduleKey, "active");
      onModulesChange({ ...modulesByKey, [moduleKey]: updated });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable module.");
    } finally {
      setBusyKey(null);
    }
  }

  if (!open) return null;

  return (
    <aside id="go-workspace-modules-panel" className="go-wsm-panel" data-testid="go-workspace-modules-panel" aria-label="Workspace modules">
      <header className="go-wsm-header">
        <div>
          <h2 className="go-wsm-title">Workspace modules</h2>
          <p className="go-wsm-sub">Enable and configure modules for this workspace.</p>
        </div>
        <button type="button" className="go-wsm-close" onClick={onClose} aria-label="Close workspace modules">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {error ? (
        <p className="go-wsm-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="go-wsm-section" aria-labelledby="go-wsm-enabled-title">
        <div className="go-wsm-section-head">
          <h3 id="go-wsm-enabled-title">Enabled modules</h3>
          <span className="go-wsm-count">{enabled.length}</span>
        </div>
        <div className="go-wsm-list">
          {enabled.map((row) => (
            <EnabledModuleRow key={row.moduleKey} row={row} />
          ))}
        </div>
      </section>

      <section className="go-wsm-section" aria-labelledby="go-wsm-available-title">
        <div className="go-wsm-section-head">
          <h3 id="go-wsm-available-title">Available modules</h3>
          <span className="go-wsm-count">{available.length}</span>
        </div>
        <div className="go-wsm-list">
          {available.map((row) => (
            <AvailableModuleRow
              key={row.moduleKey}
              row={row}
              busy={busyKey === row.moduleKey}
              onEnable={() => void enableModule(row.moduleKey)}
            />
          ))}
        </div>
      </section>

      <footer className="go-wsm-footer">
        <a href="/modules" className="go-wsm-library-link">
          View all modules in library
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </footer>
    </aside>
  );
}

export function GoWorkspaceModulesTab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`go-wsm-tab${open ? " go-wsm-tab--open" : ""}`}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="go-workspace-modules-panel"
      data-testid="go-workspace-modules-tab"
      title={open ? "Hide workspace modules" : "Show workspace modules"}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        {open ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
