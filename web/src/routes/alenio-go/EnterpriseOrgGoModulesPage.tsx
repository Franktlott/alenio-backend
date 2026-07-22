import { useEffect, useState } from "react";
import {
  fetchOrgGoModules,
  setOrgGoModuleAssignment,
  upsertOrgGoModule,
  type OrgGoModule,
  type OrgGoModulePermissions,
} from "../../lib/api";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseOrgGoOptional } from "./enterprise-org-go-context";

const DEFAULT_PERMS: OrgGoModulePermissions = {
  allowScheduleEdits: true,
  allowEquipmentAdditions: true,
  allowLocalNotes: true,
  allowLocalNotifications: true,
  allowTemplateEdits: false,
};

export function EnterpriseOrgGoModulesPage() {
  const ctx = useEnterpriseOrgGoOptional();
  const [modules, setModules] = useState<OrgGoModule[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"organization" | "workspaces">("organization");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [perms, setPerms] = useState<OrgGoModulePermissions>(DEFAULT_PERMS);

  const organizationId = ctx?.organizationId;

  const load = async (orgId: string) => {
    const rows = await fetchOrgGoModules(orgId);
    setModules(rows);
    if (!selectedId && rows[0]) selectModule(rows[0]);
  };

  const selectModule = (mod: OrgGoModule) => {
    setSelectedId(mod.id);
    setScope(mod.assignment?.scope ?? "organization");
    setTeamIds(mod.assignment?.teamIds ?? []);
    setPerms(mod.assignment?.permissions ?? DEFAULT_PERMS);
  };

  useEffect(() => {
    if (!organizationId) return;
    void load(organizationId).catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (!ctx) {
    return <EnterprisePageLoading label="Loading corporate standards" />;
  }

  const { org } = ctx;

  const selected = modules.find((m) => m.id === selectedId) ?? null;

  const ensureTempChecks = async () => {
    setBusy(true);
    setErr(null);
    try {
      const mod = await upsertOrgGoModule(ctx.organizationId, {
        moduleKey: "temp-checks",
        moduleName: "Temperature Checks",
        status: "published",
      });
      await load(ctx.organizationId);
      selectModule(mod);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create module");
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async () => {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      if (selected.status !== "published") {
        await upsertOrgGoModule(ctx.organizationId, {
          moduleKey: selected.moduleKey,
          status: "published",
        });
      }
      const mod = await setOrgGoModuleAssignment(ctx.organizationId, selected.id, {
        scope,
        teamIds: scope === "workspaces" ? teamIds : undefined,
        permissions: perms,
      });
      await load();
      selectModule(mod);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save assignment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-modules">
      <header className="enterprise-org-go-page-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Corporate standards</p>
          <h1>Modules</h1>
          <p className="enterprise-muted">
            Create organization modules and assign them to the entire company or selected workspaces.
          </p>
        </div>
        <button type="button" className="auth-submit" disabled={busy} onClick={() => void ensureTempChecks()}>
          {modules.some((m) => m.moduleKey === "temp-checks") ? "Refresh Temps module" : "Add Temperature Checks"}
        </button>
      </header>

      {err ? <p className="auth-error">{err}</p> : null}

      <div className="enterprise-org-go-split">
        <div className="enterprise-card" style={{ padding: "1rem" }}>
          <h2 className="enterprise-card-title">Org modules</h2>
          {modules.length === 0 ? (
            <p className="enterprise-muted">No modules yet. Add Temperature Checks to get started.</p>
          ) : (
            <ul className="enterprise-org-go-module-list">
              {modules.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={selectedId === m.id ? "is-active" : ""}
                    onClick={() => selectModule(m)}
                  >
                    <strong>{m.moduleName}</strong>
                    <span>
                      {m.status}
                      {m.assignment ? ` · ${m.assignment.scope}` : " · unassigned"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="enterprise-card" style={{ padding: "1rem" }}>
          <h2 className="enterprise-card-title">Assignment</h2>
          {!selected ? (
            <p className="enterprise-muted">Select a module.</p>
          ) : (
            <>
              <p>
                <strong>{selected.moduleName}</strong> ({selected.moduleKey})
              </p>
              <label className="auth-label">Scope</label>
              <select
                className="auth-input"
                value={scope}
                onChange={(e) => setScope(e.target.value as "organization" | "workspaces")}
              >
                <option value="organization">Entire organization</option>
                <option value="workspaces">Selected workspaces</option>
              </select>

              {scope === "workspaces" ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <label className="auth-label">Workspaces</label>
                  <div className="enterprise-org-go-team-checks">
                    {org.teams.map((t) => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          checked={teamIds.includes(t.id)}
                          onChange={(e) => {
                            setTeamIds((prev) =>
                              e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                            );
                          }}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: "1rem" }}>
                <label className="auth-label">Workspace permissions</label>
                {(
                  [
                    ["allowScheduleEdits", "Allow schedule edits"],
                    ["allowEquipmentAdditions", "Allow equipment additions"],
                    ["allowLocalNotes", "Allow local notes"],
                    ["allowLocalNotifications", "Allow local notifications"],
                    ["allowTemplateEdits", "Allow template / library edits"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="enterprise-org-go-perm">
                    <input
                      type="checkbox"
                      checked={perms[key]}
                      onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <button
                type="button"
                className="auth-submit"
                style={{ marginTop: "1rem" }}
                disabled={busy}
                onClick={() => void saveAssignment()}
              >
                {busy ? "Saving…" : "Save assignment"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
