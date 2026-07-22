import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { syncAppUserFromAuth } from "./ensure-app-user";
import { normalizeEmailDomain } from "./organization-sso";
import { scimBaseUrl } from "./scim-config";

export type ScimName = {
  givenName?: string;
  familyName?: string;
  formatted?: string;
};

export type ScimEmail = {
  value?: string;
  primary?: boolean;
  type?: string;
};

export type ScimUserInput = {
  userName?: string;
  externalId?: string;
  displayName?: string;
  active?: boolean;
  name?: ScimName;
  emails?: ScimEmail[];
};

function pickEmail(input: ScimUserInput): string | null {
  const fromEmails = input.emails?.find((e) => e.primary && e.value)?.value
    || input.emails?.find((e) => e.value)?.value;
  const raw = (fromEmails || input.userName || "").trim().toLowerCase();
  if (!raw.includes("@")) return null;
  return raw;
}

function displayNameFrom(input: ScimUserInput, email: string): string {
  if (input.displayName?.trim()) return input.displayName.trim().slice(0, 200);
  const given = input.name?.givenName?.trim() ?? "";
  const family = input.name?.familyName?.trim() ?? "";
  const combined = `${given} ${family}`.trim();
  if (combined) return combined.slice(0, 200);
  if (input.name?.formatted?.trim()) return input.name.formatted.trim().slice(0, 200);
  return (email.split("@")[0] || "User").slice(0, 200);
}

async function findOrCreateAuthAndAppUser(email: string, name: string): Promise<{ id: string; email: string; name: string }> {
  const existingAuth = await prisma.$queryRawUnsafe<Array<{ id: string; email: string; name: string }>>(
    `SELECT id::text AS id, email, name FROM neon_auth."user" WHERE lower(email) = lower($1) LIMIT 1`,
    email,
  );

  let authId: string;
  if (existingAuth[0]) {
    authId = existingAuth[0].id;
    await prisma.$executeRawUnsafe(
      `UPDATE neon_auth."user"
       SET name = $2, "emailVerified" = true, banned = false, "updatedAt" = NOW()
       WHERE id = $1::uuid`,
      authId,
      name,
    );
  } else {
    authId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1::uuid, $2, $3, true, NOW(), NOW())`,
      authId,
      name,
      email,
    );
  }

  const synced = await syncAppUserFromAuth({
    id: authId,
    email,
    name,
    image: null,
  });
  if (!synced) {
    throw new Error("Failed to sync Alenio user from SCIM");
  }

  return { id: synced.user.id, email: synced.user.email, name: synced.user.name };
}

async function ensureOrgMembership(organizationId: string, userId: string) {
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, role: "org_member" },
    update: {},
  });

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  // Org owners/admins manage the enterprise — never auto-join a workspace.
  if (membership?.role === "org_owner" || membership?.role === "org_admin") return;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultTeamId: true },
  });
  if (!org?.defaultTeamId) return;

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: org.defaultTeamId } },
    select: { id: true },
  });
  if (existing) return;

  await prisma.teamMember.create({
    data: {
      userId,
      teamId: org.defaultTeamId,
      role: "member",
    },
  });
}

async function removeFromOrgDefaultTeam(organizationId: string, userId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultTeamId: true },
  });
  if (!org?.defaultTeamId) return;
  await prisma.teamMember.deleteMany({
    where: { teamId: org.defaultTeamId, userId, role: { not: "owner" } },
  });
}

async function setAuthBanned(userId: string, banned: boolean) {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE neon_auth."user" SET banned = $2, "updatedAt" = NOW() WHERE id = $1::uuid`,
      userId,
      banned,
    );
    if (banned) {
      await prisma.$executeRawUnsafe(`DELETE FROM neon_auth.session WHERE "userId" = $1::uuid`, userId);
    }
  } catch (err) {
    console.warn("[scim] could not update neon_auth banned flag", err);
  }
}

export function toScimUserResource(row: {
  id: string;
  userName: string;
  externalId: string | null;
  active: boolean;
  givenName: string | null;
  familyName: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { email: string; name: string };
}) {
  const given = row.givenName ?? "";
  const family = row.familyName ?? "";
  const formatted = row.user.name || `${given} ${family}`.trim() || row.userName;
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    externalId: row.externalId ?? undefined,
    userName: row.userName,
    displayName: formatted,
    name: {
      givenName: given || undefined,
      familyName: family || undefined,
      formatted,
    },
    emails: [
      {
        value: row.user.email,
        primary: true,
        type: "work",
      },
    ],
    active: row.active,
    meta: {
      resourceType: "User",
      created: row.createdAt.toISOString(),
      lastModified: row.updatedAt.toISOString(),
      location: `${scimBaseUrl()}/Users/${row.id}`,
    },
  };
}

export async function listScimUsers(organizationId: string, startIndex: number, count: number) {
  const safeStart = Math.max(1, startIndex);
  const safeCount = Math.min(Math.max(1, count), 200);
  const skip = safeStart - 1;

  const [totalResults, rows] = await Promise.all([
    prisma.organizationScimUser.count({ where: { organizationId } }),
    prisma.organizationScimUser.findMany({
      where: { organizationId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "asc" },
      skip,
      take: safeCount,
    }),
  ]);

  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults,
    startIndex: safeStart,
    itemsPerPage: rows.length,
    Resources: rows.map(toScimUserResource),
  };
}

export async function findScimUsersByUserName(organizationId: string, userName: string) {
  const normalized = userName.trim().toLowerCase();
  const rows = await prisma.organizationScimUser.findMany({
    where: { organizationId, userName: normalized },
    include: { user: { select: { email: true, name: true } } },
  });
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: rows.length,
    startIndex: 1,
    itemsPerPage: rows.length,
    Resources: rows.map(toScimUserResource),
  };
}

export async function getScimUser(organizationId: string, scimUserId: string) {
  return prisma.organizationScimUser.findFirst({
    where: { id: scimUserId, organizationId },
    include: { user: { select: { email: true, name: true } } },
  });
}

export async function createScimUser(
  organizationId: string,
  expectedDomain: string | null,
  input: ScimUserInput,
) {
  const email = pickEmail(input);
  if (!email) {
    return { error: { status: 400, detail: "userName or emails.value with a valid email is required" } as const };
  }

  if (expectedDomain) {
    const domain = normalizeEmailDomain(email);
    if (!domain || domain !== expectedDomain) {
      return {
        error: {
          status: 400,
          detail: `Email domain must be @${expectedDomain}`,
        } as const,
      };
    }
  }

  const existing = await prisma.organizationScimUser.findUnique({
    where: { organizationId_userName: { organizationId, userName: email } },
    select: { id: true },
  });
  if (existing) {
    return { error: { status: 409, detail: "User already exists" } as const };
  }

  const name = displayNameFrom(input, email);
  const active = input.active !== false;
  const appUser = await findOrCreateAuthAndAppUser(email, name);

  const existingByUser = await prisma.organizationScimUser.findUnique({
    where: { organizationId_userId: { organizationId, userId: appUser.id } },
    include: { user: { select: { email: true, name: true } } },
  });
  if (existingByUser) {
    return { user: existingByUser };
  }

  if (active) {
    await ensureOrgMembership(organizationId, appUser.id);
    await setAuthBanned(appUser.id, false);
  } else {
    await removeFromOrgDefaultTeam(organizationId, appUser.id);
    await setAuthBanned(appUser.id, true);
  }

  const row = await prisma.organizationScimUser.create({
    data: {
      organizationId,
      userId: appUser.id,
      userName: email,
      externalId: input.externalId?.trim() || null,
      active,
      givenName: input.name?.givenName?.trim() || null,
      familyName: input.name?.familyName?.trim() || null,
    },
    include: { user: { select: { email: true, name: true } } },
  });

  return { user: row };
}

export async function replaceScimUser(
  organizationId: string,
  scimUserId: string,
  expectedDomain: string | null,
  input: ScimUserInput,
) {
  const current = await getScimUser(organizationId, scimUserId);
  if (!current) {
    return { error: { status: 404, detail: "User not found" } as const };
  }

  const email = pickEmail(input) ?? current.userName;
  if (expectedDomain) {
    const domain = normalizeEmailDomain(email);
    if (!domain || domain !== expectedDomain) {
      return {
        error: {
          status: 400,
          detail: `Email domain must be @${expectedDomain}`,
        } as const,
      };
    }
  }

  const name = displayNameFrom(input, email);
  const active = input.active !== false;

  await prisma.user.update({
    where: { id: current.userId },
    data: {
      email,
      name,
      emailVerified: true,
    },
  });

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE neon_auth."user"
       SET email = $2, name = $3, "emailVerified" = true, banned = $4, "updatedAt" = NOW()
       WHERE id = $1::uuid`,
      current.userId,
      email,
      name,
      !active,
    );
  } catch (err) {
    console.warn("[scim] neon_auth user update failed", err);
  }

  if (active) {
    await ensureOrgMembership(organizationId, current.userId);
    await setAuthBanned(current.userId, false);
  } else {
    await removeFromOrgDefaultTeam(organizationId, current.userId);
    await setAuthBanned(current.userId, true);
  }

  const row = await prisma.organizationScimUser.update({
    where: { id: current.id },
    data: {
      userName: email,
      externalId: input.externalId !== undefined ? input.externalId?.trim() || null : current.externalId,
      active,
      givenName: input.name?.givenName?.trim() || null,
      familyName: input.name?.familyName?.trim() || null,
      updatedAt: new Date(),
    },
    include: { user: { select: { email: true, name: true } } },
  });

  return { user: row };
}

type ScimPatchOp = {
  op?: string;
  path?: string;
  value?: unknown;
};

function readActiveFromPatch(operations: ScimPatchOp[]): boolean | undefined {
  for (const op of operations) {
    const name = (op.op ?? "").toLowerCase();
    if (name !== "replace" && name !== "add") continue;

    if (!op.path || op.path === "active") {
      if (typeof op.value === "boolean") return op.value;
      if (typeof op.value === "string") return op.value.toLowerCase() === "true";
      if (op.value && typeof op.value === "object" && !Array.isArray(op.value)) {
        const active = (op.value as { active?: unknown }).active;
        if (typeof active === "boolean") return active;
        if (typeof active === "string") return active.toLowerCase() === "true";
      }
    }

    if (op.path?.toLowerCase() === "active") {
      if (typeof op.value === "boolean") return op.value;
      if (typeof op.value === "string") return op.value.toLowerCase() === "true";
    }
  }
  return undefined;
}

function readNameFromPatch(operations: ScimPatchOp[]): Partial<ScimName> {
  const out: Partial<ScimName> = {};
  for (const op of operations) {
    const name = (op.op ?? "").toLowerCase();
    if (name !== "replace" && name !== "add") continue;
    if (op.path?.toLowerCase() === "name.givenname" && typeof op.value === "string") {
      out.givenName = op.value;
    }
    if (op.path?.toLowerCase() === "name.familyname" && typeof op.value === "string") {
      out.familyName = op.value;
    }
    if ((!op.path || op.path.toLowerCase() === "name") && op.value && typeof op.value === "object") {
      const v = op.value as ScimName;
      if (typeof v.givenName === "string") out.givenName = v.givenName;
      if (typeof v.familyName === "string") out.familyName = v.familyName;
      if (typeof v.formatted === "string") out.formatted = v.formatted;
    }
    if (op.path?.toLowerCase() === "displayname" && typeof op.value === "string") {
      out.formatted = op.value;
    }
  }
  return out;
}

export async function patchScimUser(organizationId: string, scimUserId: string, operations: ScimPatchOp[]) {
  const current = await getScimUser(organizationId, scimUserId);
  if (!current) {
    return { error: { status: 404, detail: "User not found" } as const };
  }

  const nextActive = readActiveFromPatch(operations);
  const namePatch = readNameFromPatch(operations);
  const givenName = namePatch.givenName ?? current.givenName ?? "";
  const familyName = namePatch.familyName ?? current.familyName ?? "";
  const displayName =
    namePatch.formatted?.trim() ||
    `${givenName} ${familyName}`.trim() ||
    current.user.name;

  const active = nextActive === undefined ? current.active : nextActive;

  if (displayName !== current.user.name) {
    await prisma.user.update({
      where: { id: current.userId },
      data: { name: displayName.slice(0, 200) },
    });
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE neon_auth."user" SET name = $2, "updatedAt" = NOW() WHERE id = $1::uuid`,
        current.userId,
        displayName.slice(0, 200),
      );
    } catch {
      /* ignore */
    }
  }

  if (active) {
    await ensureOrgMembership(organizationId, current.userId);
    await setAuthBanned(current.userId, false);
  } else {
    await removeFromOrgDefaultTeam(organizationId, current.userId);
    await setAuthBanned(current.userId, true);
  }

  const row = await prisma.organizationScimUser.update({
    where: { id: current.id },
    data: {
      active,
      givenName: givenName || null,
      familyName: familyName || null,
      updatedAt: new Date(),
    },
    include: { user: { select: { email: true, name: true } } },
  });

  return { user: row };
}

export async function deleteScimUser(organizationId: string, scimUserId: string) {
  const current = await getScimUser(organizationId, scimUserId);
  if (!current) {
    return { error: { status: 404, detail: "User not found" } as const };
  }

  await removeFromOrgDefaultTeam(organizationId, current.userId);
  await setAuthBanned(current.userId, true);
  await prisma.organizationScimUser.update({
    where: { id: current.id },
    data: { active: false, updatedAt: new Date() },
  });

  return { ok: true as const };
}

export function parseUserNameEqFilter(filter: string | undefined): string | null {
  if (!filter?.trim()) return null;
  const match = filter.match(/userName\s+eq\s+"([^"]+)"/i) || filter.match(/userName\s+eq\s+'([^']+)'/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}
