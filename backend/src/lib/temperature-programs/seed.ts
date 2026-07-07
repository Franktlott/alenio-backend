import { randomUUID } from "crypto";
import { prisma } from "../../prisma";
import { assertTeamMember, canManageTemperaturePrograms, loadProgramDetail, serializeProgramDetail } from "./common";
import { activateTempProgram } from "./programs";

export async function seedTemperatureProgramDemo(teamId: string, userId: string) {
  const member = await assertTeamMember(teamId, userId);
  if (!member || !canManageTemperaturePrograms(member.role)) {
    return { ok: false as const, code: "FORBIDDEN" as const };
  }

  const existing = await prisma.tempProgram.findFirst({
    where: { teamId, name: "Daily Temperature Checks" },
  });
  if (existing) {
    const program = await loadProgramDetail(teamId, existing.id);
    if (!program) return { ok: false as const, code: "NOT_FOUND" as const };
    return { ok: true as const, program: serializeProgramDetail(program), created: false };
  }

  const programId = await prisma.$transaction(async (tx) => {
    const id = randomUUID();
    const created = await tx.tempProgram.create({
      data: {
        id,
        teamId,
        name: "Daily Temperature Checks",
        description: "Generic daily hot and cold holding temperature checks.",
        status: "draft",
        versionNumber: 1,
        createdByUserId: userId,
        programFamilyId: id,
      },
    });

    const hotGroup = await tx.tempEquipmentGroup.create({
      data: { programId: created.id, teamId, name: "Hot Holding", sortOrder: 0 },
    });
    const coldGroup = await tx.tempEquipmentGroup.create({
      data: { programId: created.id, teamId, name: "Cold Holding", sortOrder: 1 },
    });

    const hotEquipment = await tx.tempEquipmentItem.create({
      data: {
        programId: created.id,
        teamId,
        equipmentGroupId: hotGroup.id,
        name: "Hot Holding Unit 1",
        equipmentType: "hot_holding",
        sortOrder: 0,
      },
    });
    const coldEquipment = await tx.tempEquipmentItem.create({
      data: {
        programId: created.id,
        teamId,
        equipmentGroupId: coldGroup.id,
        name: "Cooler Unit 1",
        equipmentType: "refrigeration",
        sortOrder: 0,
      },
    });

    const reheatTemplate = await tx.tempCorrectiveActionTemplate.create({
      data: {
        programId: created.id,
        teamId,
        name: "Reheat and recheck",
        actionType: "reheat_product",
        requiresRecheck: true,
        recheckDelayMinutes: 15,
        sortOrder: 0,
      },
    });
    const discardTemplate = await tx.tempCorrectiveActionTemplate.create({
      data: {
        programId: created.id,
        teamId,
        name: "Discard product",
        actionType: "discard_product",
        requiresComment: true,
        sortOrder: 1,
      },
    });
    const moveTemplate = await tx.tempCorrectiveActionTemplate.create({
      data: {
        programId: created.id,
        teamId,
        name: "Move product to working cooler",
        actionType: "move_product",
        sortOrder: 2,
      },
    });
    const managerTemplate = await tx.tempCorrectiveActionTemplate.create({
      data: {
        programId: created.id,
        teamId,
        name: "Contact manager",
        actionType: "call_manager",
        requiresManagerApproval: true,
        sortOrder: 3,
      },
    });

    const hotCheck = await tx.tempCheckItem.create({
      data: {
        programId: created.id,
        teamId,
        equipmentId: hotEquipment.id,
        name: "Hot food product temperature",
        instruction: "Take a temperature of the hot food product in the unit.",
        productName: "Hot food product",
        tempUnit: "F",
        minTemp: 140,
        checkType: "hot_holding",
        sortOrder: 0,
      },
    });
    const coldCheck = await tx.tempCheckItem.create({
      data: {
        programId: created.id,
        teamId,
        equipmentId: coldEquipment.id,
        name: "Cold food product temperature",
        instruction: "Take a temperature of the cold food product in the unit.",
        productName: "Cold food product",
        tempUnit: "F",
        maxTemp: 41,
        checkType: "cold_holding",
        sortOrder: 0,
      },
    });

    await tx.tempCorrectiveActionRule.createMany({
      data: [
        {
          programId: created.id,
          teamId,
          checkItemId: hotCheck.id,
          correctiveActionTemplateId: reheatTemplate.id,
          conditionType: "below_min",
          isDefault: true,
          sortOrder: 0,
        },
        {
          programId: created.id,
          teamId,
          checkItemId: hotCheck.id,
          correctiveActionTemplateId: discardTemplate.id,
          conditionType: "below_min",
          sortOrder: 1,
        },
        {
          programId: created.id,
          teamId,
          checkItemId: hotCheck.id,
          correctiveActionTemplateId: managerTemplate.id,
          conditionType: "no_reading",
          sortOrder: 2,
        },
        {
          programId: created.id,
          teamId,
          checkItemId: coldCheck.id,
          correctiveActionTemplateId: moveTemplate.id,
          conditionType: "above_max",
          isDefault: true,
          sortOrder: 0,
        },
        {
          programId: created.id,
          teamId,
          checkItemId: coldCheck.id,
          correctiveActionTemplateId: discardTemplate.id,
          conditionType: "above_max",
          sortOrder: 1,
        },
      ],
    });

    await tx.tempCheckSchedule.create({
      data: {
        programId: created.id,
        teamId,
        name: "Daily Four Hour Checks",
        scheduleType: "specific_times",
        specificTimes: ["06:00", "10:00", "14:00", "18:00"],
        windowBeforeMinutes: 15,
        windowAfterMinutes: 30,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        timezone: "America/New_York",
      },
    });

    await tx.tempProgramAssignment.create({
      data: {
        programId: created.id,
        teamId,
        assignmentType: "company",
        assignmentTargetId: teamId,
      },
    });

    return created.id;
  });

  const program = await loadProgramDetail(teamId, programId);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };

  return { ok: true as const, program: serializeProgramDetail(program), created: true };
}

export async function seedAndActivateTemperatureProgramDemo(teamId: string, userId: string) {
  const seeded = await seedTemperatureProgramDemo(teamId, userId);
  if (!seeded.ok) return seeded;

  const activated = await activateTempProgram(teamId, seeded.program.id, userId);
  if (!activated.ok) {
    return {
      ok: true as const,
      program: seeded.program,
      created: seeded.created,
      activated: false,
      validation: "validation" in activated ? activated.validation : undefined,
    };
  }

  const program = await loadProgramDetail(teamId, activated.program.id);
  if (!program) return { ok: false as const, code: "NOT_FOUND" as const };

  return {
    ok: true as const,
    program: serializeProgramDetail(program),
    created: seeded.created,
    activated: true,
  };
}
