import { prisma } from "../../prisma";
import { programDetailInclude } from "./common";

export type TempProgramValidationResult = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
};

function hasValidTemperatureBounds(minTemp: number | null, maxTemp: number | null): boolean {
  if (minTemp == null && maxTemp == null) return false;
  if (minTemp != null && maxTemp != null && minTemp > maxTemp) return false;
  return true;
}

function failureIsPossible(minTemp: number | null, maxTemp: number | null, allowNa: boolean): boolean {
  if (minTemp != null || maxTemp != null) return true;
  return !allowNa;
}

export async function validateTempProgram(programId: string, options?: { requireAssignments?: boolean }) {
  const requireAssignments = options?.requireAssignments ?? false;

  const program = await prisma.tempProgram.findUnique({
    where: { id: programId },
    include: {
      equipmentGroups: { where: { isActive: true }, include: { equipmentItems: { where: { isActive: true } } } },
      checkItems: { where: { isActive: true }, include: { correctiveRules: { where: { isActive: true } } } },
      schedules: { where: { isActive: true } },
      assignments: { where: { isActive: true } },
      correctiveTemplates: { where: { isActive: true } },
    },
  });

  if (!program) {
    return {
      isValid: false,
      errors: ["Program not found."],
      warnings: [],
    } satisfies TempProgramValidationResult;
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const activeGroups = program.equipmentGroups;
  if (activeGroups.length === 0) {
    errors.push("Program must have at least one active equipment group.");
  }

  for (const group of activeGroups) {
    const activeEquipment = group.equipmentItems.filter((row) => row.isActive);
    if (activeEquipment.length === 0) {
      errors.push(`Equipment group "${group.name}" must have at least one active equipment item.`);
    }
  }

  const equipmentIds = new Set(
    activeGroups.flatMap((group) => group.equipmentItems.filter((row) => row.isActive).map((row) => row.id)),
  );

  for (const equipmentId of equipmentIds) {
    const checkItems = program.checkItems.filter((item) => item.equipmentId === equipmentId);
    if (checkItems.length === 0) {
      errors.push(`Each active equipment item must have at least one active check item.`);
      break;
    }
  }

  for (const item of program.checkItems) {
    if (!hasValidTemperatureBounds(item.minTemp, item.maxTemp)) {
      errors.push(`Check item "${item.name}" must have a valid minimum or maximum temperature.`);
    }

    if (failureIsPossible(item.minTemp, item.maxTemp, item.allowNa)) {
      const activeRules = item.correctiveRules.filter((rule) => rule.isActive);
      if (activeRules.length === 0) {
        errors.push(`Check item "${item.name}" must have at least one corrective action rule for possible failures.`);
      }
    }
  }

  if (program.schedules.length === 0) {
    errors.push("Program must have at least one active schedule.");
  }

  for (const schedule of program.schedules) {
    if (schedule.scheduleType === "specific_times") {
      const times = Array.isArray(schedule.specificTimes) ? schedule.specificTimes : [];
      if (times.length === 0) {
        errors.push(`Schedule "${schedule.name}" must include at least one specific time.`);
      }
    }
    if (schedule.scheduleType === "interval" && (schedule.intervalHours == null || schedule.intervalHours <= 0)) {
      errors.push(`Schedule "${schedule.name}" must include a valid interval in hours.`);
    }
  }

  if (program.assignments.length === 0) {
    const message = "Program must have at least one active assignment rule before activation.";
    if (requireAssignments) errors.push(message);
    else warnings.push(message);
  }

  if (program.correctiveTemplates.length === 0) {
    warnings.push("Program has no corrective action templates defined.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  } satisfies TempProgramValidationResult;
}

export async function validateTempProgramForTeam(teamId: string, programId: string, requireAssignments = false) {
  const program = await prisma.tempProgram.findFirst({ where: { id: programId, teamId }, select: { id: true } });
  if (!program) return null;
  return validateTempProgram(programId, { requireAssignments });
}

export async function loadProgramTreeForClone(programId: string) {
  return prisma.tempProgram.findUnique({
    where: { id: programId },
    include: {
      equipmentGroups: { include: { equipmentItems: true } },
      equipmentItems: true,
      checkItems: { include: { correctiveRules: true } },
      schedules: true,
      assignments: true,
      correctiveTemplates: true,
      correctiveRules: true,
    },
  });
}

export { programDetailInclude };
