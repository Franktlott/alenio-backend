import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { TempsButton, TempsPageHeader, TempsPageShell } from "../../components/temps";
import {
  fetchWorkspaceModule,
  fetchWorkspaceModuleTestSessions,
  generateWorkspaceModuleTestCode,
  goLiveWorkspaceModule,
  setWorkspaceModuleStatus,
  switchWorkspaceModuleToTesting,
  updateWorkspaceModuleTestingAccess,
  validateWorkspaceModule,
  type ModuleTestSessionRow,
  type ModuleValidationResult,
  type WorkspaceModule,
} from "../../lib/api";
import type { GoBackendAdminTile } from "../../lib/alenio-go-backend";
import { useAlenioGoShell } from "./alenio-go-outlet-context";
import { defaultModulesByKey } from "../../lib/workspace-modules";

type Props = {
  moduleKey: string;
};

const TONE_BY_KEY: Record<string, GoBackendAdminTile["tone"]> = {
  "temp-checks": "emerald",
  checklists: "cyan",
  briefings: "amber",
  walks: "violet",
};

function StatusBadge({ status }: { status: WorkspaceModule["status"] }) {
  return (
    <span className={`go-mod-badge go-mod-badge--${status}`}>
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function OperatingModeBadge({ mode }: { mode: WorkspaceModule["operatingMode"] }) {
  if (!mode) return null;
  return (
    <span className={`go-mod-mode-badge go-mod-mode-badge--${mode}`}>
      {mode === "live" ? "🟢 Live" : "🧪 Testing"}
    </span>
  );
}

export function AlenioGoModuleSettingsPage({ moduleKey }: Props) {
  const { canManage, teamId } = useAlenioGoShell();

  const [module, setModule] = useState<WorkspaceModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [validation, setValidation] = useState<ModuleValidationResult | null>(null);
  const [sessions, setSessions] = useState<ModuleTestSessionRow[]>([]);
  const [showGoLive, setShowGoLive] = useState(false);
  const [showSwitchTesting, setShowSwitchTesting] = useState(false);

  const load = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    fetchWorkspaceModule(teamId, moduleKey)
      .then((m) => setModule(m))
      .catch(() => {
        const fallback = defaultModulesByKey()[moduleKey];
        if (fallback) {
          setModule(fallback);
          setError("Module settings are offline — activate and save once the server is updated.");
        } else {
          setError("Could not load module.");
        }
      })
      .finally(() => setLoading(false));
  }, [teamId, moduleKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!teamId) return;
    void fetchWorkspaceModuleTestSessions(teamId, moduleKey)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [teamId, moduleKey, module?.operatingMode]);

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  const tone = TONE_BY_KEY[moduleKey] ?? "indigo";

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    const m = await withBusy(() => setWorkspaceModuleStatus(teamId!, moduleKey, "active"));
    if (m) setModule(m);
  }

  async function deactivate() {
    const m = await withBusy(() => setWorkspaceModuleStatus(teamId!, moduleKey, "inactive"));
    if (m) setModule(m);
  }

  async function runValidation() {
    const v = await withBusy(() => validateWorkspaceModule(teamId!, moduleKey));
    if (v) setValidation(v);
    return v;
  }

  async function handleGoLiveConfirm() {
    const m = await withBusy(() => goLiveWorkspaceModule(teamId!, moduleKey));
    if (m) {
      setModule(m);
      setShowGoLive(false);
    } else {
      // Likely validation failure — refresh validation panel.
      void runValidation();
    }
  }

  async function handleSwitchTestingConfirm() {
    const m = await withBusy(() => switchWorkspaceModuleToTesting(teamId!, moduleKey));
    if (m) {
      setModule(m);
      setShowSwitchTesting(false);
    }
  }

  async function patchTestingAccess(patch: Parameters<typeof updateWorkspaceModuleTestingAccess>[2]) {
    const m = await withBusy(() => updateWorkspaceModuleTestingAccess(teamId!, moduleKey, patch));
    if (m) setModule(m);
  }

  async function generateCode() {
    const m = await withBusy(() => generateWorkspaceModuleTestCode(teamId!, moduleKey));
    if (m) setModule(m);
  }

  if (loading) {
    return <EnterprisePageLoading label="Loading module settings" />;
  }

  if (!module) {
    return (
      <GoBackendModuleShell title="Module unavailable" subtitle="The module could not be opened." tone={tone}>
        <div className="go-backend-module-panel go-backend-panel-card">
          <p className="enterprise-muted">{error ?? "Could not load module."}</p>
        </div>
      </GoBackendModuleShell>
    );
  }

  const isActive = module.status === "active";
  const mode = module.operatingMode;
  const isTempsSettings = moduleKey === "temp-checks";

  const statusActions = (
    <>
      <StatusBadge status={module.status} />
      <OperatingModeBadge mode={mode} />
      {isActive ? (
        <button type="button" className="go-mod-btn go-mod-btn--ghost" disabled={busy} onClick={() => void deactivate()}>
          Deactivate
        </button>
      ) : (
        <button type="button" className="go-mod-btn go-mod-btn--primary" disabled={busy} onClick={() => void activate()}>
          Activate module
        </button>
      )}
    </>
  );

  const body: ReactNode = (
    <>
      {error ? (
        <div className="go-backend-module-panel go-backend-panel-card go-mod-error" role="alert">
          {error}
        </div>
      ) : null}

      {/* Overview */}
      <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-overview">
        <h2 id="go-mod-overview" className="go-mod-section-title">Overview</h2>
        <p className="enterprise-muted">{module.description}</p>
        <dl className="go-mod-meta">
          <div><dt>Status</dt><dd><StatusBadge status={module.status} /></dd></div>
          <div><dt>Operating mode</dt><dd>{mode ? <OperatingModeBadge mode={mode} /> : <span className="enterprise-muted">—</span>}</dd></div>
          <div><dt>Activated</dt><dd>{module.activatedAt ? new Date(module.activatedAt).toLocaleDateString() : "—"}</dd></div>
          <div><dt>Live since</dt><dd>{module.liveStartedAt ? new Date(module.liveStartedAt).toLocaleDateString() : "—"}</dd></div>
        </dl>
      </section>

      {moduleKey === "temp-checks" ? (
        <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-temps-library">
          <h2 id="go-mod-temps-library" className="go-mod-section-title">Item Library</h2>
          <p className="enterprise-muted">
            Create, manage, and reuse inspection items for temperature checks.
          </p>
          <Link
            to="/go/temp-checks/library"
            className="go-mod-btn go-mod-btn--primary"
            data-testid="open-temps-item-library"
          >
            Open Item Library
          </Link>
        </section>
      ) : null}

      {/* Operating Mode */}
      <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-mode">
        <h2 id="go-mod-mode" className="go-mod-section-title">Operating Mode</h2>
        {!isActive ? (
          <p className="enterprise-muted">Activate the module to choose an operating mode.</p>
        ) : (
          <>
            <div className="go-mod-segment" role="group" aria-label="Operating mode">
              <button
                type="button"
                className={`go-mod-segment-btn${mode === "testing" ? " go-mod-segment-btn--active" : ""}`}
                disabled={busy || mode === "testing"}
                onClick={() => setShowSwitchTesting(true)}
              >
                🧪 Testing
              </button>
              <button
                type="button"
                className={`go-mod-segment-btn${mode === "live" ? " go-mod-segment-btn--active" : ""}`}
                disabled={busy || mode === "live"}
                onClick={() => {
                  void runValidation();
                  setShowGoLive(true);
                }}
              >
                🟢 Live
              </button>
            </div>
            <div className="go-mod-mode-help">
              <p>
                <strong>Testing:</strong> Run the complete module exactly as users will experience it. Activity completed
                in Testing does not affect compliance, reporting, notifications, dashboards, exports, or live history.
              </p>
              <p>
                <strong>Live:</strong> The module is fully operational. Activity counts toward workplace execution,
                compliance, reporting, analytics, notifications, and history.
              </p>
            </div>
          </>
        )}
      </section>

      {/* Testing Access */}
      {isActive ? (
        <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-access">
          <h2 id="go-mod-access" className="go-mod-section-title">Testing Access</h2>
          <label className="go-mod-check">
            <input
              type="checkbox"
              checked={module.testingAccess.requireTestCode}
              disabled={busy}
              onChange={(e) => void patchTestingAccess({ requireTestCode: e.target.checked })}
            />
            Require a test access code before opening this module in Alenio Go
          </label>

          <div className="go-mod-code-row">
            <div className="go-mod-code-display" data-testid="go-mod-test-code">
              {module.testingAccess.testAccessCode ?? "— no code —"}
            </div>
            <button type="button" className="go-mod-btn go-mod-btn--ghost" disabled={busy} onClick={() => void generateCode()}>
              Generate code
            </button>
            {module.testingAccess.testAccessCode ? (
              <button
                type="button"
                className="go-mod-btn go-mod-btn--ghost"
                disabled={busy}
                onClick={() => void patchTestingAccess({ testAccessCode: null, requireTestCode: false })}
              >
                Clear code
              </button>
            ) : null}
          </div>

          <label className="go-mod-field">
            <span>Custom test code</span>
            <input
              type="text"
              className="go-mod-input"
              defaultValue={module.testingAccess.testAccessCode ?? ""}
              placeholder="Set a custom code"
              disabled={busy}
              onBlur={(e) => {
                const value = e.target.value.trim();
                if (value && value !== module.testingAccess.testAccessCode) {
                  void patchTestingAccess({ testAccessCode: value, requireTestCode: true });
                }
              }}
            />
          </label>

          <label className="go-mod-field">
            <span>Code expiration</span>
            <input
              type="date"
              className="go-mod-input"
              defaultValue={module.testingAccess.testCodeExpiresAt ? module.testingAccess.testCodeExpiresAt.slice(0, 10) : ""}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                void patchTestingAccess({ testCodeExpiresAt: v ? new Date(`${v}T23:59:59`).toISOString() : null });
              }}
            />
          </label>

          <label className="go-mod-field">
            <span>Allowed testing workplaces (comma-separated ids)</span>
            <input
              type="text"
              className="go-mod-input"
              defaultValue={module.testingAccess.allowedTestingWorkplaceIds.join(", ")}
              disabled={busy}
              onBlur={(e) =>
                void patchTestingAccess({
                  allowedTestingWorkplaceIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </label>

          <label className="go-mod-field">
            <span>Allowed testing users (comma-separated ids)</span>
            <input
              type="text"
              className="go-mod-input"
              defaultValue={module.testingAccess.allowedTestingUserIds.join(", ")}
              disabled={busy}
              onBlur={(e) =>
                void patchTestingAccess({
                  allowedTestingUserIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </label>

          <label className="go-mod-field">
            <span>Allowed testing roles (comma-separated)</span>
            <input
              type="text"
              className="go-mod-input"
              defaultValue={module.testingAccess.allowedTestingRoles.join(", ")}
              disabled={busy}
              onBlur={(e) =>
                void patchTestingAccess({
                  allowedTestingRoles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </label>
        </section>
      ) : null}

      {/* Assignments */}
      <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-assign">
        <h2 id="go-mod-assign" className="go-mod-section-title">Assignments</h2>
        <p className="enterprise-muted">
          Assign this module to workplaces and roles. Assignment configuration will connect to the module setup flow.
        </p>
      </section>

      {/* Validation */}
      <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-validation">
        <h2 id="go-mod-validation" className="go-mod-section-title">Validation</h2>
        <button type="button" className="go-mod-btn go-mod-btn--ghost" disabled={busy} onClick={() => void runValidation()}>
          Run validation
        </button>
        {validation ? (
          <ul className="go-mod-validation-list">
            {validation.checks.map((check) => (
              <li key={check.key} className={check.passed ? "go-mod-check-pass" : "go-mod-check-fail"}>
                <span aria-hidden>{check.passed ? "✓" : "✕"}</span> {check.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="enterprise-muted go-mod-hint">Run validation to see readiness for Go Live.</p>
        )}
      </section>

      {/* Testing sessions (admin) */}
      <section className="go-backend-module-panel go-backend-panel-card go-mod-section" aria-labelledby="go-mod-sessions">
        <h2 id="go-mod-sessions" className="go-mod-section-title">Testing Sessions</h2>
        {sessions.length === 0 ? (
          <p className="enterprise-muted">No testing sessions recorded yet.</p>
        ) : (
          <table className="go-mod-sessions-table">
            <thead>
              <tr><th>Tester</th><th>Workplace</th><th>Date</th><th>Completed</th><th>Failed</th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.testerName ?? "—"}</td>
                  <td>{s.workplaceName ?? "—"}</td>
                  <td>{new Date(s.startedAt).toLocaleDateString()}</td>
                  <td>{s.completedSteps}</td>
                  <td>{s.failedSteps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Go Live modal */}
      {showGoLive ? (
        <div className="go-mod-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="go-live-title">
          <div className="go-mod-modal">
            <h3 id="go-live-title" className="go-mod-modal-title">Go Live?</h3>
            <p className="go-mod-modal-body">
              This will immediately make this module available to all assigned workplaces. From this point forward:
            </p>
            <ul className="go-mod-modal-list">
              <li>Completion records will count toward compliance.</li>
              <li>Notifications will begin.</li>
              <li>Reports will include live activity.</li>
              <li>Dashboards will begin tracking execution.</li>
            </ul>
            {validation && !validation.passed ? (
              <div className="go-mod-validation-errors" role="alert">
                <p>Resolve these before going live:</p>
                <ul>
                  {validation.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="go-mod-modal-actions">
              <button type="button" className="go-mod-btn go-mod-btn--ghost" onClick={() => setShowGoLive(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="go-mod-btn go-mod-btn--primary"
                disabled={busy || (validation ? !validation.passed : false)}
                onClick={() => void handleGoLiveConfirm()}
              >
                Go Live
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Switch to Testing modal */}
      {showSwitchTesting ? (
        <div className="go-mod-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="switch-testing-title">
          <div className="go-mod-modal">
            <h3 id="switch-testing-title" className="go-mod-modal-title">Switch to Testing?</h3>
            <p className="go-mod-modal-body">
              This will stop live tracking for this module. New activity will be marked as testing data and will not
              count toward compliance or live reports.
            </p>
            <div className="go-mod-modal-actions">
              <button type="button" className="go-mod-btn go-mod-btn--ghost" onClick={() => setShowSwitchTesting(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="go-mod-btn go-mod-btn--primary"
                disabled={busy}
                onClick={() => void handleSwitchTestingConfirm()}
              >
                Switch to Testing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  if (isTempsSettings) {
    return (
      <TempsPageShell testId="temps-settings-page" wide>
        <TempsPageHeader
          title="Settings"
          description={module.description}
          badges={
            <>
              <StatusBadge status={module.status} />
              <OperatingModeBadge mode={mode} />
            </>
          }
          actions={
            isActive ? (
              <TempsButton variant="ghost" disabled={busy} onClick={() => void deactivate()}>
                Deactivate
              </TempsButton>
            ) : (
              <TempsButton variant="primary" disabled={busy} onClick={() => void activate()}>
                Activate module
              </TempsButton>
            )
          }
        />
        {body}
      </TempsPageShell>
    );
  }

  return (
    <GoBackendModuleShell
      title={module.moduleName}
      subtitle={module.description}
      tone={tone}
      toolbar={<div className="go-mod-toolbar">{statusActions}</div>}
    >
      {body}
    </GoBackendModuleShell>
  );
}
