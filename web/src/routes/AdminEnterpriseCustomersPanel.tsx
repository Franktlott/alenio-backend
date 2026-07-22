import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  createAdminOrganization,
  deleteAdminOrganization,
  fetchAdminOrganization,
  fetchAdminOrganizations,
  formatAdminDate,
  planLabel,
  type AdminOrganizationRow,
} from "../lib/admin-api";

export function AdminEnterpriseCustomersPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [initialWorkspaceName, setInitialWorkspaceName] = useState("");
  const [plan, setPlan] = useState<"free" | "team" | "operations">("operations");
  const [formError, setFormError] = useState<string | null>(null);
  const [welcomeNotice, setWelcomeNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: () => fetchAdminOrganizations(),
  });

  const detailQuery = useQuery({
    queryKey: ["admin", "organizations", selectedId],
    queryFn: () => fetchAdminOrganization(selectedId!),
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: createAdminOrganization,
    onSuccess: async (result) => {
      setShowCreate(false);
      setName("");
      setDomain("");
      setOwnerEmail("");
      setOwnerName("");
      setInitialWorkspaceName("");
      setFormError(null);
      setSelectedId(result.organization.id);
      if (result.welcomeEmail?.sent && result.welcomeEmail.kind === "signup") {
        setWelcomeNotice("Sign-up email sent — the owner can create their username and password.");
      } else if (result.welcomeEmail?.sent) {
        setWelcomeNotice("Welcome email sent to the existing owner.");
      } else if (result.welcomeEmail && !result.welcomeEmail.sent) {
        setWelcomeNotice(
          result.welcomeEmail.error
            ? `Customer created. Email not sent: ${result.welcomeEmail.error}`
            : "Customer created. Email was not sent.",
        );
      } else {
        setWelcomeNotice(
          "Enterprise customer created. Add an owner email to send a sign-up or welcome email.",
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Could not create enterprise customer.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminOrganization,
    onSuccess: async (result) => {
      setSelectedId(null);
      setWelcomeNotice(
        `Removed ${result.deleted.name}. ${result.unlinkedWorkspaces.length} workspace(s) kept as self-serve.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
    onError: (err) => {
      setWelcomeNotice(err instanceof Error ? err.message : "Could not remove enterprise customer.");
    },
  });

  const rows: AdminOrganizationRow[] = listQuery.data ?? [];
  const detail = detailQuery.data ?? null;

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Enter a customer name.");
      return;
    }
    if (!ownerEmail.trim()) {
      setFormError("Owner email is required so we can send the sign-up email.");
      return;
    }
    if (initialWorkspaceName.trim() && !ownerEmail.trim()) {
      setFormError("Owner email is required when creating the first workspace.");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      ...(domain.trim() ? { domain: domain.trim(), markDomainVerified: true } : {}),
      ownerEmail: ownerEmail.trim(),
      ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
      ...(initialWorkspaceName.trim()
        ? { initialWorkspaceName: initialWorkspaceName.trim(), plan }
        : {}),
    });
  };

  return (
    <div className="enterprise-admin-enterprise" data-testid="admin-enterprise-customers">
      <header className="enterprise-admin-header" style={{ marginBottom: "1rem" }}>
        <div>
          <h1>Enterprise customers</h1>
          <p className="enterprise-muted">
            Contract company accounts (SSO, SCIM, multi-workspace). Separate from self-serve Pro / Operations
            subscriptions on the Workspaces tab.
          </p>
        </div>
        <button
          type="button"
          className="auth-submit"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
            setWelcomeNotice(null);
          }}
          data-testid="admin-enterprise-create-toggle"
        >
          {showCreate ? "Cancel" : "New customer"}
        </button>
      </header>

      {welcomeNotice ? (
        <p className="enterprise-muted" style={{ marginBottom: "1rem" }} data-testid="admin-enterprise-welcome-notice">
          {welcomeNotice}
        </p>
      ) : null}

      {showCreate ? (
        <form className="enterprise-card" onSubmit={onCreate} style={{ marginBottom: "1rem" }}>
          <h2 className="enterprise-card-title enterprise-card-title-spaced">Create enterprise customer</h2>
          <p className="enterprise-muted" style={{ marginBottom: "0.75rem", fontSize: 13 }}>
            Creates an <strong>enterprise contract</strong> account. We email the owner a link to create their
            display name and password (or a welcome email if they already have an Alenio account).
          </p>
          <label className="auth-label" htmlFor="ent-name">
            Customer name
          </label>
          <input
            id="ent-name"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            required
            data-testid="admin-enterprise-name"
          />

          <label className="auth-label" htmlFor="ent-domain">
            Email domain (optional)
          </label>
          <input
            id="ent-domain"
            className="auth-input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            data-testid="admin-enterprise-domain"
          />

          <label className="auth-label" htmlFor="ent-owner-email">
            Owner email
          </label>
          <input
            id="ent-owner-email"
            className="auth-input"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="owner@acme.com"
            required
            data-testid="admin-enterprise-owner-email"
          />

          <label className="auth-label" htmlFor="ent-owner-name">
            Owner display name (optional)
          </label>
          <input
            id="ent-owner-name"
            className="auth-input"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Jane Owner"
            data-testid="admin-enterprise-owner-name"
          />

          <label className="auth-label" htmlFor="ent-workspace">
            First workspace name (optional)
          </label>
          <input
            id="ent-workspace"
            className="auth-input"
            value={initialWorkspaceName}
            onChange={(e) => setInitialWorkspaceName(e.target.value)}
            placeholder="Acme HQ"
            data-testid="admin-enterprise-workspace"
          />

          {initialWorkspaceName.trim() ? (
            <>
              <label className="auth-label" htmlFor="ent-plan">
                Workspace feature plan (not the customer type)
              </label>
              <select
                id="ent-plan"
                className="auth-input"
                value={plan}
                onChange={(e) => setPlan(e.target.value as typeof plan)}
                data-testid="admin-enterprise-plan"
              >
                <option value="operations">Operations features</option>
                <option value="team">Pro features</option>
                <option value="free">Free features</option>
              </select>
              <p className="enterprise-muted" style={{ fontSize: 12, marginTop: 4 }}>
                If the owner is new, the workspace is created after they finish sign-up.
              </p>
            </>
          ) : null}

          {formError ? <p className="auth-error">{formError}</p> : null}

          <button
            type="submit"
            className="auth-submit"
            disabled={createMutation.isPending}
            data-testid="admin-enterprise-create-submit"
          >
            {createMutation.isPending ? "Creating…" : "Create customer"}
          </button>
        </form>
      ) : null}

      {listQuery.isLoading ? (
        <p className="enterprise-muted">Loading enterprise customers…</p>
      ) : listQuery.isError ? (
        <p className="enterprise-muted">
          {listQuery.error instanceof Error ? listQuery.error.message : "Could not load enterprise customers."}
        </p>
      ) : (
        <div className="enterprise-admin-split" style={{ display: "grid", gridTemplateColumns: selectedId ? "1.2fr 1fr" : "1fr", gap: "1rem" }}>
          <div className="enterprise-table-wrap">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Domain</th>
                  <th>Workspaces</th>
                  <th>SSO</th>
                  <th>SCIM</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="enterprise-table-empty">
                      No enterprise customers yet
                    </td>
                  </tr>
                ) : (
                  rows.map((org) => (
                    <tr
                      key={org.id}
                      onClick={() => setSelectedId(org.id)}
                      style={{ cursor: "pointer", background: selectedId === org.id ? "rgba(67,97,238,0.08)" : undefined }}
                      data-testid={`admin-enterprise-row-${org.id}`}
                    >
                      <td>
                        <strong>{org.name}</strong>
                        <div className="enterprise-muted" style={{ fontSize: 12 }}>
                          {org.slug}
                        </div>
                      </td>
                      <td>
                        <span className="enterprise-admin-badge">Enterprise contract</span>
                      </td>
                      <td>
                        {org.domain ? (
                          <span>
                            {org.domain}
                            {!org.domainVerified ? (
                              <span className="enterprise-muted"> · unverified</span>
                            ) : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{org.workspaceCount}</td>
                      <td>{org.ssoEnabled ? "On" : "Off"}</td>
                      <td>{org.scimEnabled ? "On" : "Off"}</td>
                      <td>{org.status}</td>
                      <td>{formatAdminDate(org.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {selectedId ? (
            <aside className="enterprise-card" data-testid="admin-enterprise-detail">
              {detailQuery.isLoading ? (
                <p className="enterprise-muted">Loading customer…</p>
              ) : detailQuery.isError || !detail ? (
                <p className="enterprise-muted">Could not load customer detail.</p>
              ) : (
                <>
                  <h2 className="enterprise-card-title enterprise-card-title-spaced">{detail.name}</h2>
                  <p className="enterprise-muted" style={{ marginBottom: "0.75rem" }}>
                    <span className="enterprise-admin-badge">Enterprise contract</span>
                    {" · "}
                    {detail.slug} · {detail.status}
                  </p>
                  <dl className="enterprise-admin-dl">
                    <div>
                      <dt>Domain</dt>
                      <dd>
                        {detail.domains[0]
                          ? `${detail.domains[0].domain}${detail.domains[0].verifiedAt ? "" : " (unverified)"}`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Default workspace</dt>
                      <dd>{detail.defaultTeam?.name ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>SSO</dt>
                      <dd>{detail.ssoConfig?.enabled ? `${detail.ssoConfig.provider} on` : "Off"}</dd>
                    </div>
                    <div>
                      <dt>SCIM</dt>
                      <dd>{detail.scimConfig?.enabled ? "On" : "Off"}</dd>
                    </div>
                  </dl>

                  <h3 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Workspaces</h3>
                  {detail.teams.length === 0 ? (
                    <p className="enterprise-muted">No workspaces linked yet.</p>
                  ) : (
                    <ul className="enterprise-admin-teams" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {detail.teams.map((team) => (
                        <li
                          key={team.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "0.75rem",
                            padding: "0.4rem 0",
                            borderBottom: "1px solid rgba(0,0,0,0.06)",
                          }}
                        >
                          <span>
                            {team.name}
                            <span className="enterprise-muted" style={{ display: "block", fontSize: 12 }}>
                              {team._count.members} members
                              {team.subscription ? ` · ${planLabel(team.subscription.plan)}` : ""}
                            </span>
                          </span>
                          <span className="enterprise-muted" style={{ fontSize: 12 }}>
                            {team.inviteCode}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="enterprise-muted" style={{ marginTop: "1rem", fontSize: 12 }}>
                    Remove clears the enterprise customer only. Linked workspaces stay and become self-serve again.
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="enterprise-team-btn-destructive"
                      disabled={deleteMutation.isPending}
                      data-testid="admin-enterprise-remove"
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove enterprise customer “${detail.name}”? Workspaces stay; they will no longer be marked Enterprise.`,
                          )
                        ) {
                          return;
                        }
                        deleteMutation.mutate(detail.id);
                      }}
                    >
                      {deleteMutation.isPending ? "Removing…" : "Remove customer"}
                    </button>
                    <button
                      type="button"
                      className="enterprise-team-btn-outline"
                      onClick={() => setSelectedId(null)}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
