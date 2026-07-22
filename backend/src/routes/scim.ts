import { Hono } from "hono";
import { findOrgByScimBearerToken } from "../lib/scim-config";
import {
  createScimUser,
  deleteScimUser,
  findScimUsersByUserName,
  getScimUser,
  listScimUsers,
  parseUserNameEqFilter,
  patchScimUser,
  replaceScimUser,
  toScimUserResource,
  type ScimUserInput,
} from "../lib/scim-users";

const scimRouter = new Hono();

function scimError(status: number, detail: string) {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    detail,
    status: String(status),
  };
}

async function requireScimOrg(authorization: string | undefined) {
  const config = await findOrgByScimBearerToken(authorization);
  if (!config) return null;
  return {
    organizationId: config.organizationId,
    domain: config.organization.domains[0]?.domain ?? null,
  };
}

scimRouter.get("/ServiceProviderConfig", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  return c.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://alenio.com",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "Authentication using a bearer token issued in Alenio organization settings",
        specUri: "https://www.rfc-editor.org/rfc/rfc6750",
        primary: true,
      },
    ],
  });
});

scimRouter.get("/Schemas", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);
  return c.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [
      {
        id: "urn:ietf:params:scim:schemas:core:2.0:User",
        name: "User",
        description: "User Account",
        attributes: [
          { name: "userName", type: "string", required: true, uniqueness: "server" },
          { name: "name", type: "complex", required: false },
          { name: "displayName", type: "string", required: false },
          { name: "emails", type: "complex", multiValued: true, required: false },
          { name: "active", type: "boolean", required: false },
          { name: "externalId", type: "string", required: false },
        ],
        meta: { resourceType: "Schema" },
      },
    ],
  });
});

scimRouter.get("/ResourceTypes", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);
  return c.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: 1,
    startIndex: 1,
    itemsPerPage: 1,
    Resources: [
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "User",
        name: "User",
        endpoint: "/Users",
        description: "User Account",
        schema: "urn:ietf:params:scim:schemas:core:2.0:User",
        meta: { location: "/ResourceTypes/User", resourceType: "ResourceType" },
      },
    ],
  });
});

scimRouter.get("/Users", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  const filter = c.req.query("filter");
  const userName = parseUserNameEqFilter(filter);
  if (userName) {
    return c.json(await findScimUsersByUserName(org.organizationId, userName));
  }

  const startIndex = Number(c.req.query("startIndex") ?? "1") || 1;
  const count = Number(c.req.query("count") ?? "100") || 100;
  return c.json(await listScimUsers(org.organizationId, startIndex, count));
});

scimRouter.get("/Users/:id", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  const row = await getScimUser(org.organizationId, c.req.param("id"));
  if (!row) return c.json(scimError(404, "User not found"), 404);
  return c.json(toScimUserResource(row));
});

scimRouter.post("/Users", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  const body = (await c.req.json().catch(() => null)) as ScimUserInput | null;
  if (!body) return c.json(scimError(400, "Invalid JSON body"), 400);

  try {
    const result = await createScimUser(org.organizationId, org.domain, body);
    if ("error" in result && result.error) {
      return c.json(scimError(result.error.status, result.error.detail), result.error.status as 400);
    }
    return c.json(toScimUserResource(result.user!), 201);
  } catch (err) {
    console.error("[scim] create user failed:", err);
    return c.json(scimError(500, err instanceof Error ? err.message : "SCIM create failed"), 500);
  }
});

scimRouter.put("/Users/:id", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  const body = (await c.req.json().catch(() => null)) as ScimUserInput | null;
  if (!body) return c.json(scimError(400, "Invalid JSON body"), 400);

  try {
    const result = await replaceScimUser(org.organizationId, c.req.param("id"), org.domain, body);
    if ("error" in result && result.error) {
      return c.json(scimError(result.error.status, result.error.detail), result.error.status as 400);
    }
    return c.json(toScimUserResource(result.user!));
  } catch (err) {
    console.error("[scim] replace user failed:", err);
    return c.json(scimError(500, err instanceof Error ? err.message : "SCIM update failed"), 500);
  }
});

scimRouter.patch("/Users/:id", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  const body = (await c.req.json().catch(() => null)) as {
    Operations?: Array<{ op?: string; path?: string; value?: unknown }>;
  } | null;
  const operations = body?.Operations;
  if (!Array.isArray(operations) || operations.length === 0) {
    return c.json(scimError(400, "Operations array is required"), 400);
  }

  try {
    const result = await patchScimUser(org.organizationId, c.req.param("id"), operations);
    if ("error" in result && result.error) {
      return c.json(scimError(result.error.status, result.error.detail), result.error.status as 400);
    }
    return c.json(toScimUserResource(result.user!));
  } catch (err) {
    console.error("[scim] patch user failed:", err);
    return c.json(scimError(500, err instanceof Error ? err.message : "SCIM patch failed"), 500);
  }
});

scimRouter.delete("/Users/:id", async (c) => {
  const org = await requireScimOrg(c.req.header("authorization"));
  if (!org) return c.json(scimError(401, "Unauthorized"), 401);

  try {
    const result = await deleteScimUser(org.organizationId, c.req.param("id"));
    if ("error" in result && result.error) {
      return c.json(scimError(result.error.status, result.error.detail), result.error.status as 400);
    }
    return c.body(null, 204);
  } catch (err) {
    console.error("[scim] delete user failed:", err);
    return c.json(scimError(500, err instanceof Error ? err.message : "SCIM delete failed"), 500);
  }
});

export { scimRouter };
