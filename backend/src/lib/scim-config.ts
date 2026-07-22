import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../prisma";
import { env } from "../env";

export function scimBaseUrl(backendUrl = env.BACKEND_URL): string {
  return `${backendUrl.replace(/\/$/, "")}/scim/v2`;
}

export function hashScimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateScimBearerToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `alenio_scim_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashScimToken(token),
    tokenPrefix: token.slice(0, 16),
  };
}

export type PublicScimConfig = {
  enabled: boolean;
  hasToken: boolean;
  tokenPrefix: string | null;
  baseUrl: string;
  organizationId: string;
};

export function toPublicScimConfig(input: {
  organizationId: string;
  scim: { enabled: boolean; tokenHash: string | null; tokenPrefix: string | null } | null;
}): PublicScimConfig {
  return {
    enabled: Boolean(input.scim?.enabled),
    hasToken: Boolean(input.scim?.tokenHash),
    tokenPrefix: input.scim?.tokenPrefix ?? null,
    baseUrl: scimBaseUrl(),
    organizationId: input.organizationId,
  };
}

export async function findOrgByScimBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const tokenHash = hashScimToken(token);
  const config = await prisma.organizationScimConfig.findFirst({
    where: { tokenHash, enabled: true },
    include: {
      organization: {
        include: {
          domains: { orderBy: { createdAt: "asc" }, take: 1 },
        },
      },
    },
  });
  if (!config?.organization || config.organization.status !== "active") return null;
  return config;
}
