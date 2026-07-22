/** Okta OIDC helpers for organization SSO (authorization-code flow). */

export function resolveOktaTokenEndpoint(issuer: string): string {
  const base = issuer.replace(/\/$/, "");
  if (base.includes("/oauth2/")) return `${base}/v1/token`;
  return `${base}/oauth2/v1/token`;
}

export function resolveOktaUserInfoEndpoint(issuer: string): string {
  const base = issuer.replace(/\/$/, "");
  if (base.includes("/oauth2/")) return `${base}/v1/userinfo`;
  return `${base}/oauth2/v1/userinfo`;
}

export type OktaTokenResponse = {
  access_token: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type OktaUserClaims = {
  sub: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
};

function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function exchangeOktaAuthorizationCode(input: {
  issuer: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<OktaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });

  const res = await fetch(resolveOktaTokenEndpoint(input.issuer), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }

  if (!res.ok) {
    const err =
      (typeof json.error_description === "string" && json.error_description) ||
      (typeof json.error === "string" && json.error) ||
      `Okta token exchange failed (${res.status})`;
    throw new Error(err);
  }

  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) throw new Error("Okta did not return an access token");

  return {
    access_token: accessToken,
    id_token: typeof json.id_token === "string" ? json.id_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : undefined,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function fetchOktaUserClaims(input: {
  issuer: string;
  accessToken: string;
  idToken?: string;
  expectedNonce?: string;
}): Promise<OktaUserClaims> {
  const res = await fetch(resolveOktaUserInfoEndpoint(input.issuer), {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/json",
    },
  });
  const text = await res.text();
  let profile: Record<string, unknown> = {};
  try {
    profile = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    profile = {};
  }
  if (!res.ok) {
    throw new Error(
      (typeof profile.error_description === "string" && profile.error_description) ||
        (typeof profile.error === "string" && profile.error) ||
        `Okta userinfo failed (${res.status})`,
    );
  }

  if (input.idToken && input.expectedNonce) {
    const claims = decodeJwtPayload(input.idToken);
    const nonce = claims && typeof claims.nonce === "string" ? claims.nonce : null;
    if (nonce && nonce !== input.expectedNonce) {
      throw new Error("Okta nonce mismatch");
    }
  }

  const idClaims = input.idToken ? decodeJwtPayload(input.idToken) : null;
  const email =
    pickString(profile, "email", "preferred_username") ||
    (idClaims ? pickString(idClaims, "email", "preferred_username") : null);
  const sub =
    pickString(profile, "sub") || (idClaims ? pickString(idClaims, "sub") : null) || "";
  if (!email || !sub) {
    throw new Error("Okta did not return email and subject for this user");
  }

  const name =
    pickString(profile, "name", "preferred_username") ||
    (idClaims ? pickString(idClaims, "name") : null);

  const emailVerifiedRaw = profile.email_verified ?? idClaims?.email_verified;
  const emailVerified =
    emailVerifiedRaw === true ||
    emailVerifiedRaw === "true" ||
    // Okta org apps often omit the flag; treat present email as verified for SSO.
    emailVerifiedRaw === undefined;

  return {
    sub,
    email: email.toLowerCase(),
    name,
    emailVerified,
  };
}
