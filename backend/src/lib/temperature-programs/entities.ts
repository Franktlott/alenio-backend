import { prisma } from "../../prisma";
import {
  assertDraftProgram,
  assertTeamMember,
  canManageTemperaturePrograms,
  getProgramForTeam,
  loadProgramDetail,
  serializeAssignment,
  serializeCheckItem,
  serializeCorrectiveRule,
  serializeCorrectiveTemplate,
  serializeEquipment,
  serializeEquipmentGroup,
  serializeProgramDetail,
  serializeSchedule,
} from "./common";

async function requireManageDraft(teamId: string, programId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }
  const draft = await assertDraftProgram(teamId, programId);
  if (!draft.ok) return { ok: false as const, code: draft.code === "NOT_FOUND" ? "NOT_FOUND" as const : "LOCKED" as const };
  return { ok: true as const };
}

async function reorderRows<T extends { id: string }>(
  orderedIds: string[],
  rows: T[],
  update: (id: string, sortOrder: number) => Promise<unknown>,
) {
  const idSet = new Set(orderedIds);
  if (orderedIds.length !== rows.length || rows.some((row) => !idSet.has(row.id))) {
    return false;
  }
  for (const [index, id] of orderedIds.entries()) {
    await update(id, index);
  }
  return true;
}

// ── Equipment groups ──────────────────────────────────────────────────────────

export type EquipmentGroupInput = {
  name: string;
  description?: string | null;
  sortOrder?: number;
};

export async function createEquipmentGroup(teamId: string, programId: string, userId: string, input: EquipmentGroupInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false as const, code: "VALIDATION" as const };

  const count = await prisma.tempEquipmentGroup.count({ where: { programId, teamId, isActive: true } });
  const group = await prisma.tempEquipmentGroup.create({
    data: {
      programId,
      teamId,
      name,
      description: input.description?.trim().slice(0, 2000) || null,
      sortOrder: input.sortOrder ?? count,
    },
  });

  return { ok: true as const, group: serializeEquipmentGroup({ ...group, equipmentItems: [] }) };
}

export async function updateEquipmentGroup(
  teamId: string,
  programId: string,
  groupId: string,
  userId: string,
  input: Partial<EquipmentGroupInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempEquipmentGroup.findFirst({ where: { id: groupId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.name !== undefined && !input.name.trim()) return { ok: false as const, code: "VALIDATION" as const };

  const group = await prisma.tempEquipmentGroup.update({
    where: { id: groupId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim().slice(0, 2000) || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { equipmentItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { checkItems: { where: { isActive: true }, include: { correctiveRules: { include: { correctiveActionTemplate: true } } } } } } },
  });

  return { ok: true as const, group: serializeEquipmentGroup(group) };
}

export async function deactivateEquipmentGroup(teamId: string, programId: string, groupId: string, userId: string) {
  return updateEquipmentGroup(teamId, programId, groupId, userId, { isActive: false });
}

export async function reorderEquipmentGroups(teamId: string, programId: string, userId: string, orderedIds: string[]) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const rows = await prisma.tempEquipmentGroup.findMany({ where: { programId, teamId, isActive: true } });
  const ok = await reorderRows(orderedIds, rows, (id, sortOrder) =>
    prisma.tempEquipmentGroup.updateMany({ where: { id, programId, teamId }, data: { sortOrder } }),
  );
  if (!ok) return { ok: false as const, code: "VALIDATION" as const };

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };
  return { ok: true as const, program: serializeProgramDetail(program) };
}

// ── Equipment items ───────────────────────────────────────────────────────────

export type EquipmentItemInput = {
  equipmentGroupId: string;
  name: string;
  description?: string | null;
  equipmentType?: string | null;
  locationHint?: string | null;
  sortOrder?: number;
  isRequired?: boolean;
};

export async function createEquipmentItem(teamId: string, programId: string, userId: string, input: EquipmentItemInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false as const, code: "VALIDATION" as const };

  const group = await prisma.tempEquipmentGroup.findFirst({
    where: { id: input.equipmentGroupId, programId, teamId, isActive: true },
  });
  if (!group) return { ok: false as const, code: "NOT_FOUND" as const };

  const count = await prisma.tempEquipmentItem.count({
    where: { programId, teamId, equipmentGroupId: input.equipmentGroupId, isActive: true },
  });

  const equipment = await prisma.tempEquipmentItem.create({
    data: {
      programId,
      teamId,
      equipmentGroupId: input.equipmentGroupId,
      name,
      description: input.description?.trim().slice(0, 2000) || null,
      equipmentType: input.equipmentType?.trim().slice(0, 120) || null,
      locationHint: input.locationHint?.trim().slice(0, 200) || null,
      sortOrder: input.sortOrder ?? count,
      isRequired: input.isRequired ?? true,
    },
    include: { checkItems: { where: { isActive: true }, include: { correctiveRules: { include: { correctiveActionTemplate: true } } } } },
  });

  return { ok: true as const, equipment: serializeEquipment(equipment) };
}

export async function updateEquipmentItem(
  teamId: string,
  programId: string,
  equipmentId: string,
  userId: string,
  input: Partial<EquipmentItemInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempEquipmentItem.findFirst({ where: { id: equipmentId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.name !== undefined && !input.name.trim()) return { ok: false as const, code: "VALIDATION" as const };

  if (input.equipmentGroupId) {
    const group = await prisma.tempEquipmentGroup.findFirst({
      where: { id: input.equipmentGroupId, programId, teamId, isActive: true },
    });
    if (!group) return { ok: false as const, code: "NOT_FOUND" as const };
  }

  const equipment = await prisma.tempEquipmentItem.update({
    where: { id: equipmentId },
    data: {
      ...(input.equipmentGroupId !== undefined ? { equipmentGroupId: input.equipmentGroupId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim().slice(0, 2000) || null } : {}),
      ...(input.equipmentType !== undefined ? { equipmentType: input.equipmentType?.trim().slice(0, 120) || null } : {}),
      ...(input.locationHint !== undefined ? { locationHint: input.locationHint?.trim().slice(0, 200) || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { checkItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { correctiveRules: { include: { correctiveActionTemplate: true } } } } },
  });

  return { ok: true as const, equipment: serializeEquipment(equipment) };
}

export async function deactivateEquipmentItem(teamId: string, programId: string, equipmentId: string, userId: string) {
  return updateEquipmentItem(teamId, programId, equipmentId, userId, { isActive: false });
}

export async function reorderEquipmentItems(
  teamId: string,
  programId: string,
  userId: string,
  equipmentGroupId: string,
  orderedIds: string[],
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const rows = await prisma.tempEquipmentItem.findMany({
    where: { programId, teamId, equipmentGroupId, isActive: true },
  });
  const ok = await reorderRows(orderedIds, rows, (id, sortOrder) =>
    prisma.tempEquipmentItem.updateMany({ where: { id, programId, teamId, equipmentGroupId }, data: { sortOrder } }),
  );
  if (!ok) return { ok: false as const, code: "VALIDATION" as const };

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };
  return { ok: true as const, program: serializeProgramDetail(program) };
}

// ── Check items ───────────────────────────────────────────────────────────────

const CHECK_TYPES = new Set([
  "hot_holding",
  "cold_holding",
  "freezer",
  "product",
  "water_bottle",
  "equipment_surface",
]);

export type CheckItemInput = {
  equipmentId: string;
  name: string;
  instruction?: string | null;
  productName?: string | null;
  tempUnit?: "F" | "C";
  minTemp?: number | null;
  maxTemp?: number | null;
  targetTemp?: number | null;
  checkType: string;
  allowNa?: boolean;
  requireCommentIfNa?: boolean;
  requirePhoto?: boolean;
  manualEntryAllowed?: boolean;
  bluetoothProbeAllowed?: boolean;
  bluetoothProbeRequired?: boolean;
  sortOrder?: number;
};

export async function createCheckItem(teamId: string, programId: string, userId: string, input: CheckItemInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const name = input.name.trim().slice(0, 280);
  if (!name || !CHECK_TYPES.has(input.checkType)) return { ok: false as const, code: "VALIDATION" as const };

  const equipment = await prisma.tempEquipmentItem.findFirst({
    where: { id: input.equipmentId, programId, teamId, isActive: true },
  });
  if (!equipment) return { ok: false as const, code: "NOT_FOUND" as const };

  const count = await prisma.tempCheckItem.count({ where: { programId, teamId, equipmentId: input.equipmentId, isActive: true } });
  const item = await prisma.tempCheckItem.create({
    data: {
      programId,
      teamId,
      equipmentId: input.equipmentId,
      name,
      instruction: input.instruction?.trim().slice(0, 2000) || null,
      productName: input.productName?.trim().slice(0, 200) || null,
      tempUnit: input.tempUnit === "C" ? "C" : "F",
      minTemp: input.minTemp ?? null,
      maxTemp: input.maxTemp ?? null,
      targetTemp: input.targetTemp ?? null,
      checkType: input.checkType,
      allowNa: input.allowNa ?? false,
      requireCommentIfNa: input.requireCommentIfNa ?? false,
      requirePhoto: input.requirePhoto ?? false,
      manualEntryAllowed: input.manualEntryAllowed ?? true,
      bluetoothProbeAllowed: input.bluetoothProbeAllowed ?? false,
      bluetoothProbeRequired: input.bluetoothProbeRequired ?? false,
      sortOrder: input.sortOrder ?? count,
    },
    include: { correctiveRules: { include: { correctiveActionTemplate: true } } },
  });

  return { ok: true as const, checkItem: serializeCheckItem(item) };
}

export async function updateCheckItem(
  teamId: string,
  programId: string,
  checkItemId: string,
  userId: string,
  input: Partial<CheckItemInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempCheckItem.findFirst({ where: { id: checkItemId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.name !== undefined && !input.name.trim()) return { ok: false as const, code: "VALIDATION" as const };
  if (input.checkType !== undefined && !CHECK_TYPES.has(input.checkType)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const item = await prisma.tempCheckItem.update({
    where: { id: checkItemId },
    data: {
      ...(input.equipmentId !== undefined ? { equipmentId: input.equipmentId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 280) } : {}),
      ...(input.instruction !== undefined ? { instruction: input.instruction?.trim().slice(0, 2000) || null } : {}),
      ...(input.productName !== undefined ? { productName: input.productName?.trim().slice(0, 200) || null } : {}),
      ...(input.tempUnit !== undefined ? { tempUnit: input.tempUnit === "C" ? "C" : "F" } : {}),
      ...(input.minTemp !== undefined ? { minTemp: input.minTemp } : {}),
      ...(input.maxTemp !== undefined ? { maxTemp: input.maxTemp } : {}),
      ...(input.targetTemp !== undefined ? { targetTemp: input.targetTemp } : {}),
      ...(input.checkType !== undefined ? { checkType: input.checkType } : {}),
      ...(input.allowNa !== undefined ? { allowNa: input.allowNa } : {}),
      ...(input.requireCommentIfNa !== undefined ? { requireCommentIfNa: input.requireCommentIfNa } : {}),
      ...(input.requirePhoto !== undefined ? { requirePhoto: input.requirePhoto } : {}),
      ...(input.manualEntryAllowed !== undefined ? { manualEntryAllowed: input.manualEntryAllowed } : {}),
      ...(input.bluetoothProbeAllowed !== undefined ? { bluetoothProbeAllowed: input.bluetoothProbeAllowed } : {}),
      ...(input.bluetoothProbeRequired !== undefined ? { bluetoothProbeRequired: input.bluetoothProbeRequired } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { correctiveRules: { where: { isActive: true }, include: { correctiveActionTemplate: true } } },
  });

  return { ok: true as const, checkItem: serializeCheckItem(item) };
}

export async function deactivateCheckItem(teamId: string, programId: string, checkItemId: string, userId: string) {
  return updateCheckItem(teamId, programId, checkItemId, userId, { isActive: false });
}

export async function reorderCheckItems(
  teamId: string,
  programId: string,
  userId: string,
  equipmentId: string,
  orderedIds: string[],
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const rows = await prisma.tempCheckItem.findMany({ where: { programId, teamId, equipmentId, isActive: true } });
  const ok = await reorderRows(orderedIds, rows, (id, sortOrder) =>
    prisma.tempCheckItem.updateMany({ where: { id, programId, teamId, equipmentId }, data: { sortOrder } }),
  );
  if (!ok) return { ok: false as const, code: "VALIDATION" as const };

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };
  return { ok: true as const, program: serializeProgramDetail(program) };
}

// ── Schedules ─────────────────────────────────────────────────────────────────

const SCHEDULE_TYPES = new Set(["specific_times", "interval", "opening", "closing"]);

export type ScheduleInput = {
  name: string;
  scheduleType: string;
  specificTimes?: string[];
  intervalHours?: number | null;
  windowBeforeMinutes?: number;
  windowAfterMinutes?: number;
  daysOfWeek?: number[];
  timezone?: string | null;
};

export async function createSchedule(teamId: string, programId: string, userId: string, input: ScheduleInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const name = input.name.trim().slice(0, 200);
  if (!name || !SCHEDULE_TYPES.has(input.scheduleType)) return { ok: false as const, code: "VALIDATION" as const };

  const schedule = await prisma.tempCheckSchedule.create({
    data: {
      programId,
      teamId,
      name,
      scheduleType: input.scheduleType,
      specificTimes: input.specificTimes ?? [],
      intervalHours: input.intervalHours ?? null,
      windowBeforeMinutes: input.windowBeforeMinutes ?? 0,
      windowAfterMinutes: input.windowAfterMinutes ?? 0,
      daysOfWeek: input.daysOfWeek ?? [],
      timezone: input.timezone?.trim().slice(0, 64) || null,
    },
  });

  return { ok: true as const, schedule: serializeSchedule(schedule) };
}

export async function updateSchedule(
  teamId: string,
  programId: string,
  scheduleId: string,
  userId: string,
  input: Partial<ScheduleInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempCheckSchedule.findFirst({ where: { id: scheduleId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.scheduleType !== undefined && !SCHEDULE_TYPES.has(input.scheduleType)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const schedule = await prisma.tempCheckSchedule.update({
    where: { id: scheduleId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.scheduleType !== undefined ? { scheduleType: input.scheduleType } : {}),
      ...(input.specificTimes !== undefined ? { specificTimes: input.specificTimes } : {}),
      ...(input.intervalHours !== undefined ? { intervalHours: input.intervalHours } : {}),
      ...(input.windowBeforeMinutes !== undefined ? { windowBeforeMinutes: input.windowBeforeMinutes } : {}),
      ...(input.windowAfterMinutes !== undefined ? { windowAfterMinutes: input.windowAfterMinutes } : {}),
      ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone?.trim().slice(0, 64) || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return { ok: true as const, schedule: serializeSchedule(schedule) };
}

export async function deactivateSchedule(teamId: string, programId: string, scheduleId: string, userId: string) {
  return updateSchedule(teamId, programId, scheduleId, userId, { isActive: false });
}

// ── Assignments ───────────────────────────────────────────────────────────────

const ASSIGNMENT_TYPES = new Set(["company", "region", "district", "workplace"]);

export type AssignmentInput = {
  assignmentType: string;
  assignmentTargetId: string;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
};

export async function createAssignment(teamId: string, programId: string, userId: string, input: AssignmentInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  if (!ASSIGNMENT_TYPES.has(input.assignmentType) || !input.assignmentTargetId.trim()) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const assignment = await prisma.tempProgramAssignment.create({
    data: {
      programId,
      teamId,
      assignmentType: input.assignmentType,
      assignmentTargetId: input.assignmentTargetId.trim().slice(0, 128),
      effectiveStartDate: input.effectiveStartDate ? new Date(input.effectiveStartDate) : null,
      effectiveEndDate: input.effectiveEndDate ? new Date(input.effectiveEndDate) : null,
    },
  });

  return { ok: true as const, assignment: serializeAssignment(assignment) };
}

export async function updateAssignment(
  teamId: string,
  programId: string,
  assignmentId: string,
  userId: string,
  input: Partial<AssignmentInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempProgramAssignment.findFirst({ where: { id: assignmentId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.assignmentType !== undefined && !ASSIGNMENT_TYPES.has(input.assignmentType)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const assignment = await prisma.tempProgramAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(input.assignmentType !== undefined ? { assignmentType: input.assignmentType } : {}),
      ...(input.assignmentTargetId !== undefined
        ? { assignmentTargetId: input.assignmentTargetId.trim().slice(0, 128) }
        : {}),
      ...(input.effectiveStartDate !== undefined
        ? { effectiveStartDate: input.effectiveStartDate ? new Date(input.effectiveStartDate) : null }
        : {}),
      ...(input.effectiveEndDate !== undefined
        ? { effectiveEndDate: input.effectiveEndDate ? new Date(input.effectiveEndDate) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return { ok: true as const, assignment: serializeAssignment(assignment) };
}

export async function deactivateAssignment(teamId: string, programId: string, assignmentId: string, userId: string) {
  return updateAssignment(teamId, programId, assignmentId, userId, { isActive: false });
}

// ── Corrective action templates ─────────────────────────────────────────────

const ACTION_TYPES = new Set([
  "discard_product",
  "reheat_product",
  "move_product",
  "call_manager",
  "maintenance_ticket",
  "retake_temperature",
  "other",
]);

export type CorrectiveTemplateInput = {
  name: string;
  description?: string | null;
  actionType: string;
  requiresRecheck?: boolean;
  recheckDelayMinutes?: number | null;
  requiresComment?: boolean;
  requiresPhoto?: boolean;
  requiresManagerApproval?: boolean;
  closeAfterAction?: boolean;
  sortOrder?: number;
};

export async function createCorrectiveTemplate(
  teamId: string,
  programId: string,
  userId: string,
  input: CorrectiveTemplateInput,
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const name = input.name.trim().slice(0, 200);
  if (!name || !ACTION_TYPES.has(input.actionType)) return { ok: false as const, code: "VALIDATION" as const };

  const count = await prisma.tempCorrectiveActionTemplate.count({ where: { programId, teamId, isActive: true } });
  const template = await prisma.tempCorrectiveActionTemplate.create({
    data: {
      programId,
      teamId,
      name,
      description: input.description?.trim().slice(0, 2000) || null,
      actionType: input.actionType,
      requiresRecheck: input.requiresRecheck ?? false,
      recheckDelayMinutes: input.recheckDelayMinutes ?? null,
      requiresComment: input.requiresComment ?? false,
      requiresPhoto: input.requiresPhoto ?? false,
      requiresManagerApproval: input.requiresManagerApproval ?? false,
      closeAfterAction: input.closeAfterAction ?? false,
      sortOrder: input.sortOrder ?? count,
    },
  });

  return { ok: true as const, template: serializeCorrectiveTemplate(template) };
}

export async function updateCorrectiveTemplate(
  teamId: string,
  programId: string,
  templateId: string,
  userId: string,
  input: Partial<CorrectiveTemplateInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempCorrectiveActionTemplate.findFirst({ where: { id: templateId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.actionType !== undefined && !ACTION_TYPES.has(input.actionType)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const template = await prisma.tempCorrectiveActionTemplate.update({
    where: { id: templateId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim().slice(0, 2000) || null } : {}),
      ...(input.actionType !== undefined ? { actionType: input.actionType } : {}),
      ...(input.requiresRecheck !== undefined ? { requiresRecheck: input.requiresRecheck } : {}),
      ...(input.recheckDelayMinutes !== undefined ? { recheckDelayMinutes: input.recheckDelayMinutes } : {}),
      ...(input.requiresComment !== undefined ? { requiresComment: input.requiresComment } : {}),
      ...(input.requiresPhoto !== undefined ? { requiresPhoto: input.requiresPhoto } : {}),
      ...(input.requiresManagerApproval !== undefined ? { requiresManagerApproval: input.requiresManagerApproval } : {}),
      ...(input.closeAfterAction !== undefined ? { closeAfterAction: input.closeAfterAction } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return { ok: true as const, template: serializeCorrectiveTemplate(template) };
}

export async function deactivateCorrectiveTemplate(
  teamId: string,
  programId: string,
  templateId: string,
  userId: string,
) {
  return updateCorrectiveTemplate(teamId, programId, templateId, userId, { isActive: false });
}

// ── Corrective action rules ───────────────────────────────────────────────────

const CONDITION_TYPES = new Set(["below_min", "above_max", "no_reading", "equipment_unavailable"]);

export type CorrectiveRuleInput = {
  checkItemId: string;
  correctiveActionTemplateId: string;
  conditionType: string;
  isDefault?: boolean;
  sortOrder?: number;
};

export async function attachCorrectiveRule(teamId: string, programId: string, userId: string, input: CorrectiveRuleInput) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  if (!CONDITION_TYPES.has(input.conditionType)) return { ok: false as const, code: "VALIDATION" as const };

  const [checkItem, template] = await Promise.all([
    prisma.tempCheckItem.findFirst({ where: { id: input.checkItemId, programId, teamId, isActive: true } }),
    prisma.tempCorrectiveActionTemplate.findFirst({
      where: { id: input.correctiveActionTemplateId, programId, teamId, isActive: true },
    }),
  ]);
  if (!checkItem || !template) return { ok: false as const, code: "NOT_FOUND" as const };

  const count = await prisma.tempCorrectiveActionRule.count({
    where: { programId, teamId, checkItemId: input.checkItemId, isActive: true },
  });

  const rule = await prisma.tempCorrectiveActionRule.create({
    data: {
      programId,
      teamId,
      checkItemId: input.checkItemId,
      correctiveActionTemplateId: input.correctiveActionTemplateId,
      conditionType: input.conditionType,
      isDefault: input.isDefault ?? false,
      sortOrder: input.sortOrder ?? count,
    },
    include: { correctiveActionTemplate: true },
  });

  return { ok: true as const, rule: serializeCorrectiveRule(rule) };
}

export async function updateCorrectiveRule(
  teamId: string,
  programId: string,
  ruleId: string,
  userId: string,
  input: Partial<CorrectiveRuleInput> & { isActive?: boolean },
) {
  const gate = await requireManageDraft(teamId, programId, userId);
  if (!gate.ok) return gate;

  const existing = await prisma.tempCorrectiveActionRule.findFirst({ where: { id: ruleId, programId, teamId } });
  if (!existing) return { ok: false as const, code: "NOT_FOUND" as const };
  if (input.conditionType !== undefined && !CONDITION_TYPES.has(input.conditionType)) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  const rule = await prisma.tempCorrectiveActionRule.update({
    where: { id: ruleId },
    data: {
      ...(input.checkItemId !== undefined ? { checkItemId: input.checkItemId } : {}),
      ...(input.correctiveActionTemplateId !== undefined
        ? { correctiveActionTemplateId: input.correctiveActionTemplateId }
        : {}),
      ...(input.conditionType !== undefined ? { conditionType: input.conditionType } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { correctiveActionTemplate: true },
  });

  return { ok: true as const, rule: serializeCorrectiveRule(rule) };
}

export async function removeCorrectiveRule(teamId: string, programId: string, ruleId: string, userId: string) {
  return updateCorrectiveRule(teamId, programId, ruleId, userId, { isActive: false });
}

export async function assertProgramExists(teamId: string, programId: string) {
  return getProgramForTeam(teamId, programId);
}
