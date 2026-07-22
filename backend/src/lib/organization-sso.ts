import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma";
import { encryptSecret, decryptSecret } from "./calendar-token-crypto";

export function normalizeEmailDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const domain = raw.includes("@") ? raw.split("@").pop() ?? "" : raw;
  const cleaned = domain.replace(/^@+/, "").replace(/\.+$/, "").trim();
  if (!cleaned || !cleaned.includes(".") || /\s/.test(cleaned)) return null;
  return cleaned;
}

export function slugifyOrgName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `org-${randomBytes(3).toString("hex")}`;
}

export async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugifyOrgName(name);
  for (let i = 0; i < 8; i++) {
    const slug = i === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const existing = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function encryptSsoSecret(plain: string): string {
  return encryptSecret(plain);
}

export function decryptSsoSecret(payload: string): string {
  return decryptSecret(payload);
}

export function maskSecretPresent(enc: string | null | undefined): boolean {
  return Boolean(enc && enc.length > 0);
}

export function oktaCallbackUrl(backendUrl: string): string {
  return `${backendUrl.replace(/\/$/, "")}/api/sso/callback/okta`;
}

/** Prefer Okta custom authorization server when issuer includes /oauth2/. */
export function resolveOktaAuthorizeEndpoint(issuer: string): string {
  const base = issuer.replace(/\/$/, "");
  if (base.includes("/oauth2/")) {
    return `${base}/v1/authorize`;
  }
  return `${base}/oauth2/v1/authorize`;
}

export function buildOktaAuthorizeUrl(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  loginHint?: string;
}): string {
  const url = new URL(resolveOktaAuthorizeEndpoint(input.issuer));
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export function hashSsoState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export type PublicSsoConfig = {
  provider: string;
  protocol: string;
  enabled: boolean;
  issuer: string | null;
  clientId: string | null;
  hasClientSecret: boolean;
  domain: string | null;
  domainVerified: boolean;
  ssoRequired: boolean;
  organizationId: string;
  organizationName: string;
  callbackUrl: string;
};

export function toPublicSsoConfig(input: {
  org: { id: string; name: string; ssoRequired: boolean };
  sso: {
    provider: string;
    protocol: string;
    enabled: boolean;
    issuer: string | null;
    clientId: string | null;
    clientSecretEnc: string | null;
  } | null;
  domain: { domain: string; verifiedAt: Date | null } | null;
  backendUrl: string;
}): PublicSsoConfig {
  return {
    provider: input.sso?.provider ?? "okta",
    protocol: input.sso?.protocol ?? "oidc",
    enabled: Boolean(input.sso?.enabled),
    issuer: input.sso?.issuer ?? null,
    clientId: input.sso?.clientId ?? null,
    hasClientSecret: maskSecretPresent(input.sso?.clientSecretEnc),
    domain: input.domain?.domain ?? null,
    domainVerified: Boolean(input.domain?.verifiedAt),
    ssoRequired: input.org.ssoRequired,
    organizationId: input.org.id,
    organizationName: input.org.name,
    callbackUrl: oktaCallbackUrl(input.backendUrl),
  };
}
