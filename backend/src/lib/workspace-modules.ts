import type { WorkspaceModule } from "@prisma/client";
import { prisma } from "../prisma";
import { findTeamByGoHubToken } from "./go-hub";

export type ModuleStatus = "inactive" | "active";
export type OperatingMode = "testing" | "live";

export type ModuleValidationCheckKey =
  | "equipment"
  | "standards"
  | "schedules"
  | "assignments"
  | "corrective_actions"
  | "permissions";

export type ModuleValidationCheck = {
  key: string;
  label: string;
};

export type ModuleDefinition = {
  moduleKey: string;
  moduleName: string;
  description: string;
  icon: "checklists" | "briefings" | "walks" | "temp";
  tone: "indigo" | "cyan" | "violet" | "amber" | "emerald";
  baseHref: string;
  /** Checks that must pass before switching from testing to live. */
  validationChecks: ModuleValidationCheck[];
};

/**
 * Registry of lifecycle-managed Alenio modules. Infrastructure surfaces
 * (workplace alerts, linked devices) are always available and are NOT listed here.
 */
export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    moduleKey: "temp-checks",
    moduleName: "Temperature Checks",
    description: "Configure in Go; associates take checks in the Alenio Temps app.",
    icon: "temp",
    tone: "emerald",
    baseHref: "/go/temp-checks/module",
    validationChecks: [
      { key: "equipment", label: "Equipment configured" },
      { key: "standards", label: "Temperature standards configured" },
      { key: "schedules", label: "Schedules configured" },
      { key: "assignments", label: "Assignments configured" },
      { key: "corrective_actions", label: "Corrective actions configured" },
      { key: "permissions", label: "Required permissions configured" },
    ],
  },
  {
    moduleKey: "checklists",
    moduleName: "Checklists",
    description: "Floor checklists module.",
    icon: "checklists",
    tone: "cyan",
    baseHref: "/go/checklists",
    validationChecks: [
      { key: "assignments", label: "Assignments configured" },
      { key: "schedules", label: "Schedules configured" },
      { key: "permissions", label: "Required permissions configured" },
    ],
  },
  {
    moduleKey: "briefings",
    moduleName: "Briefings",
    description: "Review & initial documents.",
    icon: "briefings",
    tone: "amber",
    baseHref: "/go/briefings",
    validationChecks: [
      { key: "assignments", label: "Assignments configured" },
      { key: "permissions", label: "Required permissions configured" },
    ],
  },
  {
    moduleKey: "walks",
    moduleName: "Walks",
    description: "Structured manager observations with saved walk history.",
    icon: "walks",
    tone: "violet",
    baseHref: "/go/walks",
    validationChecks: [
      { key: "assignments", label: "Assignments configured" },
      { key: "permissions", label: "Required permissions configured" },
    ],
  },
];

export function getModuleDefinition(moduleKey: string): ModuleDefinition | null {
  return MODULE_DEFINITIONS.find((m) => m.moduleKey === moduleKey) ?? null;
}

/** Owners and team leaders manage module lifecycle. */
export async function canManageModules(teamId: string, userId: string): Promise<boolean> {
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!membership) return false;
  return membership.role === "owner" || membership.role === "team_leader";
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    return [];
  } catch {
    return [];
  }
}

function serializeStringArray(values: string[] | undefined | null): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify(Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))));
}

export type TestingAccess = {
  requireTestCode: boolean;
  testAccessCode: string | null;
  testCodeExpiresAt: string | null;
  allowedTestingWorkplaceIds: string[];
  allowedTestingUserIds: string[];
  allowedTestingRoles: string[];
};

export type WorkspaceModuleDTO = {
  moduleKey: string;
  moduleName: string;
  description: string;
  icon: string;
  tone: string;
  baseHref: string;
  status: ModuleStatus;
  operatingMode: OperatingMode | null;
  setupProgressPercent: number;
  setupCompletedAt: string | null;
  activatedAt: string | null;
  liveStartedAt: string | null;
  testingStartedAt: string | null;
  testingAccess: TestingAccess;
  updatedAt: string;
};

export function toModuleDTO(def: ModuleDefinition, row: WorkspaceModule | null): WorkspaceModuleDTO {
  return {
    moduleKey: def.moduleKey,
    moduleName: def.moduleName,
    description: def.description,
    icon: def.icon,
    tone: def.tone,
    baseHref: def.baseHref,
    status: (row?.status as ModuleStatus) ?? "inactive",
    operatingMode: (row?.operatingMode as OperatingMode | null) ?? null,
    setupProgressPercent: row?.setupProgressPercent ?? 0,
    setupCompletedAt: row?.setupCompletedAt?.toISOString() ?? null,
    activatedAt: row?.activatedAt?.toISOString() ?? null,
    liveStartedAt: row?.liveStartedAt?.toISOString() ?? null,
    testingStartedAt: row?.testingStartedAt?.toISOString() ?? null,
    testingAccess: {
      requireTestCode: row?.requireTestCode ?? false,
      testAccessCode: row?.testAccessCode ?? null,
      testCodeExpiresAt: row?.testCodeExpiresAt?.toISOString() ?? null,
      allowedTestingWorkplaceIds: parseStringArray(row?.allowedTestingWorkplaceIds),
      allowedTestingUserIds: parseStringArray(row?.allowedTestingUserIds),
      allowedTestingRoles: parseStringArray(row?.allowedTestingRoles),
    },
    updatedAt: row?.updatedAt?.toISOString() ?? new Date(0).toISOString(),
  };
}

/** Load (or lazily represent) all lifecycle modules for a workspace. */
export async function listWorkspaceModules(teamId: string): Promise<WorkspaceModuleDTO[]> {
  const rows = await prisma.workspaceModule.findMany({ where: { teamId } });
  const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
  return MODULE_DEFINITIONS.map((def) => toModuleDTO(def, byKey.get(def.moduleKey) ?? null));
}

export async function getWorkspaceModule(
  teamId: string,
  moduleKey: string,
): Promise<WorkspaceModuleDTO | null> {
  const def = getModuleDefinition(moduleKey);
  if (!def) return null;
  const row = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  return toModuleDTO(def, row);
}

/** Ensure a row exists for a module (created inactive by default). */
async function ensureModuleRow(teamId: string, moduleKey: string): Promise<WorkspaceModule> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  const existing = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  if (existing) return existing;
  return prisma.workspaceModule.create({
    data: {
      teamId,
      companyId: teamId,
      moduleKey,
      moduleName: def.moduleName,
      status: "inactive",
      operatingMode: null,
    },
  });
}

export async function setModuleStatus(
  teamId: string,
  moduleKey: string,
  status: ModuleStatus,
  userId: string,
): Promise<WorkspaceModuleDTO> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  await ensureModuleRow(teamId, moduleKey);
  const now = new Date();

  if (status === "inactive") {
    // Deactivate: clear operating mode (inactive modules never have a mode).
    const row = await prisma.workspaceModule.update({
      where: { teamId_moduleKey: { teamId, moduleKey } },
      data: { status: "inactive", operatingMode: null },
    });
    return toModuleDTO(def, row);
  }

  // Activate: default operating mode is testing; record activation + testing start.
  const current = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  const row = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data: {
      status: "active",
      operatingMode: "testing",
      activatedAt: current?.activatedAt ?? now,
      activatedByUserId: current?.activatedByUserId ?? userId,
      testingStartedAt: now,
      testingStartedByUserId: userId,
    },
  });
  return toModuleDTO(def, row);
}

export type SetOperatingModeResult =
  | { ok: true; module: WorkspaceModuleDTO }
  | { ok: false; code: "MODULE_INACTIVE" | "VALIDATION_FAILED"; validation?: ModuleValidationResult };

export async function goLive(
  teamId: string,
  moduleKey: string,
  userId: string,
): Promise<SetOperatingModeResult> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  const row = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  if (!row || row.status !== "active") {
    return { ok: false, code: "MODULE_INACTIVE" };
  }
  const validation = await validateModule(teamId, moduleKey);
  if (!validation.passed) {
    return { ok: false, code: "VALIDATION_FAILED", validation };
  }
  const updated = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data: {
      operatingMode: "live",
      liveStartedAt: new Date(),
      liveStartedByUserId: userId,
    },
  });
  return { ok: true, module: toModuleDTO(def, updated) };
}

export async function switchToTesting(
  teamId: string,
  moduleKey: string,
  userId: string,
): Promise<SetOperatingModeResult> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  const row = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  if (!row || row.status !== "active") {
    return { ok: false, code: "MODULE_INACTIVE" };
  }
  const updated = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data: {
      operatingMode: "testing",
      testingStartedAt: new Date(),
      testingStartedByUserId: userId,
    },
  });
  return { ok: true, module: toModuleDTO(def, updated) };
}

export type TestingAccessPatch = {
  requireTestCode?: boolean;
  testAccessCode?: string | null;
  testCodeExpiresAt?: string | null;
  allowedTestingWorkplaceIds?: string[];
  allowedTestingUserIds?: string[];
  allowedTestingRoles?: string[];
};

export async function updateTestingAccess(
  teamId: string,
  moduleKey: string,
  patch: TestingAccessPatch,
): Promise<WorkspaceModuleDTO> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  await ensureModuleRow(teamId, moduleKey);

  const data: Record<string, unknown> = {};
  if (patch.requireTestCode !== undefined) data.requireTestCode = patch.requireTestCode;
  if (patch.testAccessCode !== undefined) {
    data.testAccessCode = patch.testAccessCode?.trim() ? patch.testAccessCode.trim() : null;
  }
  if (patch.testCodeExpiresAt !== undefined) {
    data.testCodeExpiresAt = patch.testCodeExpiresAt ? new Date(patch.testCodeExpiresAt) : null;
  }
  if (patch.allowedTestingWorkplaceIds !== undefined) {
    data.allowedTestingWorkplaceIds = serializeStringArray(patch.allowedTestingWorkplaceIds);
  }
  if (patch.allowedTestingUserIds !== undefined) {
    data.allowedTestingUserIds = serializeStringArray(patch.allowedTestingUserIds);
  }
  if (patch.allowedTestingRoles !== undefined) {
    data.allowedTestingRoles = serializeStringArray(patch.allowedTestingRoles);
  }

  const row = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data,
  });
  return toModuleDTO(def, row);
}

export function generateTestCode(): string {
  // 6-char uppercase alphanumeric, no ambiguous chars.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function setGeneratedTestCode(
  teamId: string,
  moduleKey: string,
): Promise<WorkspaceModuleDTO> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  await ensureModuleRow(teamId, moduleKey);
  const code = generateTestCode();
  const row = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data: { testAccessCode: code, requireTestCode: true },
  });
  return toModuleDTO(def, row);
}

export async function setSetupProgress(
  teamId: string,
  moduleKey: string,
  percent: number,
): Promise<WorkspaceModuleDTO> {
  const def = getModuleDefinition(moduleKey);
  if (!def) throw new Error("UNKNOWN_MODULE");
  await ensureModuleRow(teamId, moduleKey);
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const row = await prisma.workspaceModule.update({
    where: { teamId_moduleKey: { teamId, moduleKey } },
    data: {
      setupProgressPercent: clamped,
      setupCompletedAt: clamped >= 100 ? new Date() : null,
    },
  });
  return toModuleDTO(def, row);
}

export type ModuleValidationResult = {
  passed: boolean;
  checks: { key: string; label: string; passed: boolean }[];
  errors: string[];
};

/**
 * Validation hook run before Go Live.
 *
 * NOTE: The underlying module configuration surfaces (equipment, standards,
 * schedules, etc.) are not built yet, so checks are derived from setup progress
 * as a deterministic placeholder. Replace each check with a real config lookup
 * when the module's setup flow is implemented.
 */
export async function validateModule(
  teamId: string,
  moduleKey: string,
): Promise<ModuleValidationResult> {
  const def = getModuleDefinition(moduleKey);
  if (!def) return { passed: false, checks: [], errors: ["Unknown module"] };

  const row = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId, moduleKey } },
  });
  const progress = row?.setupProgressPercent ?? 0;
  const total = def.validationChecks.length;

  const checks = def.validationChecks.map((check, index) => {
    const threshold = Math.ceil(((index + 1) / total) * 100);
    return { key: check.key, label: check.label, passed: progress >= threshold };
  });

  const errors = checks.filter((c) => !c.passed).map((c) => `${c.label} is incomplete.`);
  return { passed: errors.length === 0, checks, errors };
}

// ── Public (Alenio Go kiosk) surface ────────────────────────────────────────

export type KioskModule = {
  moduleKey: string;
  moduleName: string;
  description: string;
  icon: string;
  tone: string;
  baseHref: string;
  operatingMode: OperatingMode;
  /** Testing modules that require a code before opening. */
  requireTestCode: boolean;
};

/**
 * Modules a floor device should see:
 * - inactive → hidden
 * - active + live → shown normally
 * - active + testing → shown (test-code gate handled client-side via requireTestCode)
 */
export async function listKioskModulesForDevice(
  hubToken: string,
): Promise<{ ok: false } | { ok: true; modules: KioskModule[] }> {
  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false };

  const rows = await prisma.workspaceModule.findMany({
    where: { teamId: team.id, status: "active" },
  });

  const modules: KioskModule[] = [];
  for (const row of rows) {
    const def = getModuleDefinition(row.moduleKey);
    if (!def) continue;
    const mode = (row.operatingMode as OperatingMode | null) ?? "testing";
    modules.push({
      moduleKey: def.moduleKey,
      moduleName: def.moduleName,
      description: def.description,
      icon: def.icon,
      tone: def.tone,
      baseHref: def.baseHref,
      operatingMode: mode,
      requireTestCode: mode === "testing" && row.requireTestCode && !!row.testAccessCode,
    });
  }
  return { ok: true, modules };
}

export async function verifyModuleTestCode(
  hubToken: string,
  moduleKey: string,
  code: string,
): Promise<{ ok: boolean; reason?: "not_found" | "invalid" | "expired" }> {
  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false, reason: "not_found" };
  const row = await prisma.workspaceModule.findUnique({
    where: { teamId_moduleKey: { teamId: team.id, moduleKey } },
  });
  if (!row || row.status !== "active" || row.operatingMode !== "testing") {
    return { ok: false, reason: "not_found" };
  }
  if (row.testCodeExpiresAt && row.testCodeExpiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (!row.testAccessCode || row.testAccessCode.trim().toUpperCase() !== code.trim().toUpperCase()) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true };
}
