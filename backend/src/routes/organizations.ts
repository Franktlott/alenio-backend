import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { authGuard } from "../middleware/auth-guard";
import { env } from "../env";
import {
  buildOktaAuthorizeUrl,
  decryptSsoSecret,
  encryptSsoSecret,
  normalizeEmailDomain,
  oktaCallbackUrl,
  toPublicSsoConfig,
  uniqueOrgSlug,
} from "../lib/organization-sso";
import { exchangeOktaAuthorizationCode, fetchOktaUserClaims } from "../lib/okta-oidc";
import { completeOktaSsoLogin } from "../lib/okta-sso-login";
import { webAuthCallbackUrl, webPublicBaseUrl } from "../lib/web-public-url";
import { generateScimBearerToken, toPublicScimConfig } from "../lib/scim-config";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const organizationsRouter = new Hono<{ Variables: Variables }>();
const ssoPublicRouter = new Hono();

async function requireTeamOwner(userId: string, teamId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "owner") {
    return null;
  }
  return membership;
}

async function requireOrgOwner(userId: string, organizationId: string) {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  if (membership && (membership.role === "org_owner" || membership.role === "org_admin")) {
    return membership;
  }

  // Workspace owners of any team in the org can also manage SSO during early setup.
  const ownedTeam = await prisma.teamMember.findFirst({
    where: {
      userId,
      role: "owner",
      team: { organizationId },
    },
    select: { id: true },
  });
  return ownedTeam ? { role: "org_owner" as const } : null;
}

async function loadOrgSsoBundle(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      ssoConfig: true,
      domains: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!org) return null;

  let scimConfig: {
    id: string;
    organizationId: string;
    enabled: boolean;
    tokenHash: string | null;
    tokenPrefix: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null = null;
  try {
    scimConfig = await prisma.organizationScimConfig.findUnique({ where: { organizationId } });
  } catch (err) {
    console.warn("[organizations] scimConfig unavailable (schema may be pending):", err);
  }

  return { ...org, scimConfig };
}

/** Ensure workspace has a parent Organization (owner-only). */
organizationsRouter.post(
  "/from-team/:teamId",
  authGuard,
  zValidator(
    "json",
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { teamId } = c.req.param();
    const body = c.req.valid("json");

    if (!(await requireTeamOwner(user.id, teamId))) {
      return c.json({ error: { message: "Only the workspace owner can create an organization", code: "FORBIDDEN" } }, 403);
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      return c.json({ error: { message: "Workspace not found", code: "NOT_FOUND" } }, 404);
    }

    if (team.organizationId) {
      const existing = await loadOrgSsoBundle(team.organizationId);
      if (!existing) {
        return c.json({ error: { message: "Organization missing", code: "NOT_FOUND" } }, 404);
      }
      return c.json({
        data: {
          organization: existing,
          sso: toPublicSsoConfig({
            org: existing,
            sso: existing.ssoConfig,
            domain: existing.domains[0] ?? null,
            backendUrl: env.BACKEND_URL,
          }),
        },
      });
    }

    const name = (body.name?.trim() || team.name).slice(0, 120);
    const slug = await uniqueOrgSlug(name);
    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name,
          slug,
          defaultTeamId: team.id,
          memberships: {
            create: {
              userId: user.id,
              role: "org_owner",
            },
          },
        },
      });
      await tx.team.update({
        where: { id: team.id },
        data: { organizationId: created.id },
      });
      return created;
    });

    const bundled = await loadOrgSsoBundle(org.id);
    return c.json({
      data: {
        organization: bundled,
        sso: bundled
          ? toPublicSsoConfig({
              org: bundled,
              sso: bundled.ssoConfig,
              domain: bundled.domains[0] ?? null,
              backendUrl: env.BACKEND_URL,
            })
          : null,
      },
    });
  },
);

organizationsRouter.get("/for-team/:teamId", authGuard, async (c) => {
  const user = c.get("user")!;
  const { teamId } = c.req.param();

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: user.id, teamId } },
    select: { role: true },
  });
  if (!membership) {
    return c.json({ error: { message: "Not a team member", code: "FORBIDDEN" } }, 403);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!team) {
    return c.json({ error: { message: "Workspace not found", code: "NOT_FOUND" } }, 404);
  }
  if (!team.organizationId) {
    return c.json({ data: { team, organization: null, sso: null, scim: null } });
  }

  const org = await loadOrgSsoBundle(team.organizationId);
  if (!org) {
    return c.json({ data: { team, organization: null, sso: null, scim: null } });
  }

  const canManage = membership.role === "owner" || Boolean(await requireOrgOwner(user.id, org.id));
  return c.json({
    data: {
      team,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        ssoRequired: org.ssoRequired,
      },
      sso: canManage
        ? toPublicSsoConfig({
            org,
            sso: org.ssoConfig,
            domain: org.domains[0] ?? null,
            backendUrl: env.BACKEND_URL,
          })
        : {
            enabled: Boolean(org.ssoConfig?.enabled),
            provider: org.ssoConfig?.provider ?? "okta",
            organizationName: org.name,
          },
      scim: canManage
        ? toPublicScimConfig({ organizationId: org.id, scim: org.scimConfig })
        : {
            enabled: Boolean(org.scimConfig?.enabled),
          },
    },
  });
});

organizationsRouter.put(
  "/:organizationId/sso/okta",
  authGuard,
  zValidator(
    "json",
    z.object({
      issuer: z.string().url().max(500),
      clientId: z.string().trim().min(2).max(200),
      clientSecret: z.string().trim().min(8).max(500).optional(),
      domain: z.string().trim().min(3).max(200),
      enabled: z.boolean().optional(),
      ssoRequired: z.boolean().optional(),
      /** Dev/admin: mark domain verified without DNS (temporary until DNS verification ships). */
      markDomainVerified: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId } = c.req.param();
    const body = c.req.valid("json");

    if (!(await requireOrgOwner(user.id, organizationId))) {
      return c.json({ error: { message: "Only organization owners can configure Okta SSO", code: "FORBIDDEN" } }, 403);
    }

    const domain = normalizeEmailDomain(body.domain);
    if (!domain) {
      return c.json({ error: { message: "Enter a valid email domain (e.g. company.com)", code: "VALIDATION_ERROR" } }, 400);
    }

    const issuer = body.issuer.trim().replace(/\/$/, "");
    if (!issuer.includes("okta.com") && !issuer.includes("oktapreview.com") && !issuer.includes("okta-emea.com")) {
      // Allow custom domains but warn via soft check — still accept.
    }

    const existingDomain = await prisma.organizationDomain.findUnique({ where: { domain } });
    if (existingDomain && existingDomain.organizationId !== organizationId) {
      return c.json(
        { error: { message: "That email domain is already linked to another organization", code: "CONFLICT" } },
        409,
      );
    }

    const existingSso = await prisma.organizationSsoConfig.findUnique({ where: { organizationId } });
    if (body.clientSecret === undefined && !existingSso?.clientSecretEnc) {
      return c.json(
        { error: { message: "Client secret is required the first time you save Okta settings", code: "VALIDATION_ERROR" } },
        400,
      );
    }

    const clientSecretEnc =
      body.clientSecret !== undefined ? encryptSsoSecret(body.clientSecret) : existingSso!.clientSecretEnc;

    const verifiedAt = body.markDomainVerified ? new Date() : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          ...(body.ssoRequired !== undefined ? { ssoRequired: body.ssoRequired } : {}),
          updatedAt: new Date(),
        },
      });

      await tx.organizationSsoConfig.upsert({
        where: { organizationId },
        create: {
          organizationId,
          provider: "okta",
          protocol: "oidc",
          issuer,
          clientId: body.clientId.trim(),
          clientSecretEnc,
          enabled: body.enabled ?? false,
        },
        update: {
          provider: "okta",
          protocol: "oidc",
          issuer,
          clientId: body.clientId.trim(),
          clientSecretEnc,
          ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
          updatedAt: new Date(),
        },
      });

      const currentDomains = await tx.organizationDomain.findMany({ where: { organizationId } });
      if (currentDomains.length === 0) {
        await tx.organizationDomain.create({
          data: {
            organizationId,
            domain,
            verifiedAt: verifiedAt ?? null,
          },
        });
      } else {
        const primary = currentDomains[0]!;
        await tx.organizationDomain.update({
          where: { id: primary.id },
          data: {
            domain,
            ...(verifiedAt ? { verifiedAt } : {}),
          },
        });
        // Drop extras for now (single-domain Okta setup).
        if (currentDomains.length > 1) {
          await tx.organizationDomain.deleteMany({
            where: { organizationId, id: { not: primary.id } },
          });
        }
      }
    });

    const org = await loadOrgSsoBundle(organizationId);
    return c.json({
      data: toPublicSsoConfig({
        org: org!,
        sso: org!.ssoConfig,
        domain: org!.domains[0] ?? null,
        backendUrl: env.BACKEND_URL,
      }),
    });
  },
);

organizationsRouter.get("/:organizationId/sso", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireOrgOwner(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const org = await loadOrgSsoBundle(organizationId);
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({
    data: {
      sso: toPublicSsoConfig({
        org,
        sso: org.ssoConfig,
        domain: org.domains[0] ?? null,
        backendUrl: env.BACKEND_URL,
      }),
      scim: toPublicScimConfig({ organizationId: org.id, scim: org.scimConfig }),
    },
  });
});

organizationsRouter.get("/:organizationId/scim", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();
  if (!(await requireOrgOwner(user.id, organizationId))) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const org = await loadOrgSsoBundle(organizationId);
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({
    data: toPublicScimConfig({ organizationId: org.id, scim: org.scimConfig }),
  });
});

organizationsRouter.put(
  "/:organizationId/scim",
  authGuard,
  zValidator(
    "json",
    z.object({
      enabled: z.boolean(),
    }),
  ),
  async (c) => {
    const user = c.get("user")!;
    const { organizationId } = c.req.param();
    const body = c.req.valid("json");

    if (!(await requireOrgOwner(user.id, organizationId))) {
      return c.json({ error: { message: "Only organization owners can configure SCIM", code: "FORBIDDEN" } }, 403);
    }

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) {
      return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
    }

    const existing = await prisma.organizationScimConfig.findUnique({ where: { organizationId } });
    if (body.enabled && !existing?.tokenHash) {
      return c.json(
        {
          error: {
            message: "Generate a SCIM token before enabling provisioning",
            code: "VALIDATION_ERROR",
          },
        },
        400,
      );
    }

    const scim = await prisma.organizationScimConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        enabled: body.enabled,
      },
      update: {
        enabled: body.enabled,
        updatedAt: new Date(),
      },
    });

    return c.json({
      data: toPublicScimConfig({ organizationId, scim }),
    });
  },
);

organizationsRouter.post("/:organizationId/scim/token", authGuard, async (c) => {
  const user = c.get("user")!;
  const { organizationId } = c.req.param();

  if (!(await requireOrgOwner(user.id, organizationId))) {
    return c.json({ error: { message: "Only organization owners can manage SCIM tokens", code: "FORBIDDEN" } }, 403);
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }

  const generated = generateScimBearerToken();
  const scim = await prisma.organizationScimConfig.upsert({
    where: { organizationId },
    create: {
      organizationId,
      enabled: true,
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
    },
    update: {
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      enabled: true,
      updatedAt: new Date(),
    },
  });

  return c.json({
    data: {
      ...toPublicScimConfig({ organizationId, scim }),
      token: generated.token,
    },
  });
});

/** Public: given an email, say whether Okta SSO is available. */
ssoPublicRouter.post(
  "/discover",
  zValidator(
    "json",
    z.object({
      email: z.string().email().max(320),
    }),
  ),
  async (c) => {
    const email = c.req.valid("json").email.trim().toLowerCase();
    const domain = normalizeEmailDomain(email);
    if (!domain) {
      return c.json({ data: { ssoAvailable: false } });
    }

    const domainRow = await prisma.organizationDomain.findUnique({
      where: { domain },
      include: {
        organization: {
          include: { ssoConfig: true },
        },
      },
    });

    const sso = domainRow?.organization.ssoConfig;
    const org = domainRow?.organization;
    if (!domainRow || !org || !sso || !sso.enabled || sso.provider !== "okta") {
      return c.json({ data: { ssoAvailable: false, domain } });
    }
    if (!domainRow.verifiedAt) {
      return c.json({
        data: {
          ssoAvailable: false,
          domain,
          reason: "domain_unverified",
        },
      });
    }
    if (!sso.issuer || !sso.clientId || !sso.clientSecretEnc) {
      return c.json({ data: { ssoAvailable: false, domain, reason: "incomplete_config" } });
    }

    return c.json({
      data: {
        ssoAvailable: true,
        provider: "okta",
        organizationId: org.id,
        organizationName: org.name,
        domain,
        ssoRequired: org.ssoRequired,
        startPath: `/api/sso/okta/start?organizationId=${encodeURIComponent(org.id)}&email=${encodeURIComponent(email)}`,
      },
    });
  },
);

/** Start Okta OIDC (browser redirect). */
ssoPublicRouter.get("/okta/start", async (c) => {
  const organizationId = (c.req.query("organizationId") ?? "").trim();
  const email = (c.req.query("email") ?? "").trim().toLowerCase();
  if (!organizationId) {
    return c.json({ error: { message: "organizationId required", code: "VALIDATION_ERROR" } }, 400);
  }

  const org = await loadOrgSsoBundle(organizationId);
  const sso = org?.ssoConfig;
  const domain = org?.domains[0];
  if (!org || !sso?.enabled || sso.provider !== "okta" || !sso.issuer || !sso.clientId || !sso.clientSecretEnc) {
    return c.json({ error: { message: "Okta SSO is not enabled for this organization", code: "NOT_FOUND" } }, 404);
  }
  if (!domain?.verifiedAt) {
    return c.json({ error: { message: "Email domain is not verified yet", code: "FORBIDDEN" } }, 403);
  }

  // Keep secret decryptable so misconfigured encryption fails early.
  try {
    decryptSsoSecret(sso.clientSecretEnc);
  } catch {
    return c.json({ error: { message: "Okta client secret could not be decrypted", code: "CONFIG_ERROR" } }, 500);
  }

  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const redirectUri = oktaCallbackUrl(env.BACKEND_URL);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const statePayload = JSON.stringify({
    organizationId,
    email: email || null,
    nonce,
    redirectUri,
  });

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SsoOidcState" (
      "id" TEXT NOT NULL,
      "state" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SsoOidcState_pkey" PRIMARY KEY ("id")
    );
  `).catch(() => undefined);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SsoOidcState_state_key" ON "SsoOidcState"("state");
  `).catch(() => undefined);

  await prisma.$executeRawUnsafe(
    `INSERT INTO "SsoOidcState" ("id", "state", "payload", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4::timestamptz, NOW())
     ON CONFLICT ("state") DO UPDATE SET "payload" = EXCLUDED."payload", "expiresAt" = EXCLUDED."expiresAt"`,
    randomBytes(12).toString("hex"),
    state,
    statePayload,
    expiresAt.toISOString(),
  );
  const authorizeUrl = buildOktaAuthorizeUrl({
    issuer: sso.issuer,
    clientId: sso.clientId,
    redirectUri,
    state,
    nonce,
    loginHint: email || undefined,
  });

  return c.redirect(authorizeUrl, 302);
});

/** Okta OIDC callback — exchange code, create Alenio session, hand off to web. */
ssoPublicRouter.get("/callback/okta", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const oauthError = c.req.query("error");
  const webBase = webPublicBaseUrl();
  const loginError = (message: string) =>
    c.redirect(`${webBase}/login?sso=error&message=${encodeURIComponent(message)}`, 302);

  if (oauthError) {
    return loginError(c.req.query("error_description") || oauthError);
  }
  if (!code || !state) {
    return loginError("Missing Okta authorization code");
  }

  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "payload", "expiresAt" FROM "SsoOidcState" WHERE "state" = $1 LIMIT 1`,
    state,
  ).catch(() => [])) as Array<{ payload: string; expiresAt: Date }>;

  const row = rows[0];
  if (!row || new Date(row.expiresAt).getTime() < Date.now()) {
    return loginError("SSO session expired. Try again.");
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "SsoOidcState" WHERE "state" = $1`, state).catch(() => undefined);

  let parsed: { organizationId: string; email: string | null; nonce: string; redirectUri: string };
  try {
    parsed = JSON.parse(row.payload);
  } catch {
    return loginError("Invalid SSO state");
  }

  const org = await loadOrgSsoBundle(parsed.organizationId);
  const sso = org?.ssoConfig;
  const domain = org?.domains[0];
  if (!org || !sso?.issuer || !sso.clientId || !sso.clientSecretEnc || !domain?.domain) {
    return loginError("Okta config missing");
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSsoSecret(sso.clientSecretEnc);
  } catch {
    return loginError("Okta client secret could not be decrypted");
  }

  try {
    const tokens = await exchangeOktaAuthorizationCode({
      issuer: sso.issuer,
      clientId: sso.clientId,
      clientSecret,
      code,
      redirectUri: parsed.redirectUri || oktaCallbackUrl(env.BACKEND_URL),
    });
    const claims = await fetchOktaUserClaims({
      issuer: sso.issuer,
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      expectedNonce: parsed.nonce,
    });
    const login = await completeOktaSsoLogin({
      organizationId: org.id,
      expectedDomain: domain.domain,
      claims,
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
    });
    if (!login.ok) {
      return loginError(login.message);
    }

    const callback = new URL(webAuthCallbackUrl());
    callback.hash = new URLSearchParams({ auth_token: login.token }).toString();
    return c.redirect(callback.toString(), 302);
  } catch (err) {
    console.error("[okta-sso] callback failed:", err);
    return loginError(err instanceof Error ? err.message : "Okta sign-in failed");
  }
});

export { organizationsRouter, ssoPublicRouter };
