import { prisma } from "../../prisma";
import type { Prisma } from "@prisma/client";

export type TempProgramStatus = "draft" | "active" | "archived";

export type Result<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "LOCKED" | "INVALID_STATE";
      validation?: import("./validate").TempProgramValidationResult;
    };

export function canManageTemperaturePrograms(role: string): boolean {
  return role === "owner" || role === "team_leader";
}

export async function assertTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
}

export async function getProgramForTeam(teamId: string, programId: string) {
  return prisma.tempProgram.findFirst({
    where: { id: programId, teamId },
  });
}

export async function assertDraftProgram(teamId: string, programId: string) {
  const program = await getProgramForTeam(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };
  if (program.status !== "draft" || program.isLocked) {
    return { ok: false as const, code: "LOCKED" as const, program };
  }
  return { ok: true as const, program };
}

export const programDetailInclude = {
  equipmentGroups: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
    include: {
      equipmentItems: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" as const },
        include: {
          checkItems: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" as const },
            include: {
              correctiveRules: {
                where: { isActive: true },
                orderBy: { sortOrder: "asc" as const },
                include: {
                  correctiveActionTemplate: true,
                },
              },
            },
          },
        },
      },
    },
  },
  schedules: {
    where: { isActive: true },
    orderBy: { createdAt: "asc" as const },
  },
  assignments: {
    where: { isActive: true },
    orderBy: { createdAt: "asc" as const },
  },
  correctiveTemplates: {
    where: { isActive: true },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.TempProgramInclude;

type ProgramWithDetail = Prisma.TempProgramGetPayload<{ include: typeof programDetailInclude }>;

export function serializeCorrectiveRule(rule: ProgramWithDetail["equipmentGroups"][0]["equipmentItems"][0]["checkItems"][0]["correctiveRules"][0]) {
  return {
    id: rule.id,
    checkItemId: rule.checkItemId,
    correctiveActionTemplateId: rule.correctiveActionTemplateId,
    conditionType: rule.conditionType,
    isDefault: rule.isDefault,
    sortOrder: rule.sortOrder,
    isActive: rule.isActive,
    template: rule.correctiveActionTemplate
      ? {
          id: rule.correctiveActionTemplate.id,
          name: rule.correctiveActionTemplate.name,
          actionType: rule.correctiveActionTemplate.actionType,
          requiresRecheck: rule.correctiveActionTemplate.requiresRecheck,
          recheckDelayMinutes: rule.correctiveActionTemplate.recheckDelayMinutes,
        }
      : null,
  };
}

export function serializeCheckItem(item: ProgramWithDetail["equipmentGroups"][0]["equipmentItems"][0]["checkItems"][0]) {
  return {
    id: item.id,
    programId: item.programId,
    equipmentId: item.equipmentId,
    teamId: item.teamId,
    name: item.name,
    instruction: item.instruction,
    productName: item.productName,
    tempUnit: item.tempUnit,
    minTemp: item.minTemp,
    maxTemp: item.maxTemp,
    targetTemp: item.targetTemp,
    checkType: item.checkType,
    allowNa: item.allowNa,
    requireCommentIfNa: item.requireCommentIfNa,
    requirePhoto: item.requirePhoto,
    manualEntryAllowed: item.manualEntryAllowed,
    bluetoothProbeAllowed: item.bluetoothProbeAllowed,
    bluetoothProbeRequired: item.bluetoothProbeRequired,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
    correctiveActionRules: item.correctiveRules.map(serializeCorrectiveRule),
  };
}

export function serializeEquipment(equipment: ProgramWithDetail["equipmentGroups"][0]["equipmentItems"][0]) {
  return {
    id: equipment.id,
    programId: equipment.programId,
    equipmentGroupId: equipment.equipmentGroupId,
    teamId: equipment.teamId,
    name: equipment.name,
    description: equipment.description,
    equipmentType: equipment.equipmentType,
    locationHint: equipment.locationHint,
    sortOrder: equipment.sortOrder,
    isRequired: equipment.isRequired,
    isActive: equipment.isActive,
    checkItems: equipment.checkItems.map(serializeCheckItem),
  };
}

export function serializeEquipmentGroup(group: ProgramWithDetail["equipmentGroups"][0]) {
  return {
    id: group.id,
    programId: group.programId,
    teamId: group.teamId,
    name: group.name,
    description: group.description,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
    equipment: group.equipmentItems.map(serializeEquipment),
  };
}

export function serializeSchedule(schedule: ProgramWithDetail["schedules"][0]) {
  return {
    id: schedule.id,
    programId: schedule.programId,
    teamId: schedule.teamId,
    name: schedule.name,
    scheduleType: schedule.scheduleType,
    specificTimes: schedule.specificTimes,
    intervalHours: schedule.intervalHours,
    windowBeforeMinutes: schedule.windowBeforeMinutes,
    windowAfterMinutes: schedule.windowAfterMinutes,
    daysOfWeek: schedule.daysOfWeek,
    timezone: schedule.timezone,
    isActive: schedule.isActive,
  };
}

export function serializeAssignment(assignment: ProgramWithDetail["assignments"][0]) {
  return {
    id: assignment.id,
    programId: assignment.programId,
    teamId: assignment.teamId,
    assignmentType: assignment.assignmentType,
    assignmentTargetId: assignment.assignmentTargetId,
    effectiveStartDate: assignment.effectiveStartDate?.toISOString() ?? null,
    effectiveEndDate: assignment.effectiveEndDate?.toISOString() ?? null,
    isActive: assignment.isActive,
  };
}

export function serializeCorrectiveTemplate(template: ProgramWithDetail["correctiveTemplates"][0]) {
  return {
    id: template.id,
    programId: template.programId,
    teamId: template.teamId,
    name: template.name,
    description: template.description,
    actionType: template.actionType,
    requiresRecheck: template.requiresRecheck,
    recheckDelayMinutes: template.recheckDelayMinutes,
    requiresComment: template.requiresComment,
    requiresPhoto: template.requiresPhoto,
    requiresManagerApproval: template.requiresManagerApproval,
    closeAfterAction: template.closeAfterAction,
    sortOrder: template.sortOrder,
    isActive: template.isActive,
  };
}

export function serializeProgramSummary(program: {
  id: string;
  programFamilyId: string;
  teamId: string;
  name: string;
  description: string | null;
  status: string;
  versionNumber: number;
  isLocked: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: program.id,
    companyId: program.teamId,
    teamId: program.teamId,
    programFamilyId: program.programFamilyId,
    name: program.name,
    description: program.description,
    status: program.status,
    versionNumber: program.versionNumber,
    isLocked: program.isLocked,
    createdBy: program.createdByUserId,
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString(),
  };
}

export function serializeProgramDetail(program: ProgramWithDetail) {
  return {
    ...serializeProgramSummary(program),
    groups: program.equipmentGroups.map(serializeEquipmentGroup),
    schedules: program.schedules.map(serializeSchedule),
    assignments: program.assignments.map(serializeAssignment),
    correctiveActionTemplates: program.correctiveTemplates.map(serializeCorrectiveTemplate),
  };
}

export async function loadProgramDetail(teamId: string, programId: string) {
  return prisma.tempProgram.findFirst({
    where: { id: programId, teamId },
    include: programDetailInclude,
  });
}
