import { useEffect, useState } from "react";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchOrgMembers, type OrgDirectoryMember } from "../../lib/api";
import { useEnterpriseOrgGoOptional } from "./enterprise-org-go-context";

function roleLabel(role: string): string {
  if (role === "org_owner") return "Org owner";
  if (role === "org_admin") return "Org admin";
  if (role === "owner") return "Workspace owner";
  if (role === "team_leader") return "Team leader";
  if (role === "member") return "Member";
  return role.replace(/_/g, " ");
}

export function EnterpriseOrgUsersPage() {
  const ctx = useEnterpriseOrgGoOptional();
  const [members, setMembers] = useState<OrgDirectoryMember[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx?.organizationId) return;
    let cancelled = false;
    void fetchOrgMembers(ctx.organizationId)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load users");
      });
    return () => {
      cancelled = true;
    };
  }, [ctx?.organizationId]);

  if (!ctx) {
    return <EnterprisePageLoading label="Loading users" />;
  }

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-users">
      <header className="enterprise-org-go-page-head">
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Users</h2>
          <p className="enterprise-muted" style={{ margin: "0.35rem 0 0" }}>
            Organization admins and people across corporate workspaces for {ctx.organizationName}.
          </p>
        </div>
      </header>

      {err ? <p className="enterprise-muted" style={{ color: "#b91c1c" }}>{err}</p> : null}

      {members === null ? (
        <EnterprisePageLoading label="Loading users" />
      ) : members.length === 0 ? (
        <div className="enterprise-card" style={{ padding: "1.25rem" }}>
          <p className="enterprise-muted" style={{ margin: 0 }}>
            No users yet. Invite org admins or add people to store workspaces.
          </p>
        </div>
      ) : (
        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name?.trim() || "—"}</strong>
                  </td>
                  <td>{m.email}</td>
                  <td>{roleLabel(m.role)}</td>
                  <td>
                    {m.scope === "organization"
                      ? "Organization"
                      : m.workspaceName ?? "Workspace"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
