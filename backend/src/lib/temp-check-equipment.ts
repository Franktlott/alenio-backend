import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";
import { canManageTempChecks } from "./temp-checks";
import {
  type CorrectiveActionInput,
  hasCloseAction,
  hasRecheckChecklist,
  parseChecklistItemsFromJson,
  parseCorrectiveActions,
  type ParsedCorrectiveAction,
} from "./temp-check-actions";

export type TempCheckEquipmentInput = {
  name: string;
  tempMinF?: number | null;
  tempMaxF?: number | null;
  equipmentType?: string | null;
  locationGroup?: string | null;
  checkWindowStart?: string | null;
  checkWindowEnd?: string | null;
  checkFrequency?: string | null;
  allowedRoles?: string[];
  flowConfig?: unknown;
  flowStatus?: string;
  flowIsComplete?: boolean;
  autoCloseWhenInRange?: boolean;
  requireInitialsBeforeClose?: boolean;
  retakeWaitMinutes?: number;
  maxRetakes?: number;
  requireManagerNoteAfterFinalRetake?: boolean;
  correctiveActions?: CorrectiveActionInput[];
};

export type UpdateTempCheckEquipmentInput = Partial<TempCheckEquipmentInput> & {
  isActive?: boolean;
};

const equipmentInclude = {
  correctiveActions: { orderBy: { sortOrder: "asc" as const } },
} as const;

type EquipmentRow = {
  id: string;
  teamId: string;
  name: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  equipmentType: string | null;
  locationGroup: string | null;
  checkWindowStart: string | null;
  checkWindowEnd: string | null;
  checkFrequency: string | null;
  allowedRoles: unknown;
  flowConfig: unknown;
  flowStatus: string;
  flowIsComplete: boolean;
  autoCloseWhenInRange: boolean;
  requireInitialsBeforeClose: boolean;
  retakeWaitMinutes: number;
  maxRetakes: number;
  requireManagerNoteAfterFinalRetake: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  correctiveActions: {
    id: string;
    label: string;
    actionType: string;
    checklistItems: unknown;
    requireInitials: boolean;
    requireNote: boolean;
    requirePhoto: boolean;
    sortOrder: number;
  }[];
};

async function assertTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
}

function parseTemp(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function parseRetakeWaitMinutes(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 15;
  return Math.min(120, Math.max(0, Math.round(value)));
}

function parseMaxRetakes(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 2;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function parseActionLabels(raw: CorrectiveActionInput[] | undefined): ParsedCorrectiveAction[] {
  return parseCorrectiveActions(raw);
}

function parseAllowedRoles(raw: string[] | undefined): string[] {
  if (!raw?.length) return ["team_leader"];
  return raw.map((role) => role.trim()).filter(Boolean).slice(0, 10);
}

function parseEquipmentInput(input: TempCheckEquipmentInput) {
  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false as const };
  const tempMinF = parseTemp(input.tempMinF);
  const tempMaxF = parseTemp(input.tempMaxF);
  if (tempMinF != null && tempMaxF != null && tempMinF > tempMaxF) return { ok: false as const };
  const correctiveActions = parseActionLabels(input.correctiveActions);
  const isPublished = input.flowStatus === "published";
  if (
    isPublished &&
    (correctiveActions.length === 0 ||
      (!hasRecheckChecklist(correctiveActions) && !hasCloseAction(correctiveActions)))
  ) {
    return { ok: false as const };
  }
  return {
    ok: true as const,
    parsed: {
      name,
      tempMinF,
      tempMaxF,
      equipmentType: input.equipmentType?.trim().slice(0, 50) || null,
      locationGroup: input.locationGroup?.trim().slice(0, 200) || null,
      checkWindowStart: input.checkWindowStart?.trim().slice(0, 10) || null,
      checkWindowEnd: input.checkWindowEnd?.trim().slice(0, 10) || null,
      checkFrequency: input.checkFrequency?.trim().slice(0, 100) || null,
      allowedRoles: parseAllowedRoles(input.allowedRoles),
      flowConfig: input.flowConfig ?? null,
      flowStatus: input.flowStatus === "published" ? "published" : "draft",
      flowIsComplete: input.flowIsComplete === true,
      autoCloseWhenInRange: input.autoCloseWhenInRange !== false,
      requireInitialsBeforeClose: false,
      retakeWaitMinutes: parseRetakeWaitMinutes(input.retakeWaitMinutes),
      maxRetakes: parseMaxRetakes(input.maxRetakes),
      requireManagerNoteAfterFinalRetake: input.requireManagerNoteAfterFinalRetake === true,
      correctiveActions,
    },
  };
}

function serializeEquipment(equipment: EquipmentRow) {
  const allowedRoles = Array.isArray(equipment.allowedRoles)
    ? equipment.allowedRoles.filter((role): role is string => typeof role === "string")
    : ["team_leader"];
  return {
    id: equipment.id,
    teamId: equipment.teamId,
    name: equipment.name,
    tempMinF: equipment.tempMinF,
    tempMaxF: equipment.tempMaxF,
    equipmentType: equipment.equipmentType,
    locationGroup: equipment.locationGroup,
    checkWindowStart: equipment.checkWindowStart,
    checkWindowEnd: equipment.checkWindowEnd,
    checkFrequency: equipment.checkFrequency,
    allowedRoles,
    flowConfig: equipment.flowConfig,
    flowStatus: equipment.flowStatus,
    flowIsComplete: equipment.flowIsComplete,
    autoCloseWhenInRange: equipment.autoCloseWhenInRange,
    requireInitialsBeforeClose: false,
    retakeWaitMinutes: equipment.retakeWaitMinutes,
    maxRetakes: equipment.maxRetakes,
    requireManagerNoteAfterFinalRetake: equipment.requireManagerNoteAfterFinalRetake,
    sortOrder: equipment.sortOrder,
    isActive: equipment.isActive,
    createdAt: equipment.createdAt.toISOString(),
    updatedAt: equipment.updatedAt.toISOString(),
    actionCount: equipment.correctiveActions.length,
    correctiveActions: equipment.correctiveActions.map((action) => ({
      id: action.id,
      label: action.label,
      actionType: action.actionType === "retemp" ? "retemp" : "close",
      checklistItems: parseChecklistItemsFromJson(action.checklistItems),
      requireInitials: false,
      requireNote: action.requireNote,
      requirePhoto: action.requirePhoto,
      sortOrder: action.sortOrder,
    })),
  };
}

async function persistEquipmentActions(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  actions: ParsedCorrectiveAction[],
) {
  await tx.tempCheckEquipmentCorrectiveAction.deleteMany({ where: { equipmentId } });
  if (actions.length > 0) {
    await tx.tempCheckEquipmentCorrectiveAction.createMany({
      data: actions.map((action, sortOrder) => ({
        equipmentId,
        label: action.label,
        actionType: action.actionType,
        checklistItems: action.checklistItems,
        requireInitials: false,
        requireNote: action.requireNote,
        requirePhoto: action.requirePhoto,
        sortOrder,
      })),
    });
  }
}

export async function listTempCheckEquipmentForUser(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const equipment = await prisma.tempCheckEquipment.findMany({
    where: { teamId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: equipmentInclude,
  });

  return {
    ok: true as const,
    equipment: equipment.map(serializeEquipment),
    canManage: canManageTempChecks(member.role),
  };
}

export async function getTempCheckEquipmentForUser(teamId: string, equipmentId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const row = await prisma.tempCheckEquipment.findFirst({
    where: { id: equipmentId, teamId, isActive: true },
    include: equipmentInclude,
  });
  if (!row) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    equipment: serializeEquipment(row as EquipmentRow),
    canManage: canManageTempChecks(member.role),
  };
}

export async function createTempCheckEquipment(teamId: string, userId: string, input: TempCheckEquipmentInput) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };

  const parsedResult = parseEquipmentInput(input);
  if (!parsedResult.ok) return { ok: false as const, code: "VALIDATION" as const };
  const { parsed } = parsedResult;

  const count = await prisma.tempCheckEquipment.count({ where: { teamId, isActive: true } });

  const equipment = await prisma.$transaction(async (tx) => {
    const created = await tx.tempCheckEquipment.create({
      data: {
        teamId,
        name: parsed.name,
        tempMinF: parsed.tempMinF,
        tempMaxF: parsed.tempMaxF,
        equipmentType: parsed.equipmentType,
        locationGroup: parsed.locationGroup,
        checkWindowStart: parsed.checkWindowStart,
        checkWindowEnd: parsed.checkWindowEnd,
        checkFrequency: parsed.checkFrequency,
        allowedRoles: parsed.allowedRoles,
        flowConfig: parsed.flowConfig ?? undefined,
        flowStatus: parsed.flowStatus,
        flowIsComplete: parsed.flowIsComplete,
        autoCloseWhenInRange: parsed.autoCloseWhenInRange,
        requireInitialsBeforeClose: parsed.requireInitialsBeforeClose,
        retakeWaitMinutes: parsed.retakeWaitMinutes,
        maxRetakes: parsed.maxRetakes,
        requireManagerNoteAfterFinalRetake: parsed.requireManagerNoteAfterFinalRetake,
        sortOrder: count,
      },
    });
    await persistEquipmentActions(tx, created.id, parsed.correctiveActions);
    return tx.tempCheckEquipment.findUniqueOrThrow({
      where: { id: created.id },
      include: equipmentInclude,
    });
  });

  return { ok: true as const, equipment: serializeEquipment(equipment as EquipmentRow) };
}

export async function updateTempCheckEquipment(
  teamId: string,
  equipmentId: string,
  userId: string,
  input: UpdateTempCheckEquipmentInput,
) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };
  if (!canManageTempChecks(member.role)) return { ok: false as const, code: "FORBIDDEN" as const };

  const existing = await prisma.tempCheckEquipment.findFirst({
    where: { id: equipmentId, teamId, isActive: true },
    include: equipmentInclude,
  });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };

  if (input.isActive === false) {
    const equipment = await prisma.tempCheckEquipment.update({
      where: { id: equipmentId },
      data: { isActive: false },
      include: equipmentInclude,
    });
    return { ok: true as const, equipment: serializeEquipment(equipment as EquipmentRow) };
  }

  const existingRow = existing as EquipmentRow;
  const merged: TempCheckEquipmentInput = {
    name: input.name ?? existingRow.name,
    tempMinF: input.tempMinF !== undefined ? input.tempMinF : existingRow.tempMinF,
    tempMaxF: input.tempMaxF !== undefined ? input.tempMaxF : existingRow.tempMaxF,
    equipmentType: input.equipmentType !== undefined ? input.equipmentType : existingRow.equipmentType,
    locationGroup: input.locationGroup !== undefined ? input.locationGroup : existingRow.locationGroup,
    checkWindowStart: input.checkWindowStart !== undefined ? input.checkWindowStart : existingRow.checkWindowStart,
    checkWindowEnd: input.checkWindowEnd !== undefined ? input.checkWindowEnd : existingRow.checkWindowEnd,
    checkFrequency: input.checkFrequency !== undefined ? input.checkFrequency : existingRow.checkFrequency,
    allowedRoles:
      input.allowedRoles ??
      (Array.isArray(existingRow.allowedRoles)
        ? existingRow.allowedRoles.filter((role): role is string => typeof role === "string")
        : ["team_leader"]),
    flowConfig: input.flowConfig !== undefined ? input.flowConfig : existingRow.flowConfig,
    flowStatus: input.flowStatus ?? existingRow.flowStatus,
    flowIsComplete: input.flowIsComplete ?? existingRow.flowIsComplete,
    autoCloseWhenInRange: input.autoCloseWhenInRange ?? existingRow.autoCloseWhenInRange,
    requireInitialsBeforeClose: false,
    retakeWaitMinutes: input.retakeWaitMinutes ?? existingRow.retakeWaitMinutes,
    maxRetakes: input.maxRetakes ?? existingRow.maxRetakes,
    requireManagerNoteAfterFinalRetake:
      input.requireManagerNoteAfterFinalRetake ?? existingRow.requireManagerNoteAfterFinalRetake,
    correctiveActions:
      input.correctiveActions ??
      existingRow.correctiveActions.map((action) => ({
        label: action.label,
        actionType: action.actionType === "retemp" ? "retemp" : "close",
        checklistItems: parseChecklistItemsFromJson(action.checklistItems),
        requireInitials: false,
        requireNote: action.requireNote,
        requirePhoto: action.requirePhoto,
      })),
  };

  const parsedResult = parseEquipmentInput(merged);
  if (!parsedResult.ok) return { ok: false as const, code: "VALIDATION" as const };
  const { parsed } = parsedResult;

  const equipment = await prisma.$transaction(async (tx) => {
    await tx.tempCheckEquipment.update({
      where: { id: equipmentId },
      data: {
        name: parsed.name,
        tempMinF: parsed.tempMinF,
        tempMaxF: parsed.tempMaxF,
        equipmentType: parsed.equipmentType,
        locationGroup: parsed.locationGroup,
        checkWindowStart: parsed.checkWindowStart,
        checkWindowEnd: parsed.checkWindowEnd,
        checkFrequency: parsed.checkFrequency,
        allowedRoles: parsed.allowedRoles,
        flowConfig: parsed.flowConfig ?? undefined,
        flowStatus: parsed.flowStatus,
        flowIsComplete: parsed.flowIsComplete,
        autoCloseWhenInRange: parsed.autoCloseWhenInRange,
        requireInitialsBeforeClose: parsed.requireInitialsBeforeClose,
        retakeWaitMinutes: parsed.retakeWaitMinutes,
        maxRetakes: parsed.maxRetakes,
        requireManagerNoteAfterFinalRetake: parsed.requireManagerNoteAfterFinalRetake,
      },
    });
    if (input.correctiveActions !== undefined) {
      await persistEquipmentActions(tx, equipmentId, parsed.correctiveActions);
    }
    return tx.tempCheckEquipment.findUniqueOrThrow({
      where: { id: equipmentId },
      include: equipmentInclude,
    });
  });

  return { ok: true as const, equipment: serializeEquipment(equipment as EquipmentRow) };
}

export async function deleteTempCheckEquipment(teamId: string, equipmentId: string, userId: string) {
  return updateTempCheckEquipment(teamId, equipmentId, userId, { isActive: false });
}
