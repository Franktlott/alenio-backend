import { randomUUID } from "crypto";
import { prisma } from "../../prisma";
import {
  assertDraftProgram,
  assertTeamMember,
  canManageTemperaturePrograms,
  loadProgramDetail,
  serializeProgramDetail,
  serializeProgramSummary,
  type Result,
} from "./common";
import { loadProgramTreeForClone, validateTempProgram } from "./validate";

export type CreateTempProgramInput = {
  name: string;
  description?: string | null;
};

export type UpdateTempProgramInput = {
  name?: string;
  description?: string | null;
};

export async function listTempProgramsForUser(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const programs = await prisma.tempProgram.findMany({
    where: { teamId },
    orderBy: [{ programFamilyId: "desc" }, { versionNumber: "desc" }],
  });

  return {
    ok: true as const,
    programs: programs.map(serializeProgramSummary),
    canManage: canManageTemperaturePrograms(member.role),
  };
}

export async function getTempProgramForUser(teamId: string, programId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    program: serializeProgramDetail(program),
    canManage: canManageTemperaturePrograms(member.role),
  };
}

export async function createTempProgram(teamId: string, userId: string, input: CreateTempProgramInput): Promise<
  Result<{ program: ReturnType<typeof serializeProgramSummary> }>
> {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false, code: "VALIDATION" };

  const id = randomUUID();
  const program = await prisma.tempProgram.create({
    data: {
      id,
      teamId,
      name,
      description: input.description?.trim().slice(0, 2000) || null,
      status: "draft",
      versionNumber: 1,
      createdByUserId: userId,
      programFamilyId: id,
    },
  });

  return { ok: true, program: serializeProgramSummary(program) };
}

export async function updateTempProgram(
  teamId: string,
  programId: string,
  userId: string,
  input: UpdateTempProgramInput,
): Promise<Result<{ program: ReturnType<typeof serializeProgramDetail> }>> {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const draft = await assertDraftProgram(teamId, programId);
  if (!draft.ok) return { ok: false, code: draft.code === "NOT_FOUND" ? "NOT_FOUND" : "LOCKED" };

  if (input.name !== undefined && !input.name.trim()) return { ok: false, code: "VALIDATION" };

  await prisma.tempProgram.update({
    where: { id: programId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().slice(0, 200) } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim().slice(0, 2000) || null } : {}),
    },
  });

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false, code: "NOT_FOUND" };

  return { ok: true, program: serializeProgramDetail(program) };
}

export async function validateTempProgramForUser(teamId: string, programId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member) return { ok: false as const, code: "FORBIDDEN" as const };

  const program = await prisma.tempProgram.findFirst({ where: { id: programId, teamId }, select: { id: true } });
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };

  const validation = await validateTempProgram(programId, { requireAssignments: false });
  return {
    ok: true as const,
    validation,
    canManage: canManageTemperaturePrograms(member.role),
  };
}

export async function activateTempProgram(teamId: string, programId: string, userId: string): Promise<
  Result<{ program: ReturnType<typeof serializeProgramSummary>; validation: Awaited<ReturnType<typeof validateTempProgram>> }>
> {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const program = await prisma.tempProgram.findFirst({ where: { id: programId, teamId } });
  if (!program) return { ok: false, code: "NOT_FOUND" };
  if (program.status !== "draft") return { ok: false, code: "INVALID_STATE" };

  const validation = await validateTempProgram(programId, { requireAssignments: true });
  if (!validation.isValid) {
    return { ok: false, code: "VALIDATION", validation };
  }

  await prisma.$transaction(async (tx) => {
    await tx.tempProgram.updateMany({
      where: {
        teamId,
        programFamilyId: program.programFamilyId,
        status: "active",
      },
      data: { status: "archived", isLocked: true },
    });

    await tx.tempProgram.update({
      where: { id: programId },
      data: { status: "active", isLocked: true },
    });
  });

  const activated = await prisma.tempProgram.findUniqueOrThrow({ where: { id: programId } });
  return { ok: true, program: serializeProgramSummary(activated), validation };
}

export async function archiveTempProgram(teamId: string, programId: string, userId: string): Promise<
  Result<{ program: ReturnType<typeof serializeProgramSummary> }>
> {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const program = await prisma.tempProgram.findFirst({ where: { id: programId, teamId } });
  if (!program) return { ok: false, code: "NOT_FOUND" };
  if (program.status === "archived") return { ok: false, code: "INVALID_STATE" };

  const archived = await prisma.tempProgram.update({
    where: { id: programId },
    data: { status: "archived", isLocked: true },
  });

  return { ok: true, program: serializeProgramSummary(archived) };
}

export async function createTempProgramDraftVersion(teamId: string, programId: string, userId: string): Promise<
  Result<{ program: ReturnType<typeof serializeProgramDetail> }>
> {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const source = await prisma.tempProgram.findFirst({ where: { id: programId, teamId } });
  if (!source) return { ok: false, code: "NOT_FOUND" };
  if (source.status !== "active" && source.status !== "archived") {
    return { ok: false, code: "INVALID_STATE" };
  }

  const existingDraft = await prisma.tempProgram.findFirst({
    where: { teamId, programFamilyId: source.programFamilyId, status: "draft" },
  });
  if (existingDraft) return { ok: false, code: "INVALID_STATE" };

  const tree = await loadProgramTreeForClone(programId);
  if (!tree) return { ok: false, code: "NOT_FOUND" };

  const newProgramId = await prisma.$transaction(async (tx) => {
    const created = await tx.tempProgram.create({
      data: {
        teamId,
        programFamilyId: tree.programFamilyId,
        name: tree.name,
        description: tree.description,
        status: "draft",
        versionNumber: tree.versionNumber + 1,
        isLocked: false,
        createdByUserId: userId,
      },
    });

    const groupIdMap = new Map<string, string>();
    for (const group of tree.equipmentGroups) {
      const newGroup = await tx.tempEquipmentGroup.create({
        data: {
          programId: created.id,
          teamId,
          name: group.name,
          description: group.description,
          sortOrder: group.sortOrder,
          isActive: group.isActive,
        },
      });
      groupIdMap.set(group.id, newGroup.id);
    }

    const equipmentIdMap = new Map<string, string>();
    for (const equipment of tree.equipmentItems) {
      const newEquipment = await tx.tempEquipmentItem.create({
        data: {
          programId: created.id,
          equipmentGroupId: groupIdMap.get(equipment.equipmentGroupId) ?? equipment.equipmentGroupId,
          teamId,
          name: equipment.name,
          description: equipment.description,
          equipmentType: equipment.equipmentType,
          locationHint: equipment.locationHint,
          sortOrder: equipment.sortOrder,
          isRequired: equipment.isRequired,
          isActive: equipment.isActive,
        },
      });
      equipmentIdMap.set(equipment.id, newEquipment.id);
    }

    const templateIdMap = new Map<string, string>();
    for (const template of tree.correctiveTemplates) {
      const newTemplate = await tx.tempCorrectiveActionTemplate.create({
        data: {
          programId: created.id,
          teamId,
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
        },
      });
      templateIdMap.set(template.id, newTemplate.id);
    }

    const checkItemIdMap = new Map<string, string>();
    for (const item of tree.checkItems) {
      const newItem = await tx.tempCheckItem.create({
        data: {
          programId: created.id,
          equipmentId: equipmentIdMap.get(item.equipmentId) ?? item.equipmentId,
          teamId,
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
        },
      });
      checkItemIdMap.set(item.id, newItem.id);
    }

    for (const rule of tree.correctiveRules) {
      await tx.tempCorrectiveActionRule.create({
        data: {
          programId: created.id,
          teamId,
          checkItemId: checkItemIdMap.get(rule.checkItemId) ?? rule.checkItemId,
          correctiveActionTemplateId:
            templateIdMap.get(rule.correctiveActionTemplateId) ?? rule.correctiveActionTemplateId,
          conditionType: rule.conditionType,
          isDefault: rule.isDefault,
          sortOrder: rule.sortOrder,
          isActive: rule.isActive,
        },
      });
    }

    for (const schedule of tree.schedules) {
      await tx.tempCheckSchedule.create({
        data: {
          programId: created.id,
          teamId,
          name: schedule.name,
          scheduleType: schedule.scheduleType,
          specificTimes: schedule.specificTimes ?? [],
          intervalHours: schedule.intervalHours,
          windowBeforeMinutes: schedule.windowBeforeMinutes,
          windowAfterMinutes: schedule.windowAfterMinutes,
          daysOfWeek: schedule.daysOfWeek ?? [],
          timezone: schedule.timezone,
          isActive: schedule.isActive,
        },
      });
    }

    for (const assignment of tree.assignments) {
      await tx.tempProgramAssignment.create({
        data: {
          programId: created.id,
          teamId,
          assignmentType: assignment.assignmentType,
          assignmentTargetId: assignment.assignmentTargetId,
          effectiveStartDate: assignment.effectiveStartDate,
          effectiveEndDate: assignment.effectiveEndDate,
          isActive: assignment.isActive,
        },
      });
    }

    return created.id;
  });

  const program = await loadProgramDetail(teamId, newProgramId);
  if (!program) return { ok: false, code: "NOT_FOUND" };

  return { ok: true, program: serializeProgramDetail(program) };
}
