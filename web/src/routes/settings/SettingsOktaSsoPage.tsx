import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createOrganizationFromTeam,
  fetchOrganizationForTeam,
  saveOrganizationOktaSso,
  type OrganizationSsoPublicConfig,
} from "../../lib/api";

function isFullSsoConfig(
  sso: OrganizationSsoPublicConfig | { enabled: boolean; provider: string; organizationName: string } | null,
): sso is OrganizationSsoPublicConfig {
  return Boolean(sso && "callbackUrl" in sso && "organizationId" in sso);
}

export function SettingsOktaSsoPage() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const team = teams?.find((t) => t.id === selectedTeamId) ?? teams?.[0];
  const isOwner = team?.role === "owner";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string>("");
  const [sso, setSso] = useState<OrganizationSsoPublicConfig | null>(null);

  const [issuer, setIssuer] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [domain, setDomain] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [ssoRequired, setSsoRequired] = useState(false);
  const [markDomainVerified, setMarkDomainVerified] = useState(false);

  const callbackUrl = useMemo(() => sso?.callbackUrl ?? "", [sso?.callbackUrl]);

  const applySso = (next: OrganizationSsoPublicConfig | null, orgName?: string) => {
    setSso(next);
    if (next) {
      setOrganizationId(next.organizationId);
      setOrganizationName(orgName || next.organizationName);
      setIssuer(next.issuer ?? "");
      setClientId(next.clientId ?? "");
      setDomain(next.domain ?? "");
      setEnabled(next.enabled);
      setSsoRequired(next.ssoRequired);
      setMarkDomainVerified(next.domainVerified);
    }
  };

  useEffect(() => {
    if (!team?.id || !isOwner) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchOrganizationForTeam(team.id)
      .then((data) => {
        if (cancelled) return;
        setOrganizationId(data.organization?.id ?? null);
        setOrganizationName(data.organization?.name ?? team.name);
        applySso(isFullSsoConfig(data.sso) ? data.sso : null, data.organization?.name);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Okta settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [team?.id, team?.name, isOwner]);

  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading Okta SSO" />;
  }
  if (!team || !isOwner) {
    return <Navigate to="/settings" replace />;
  }
  if (loading) {
    return <EnterprisePageLoading label="Loading Okta SSO" />;
  }

  const onCreateOrg = async () => {
    setCreatingOrg(true);
    setError(null);
    setNotice(null);
    try {
      const data = await createOrganizationFromTeam(team.id);
      setOrganizationId(data.organization?.id ?? null);
      setOrganizationName(data.organization?.name ?? team.name);
      applySso(data.sso, data.organization?.name);
      setNotice("Organization ready. Add your Okta app details below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create organization.");
    } finally {
      setCreatingOrg(false);
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!organizationId || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveOrganizationOktaSso(organizationId, {
        issuer: issuer.trim(),
        clientId: clientId.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        domain: domain.trim(),
        enabled,
        ssoRequired,
        markDomainVerified,
      });
      applySso(next);
      setClientSecret("");
      setNotice(next.enabled ? "Okta SSO saved and enabled." : "Okta SSO saved (not enabled yet).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save Okta settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="enterprise-tab-shell seneca-studio-page" data-testid="settings-okta-sso">
      <div className="seneca-studio-page-inner">
        <nav className="seneca-studio-breadcrumb" aria-label="Breadcrumb">
          <Link to="/settings">Settings</Link>
          <span aria-hidden>›</span>
          <span>Okta SSO</span>
        </nav>

        <header className="seneca-studio-header">
          <div>
            <h1 className="seneca-studio-title">Okta SSO</h1>
            <p className="seneca-studio-subtitle">
              Let people with @{domain || "your company domain"} sign in to Alenio through Okta for{" "}
              {organizationName || team.name}.
            </p>
          </div>
        </header>

        {!organizationId ? (
          <section className="enterprise-card">
            <h2 className="enterprise-card-title enterprise-card-title-spaced">Create organization</h2>
            <p className="enterprise-muted">
              Okta is configured on a company organization linked to this workspace. Create that once, then add your
              Okta app credentials.
            </p>
            <button
              type="button"
              className="auth-submit"
              disabled={creatingOrg}
              onClick={() => void onCreateOrg()}
              data-testid="okta-create-org"
            >
              {creatingOrg ? "Creating…" : "Create organization"}
            </button>
          </section>
        ) : (
          <form className="enterprise-card" onSubmit={(e) => void onSave(e)}>
            <h2 className="enterprise-card-title enterprise-card-title-spaced">Okta application</h2>
            <p className="enterprise-muted" style={{ marginBottom: "1rem" }}>
              In Okta Admin, create an OIDC Web application. Sign-in redirect URI must match the callback below.
            </p>

            <label className="auth-label" htmlFor="okta-callback">
              Sign-in redirect URI
            </label>
            <input
              id="okta-callback"
              className="auth-input"
              readOnly
              value={callbackUrl}
              onFocus={(e) => e.currentTarget.select()}
              data-testid="okta-callback-url"
            />

            <label className="auth-label" htmlFor="okta-issuer">
              Issuer URL
            </label>
            <input
              id="okta-issuer"
              className="auth-input"
              placeholder="https://your-org.okta.com"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              required
              data-testid="okta-issuer"
            />

            <label className="auth-label" htmlFor="okta-client-id">
              Client ID
            </label>
            <input
              id="okta-client-id"
              className="auth-input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              data-testid="okta-client-id"
            />

            <label className="auth-label" htmlFor="okta-client-secret">
              Client secret {sso?.hasClientSecret ? "(leave blank to keep current)" : ""}
            </label>
            <input
              id="okta-client-secret"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={sso?.hasClientSecret ? "••••••••" : "Required"}
              data-testid="okta-client-secret"
            />

            <label className="auth-label" htmlFor="okta-domain">
              Company email domain
            </label>
            <input
              id="okta-domain"
              className="auth-input"
              placeholder="company.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
              data-testid="okta-domain"
            />

            <label className="auth-label" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                data-testid="okta-enabled"
              />
              Enable Okta SSO for this domain
            </label>

            <label className="auth-label" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={ssoRequired}
                onChange={(e) => setSsoRequired(e.target.checked)}
                data-testid="okta-required"
              />
              Require SSO for this domain (password / Microsoft blocked later)
            </label>

            <label className="auth-label" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={markDomainVerified}
                onChange={(e) => setMarkDomainVerified(e.target.checked)}
                data-testid="okta-domain-verified"
              />
              Mark domain verified (temporary until DNS verification)
            </label>

            {error ? (
              <p className="auth-error" data-testid="okta-error">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="auth-hint" data-testid="okta-notice">
                {notice}
              </p>
            ) : null}

            <button type="submit" className="auth-submit" disabled={saving} data-testid="okta-save">
              {saving ? "Saving…" : "Save Okta settings"}
            </button>
          </form>
        )}

        {error && !organizationId ? (
          <p className="auth-error" style={{ marginTop: "1rem" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
