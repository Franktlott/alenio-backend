import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";
import { canManageTempChecks } from "./temp-checks";

export type TempCheckEquipmentInput = {
  name: string;
  tempMinF?: number | null;
  tempMaxF?: number | null;
  correctiveActions?: string[];
};

export type UpdateTempCheckEquipmentInput = Partial<TempCheckEquipmentInput> & {
  isActive?: boolean;
};

const equipmentInclude = {
  correctiveActions: { orderBy: { sortOrder: "asc" as const } },
} as const;

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

function parseActionLabels(raw: string[] | undefined): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    const label = row.trim().slice(0, 200);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= 12) break;
  }
  return out;
}

function parseEquipmentInput(input: TempCheckEquipmentInput) {
  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false as const };
  const tempMinF = parseTemp(input.tempMinF);
  const tempMaxF = parseTemp(input.tempMaxF);
  if (tempMinF != null && tempMaxF != null && tempMinF > tempMaxF) return { ok: false as const };
  return {
    ok: true as const,
    parsed: {
      name,
      tempMinF,
      tempMaxF,
      correctiveActions: parseActionLabels(input.correctiveActions),
    },
  };
}

function serializeEquipment(equipment: {
  id: string;
  teamId: string;
  name: string;
  tempMinF: number | null;
  tempMaxF: number | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  correctiveActions: { id: string; label: string; sortOrder: number }[];
}) {
  return {
    id: equipment.id,
    teamId: equipment.teamId,
    name: equipment.name,
    tempMinF: equipment.tempMinF,
    tempMaxF: equipment.tempMaxF,
    sortOrder: equipment.sortOrder,
    isActive: equipment.isActive,
    createdAt: equipment.createdAt.toISOString(),
    updatedAt: equipment.updatedAt.toISOString(),
    actionCount: equipment.correctiveActions.length,
    correctiveActions: equipment.correctiveActions.map((action) => ({
      id: action.id,
      label: action.label,
      sortOrder: action.sortOrder,
    })),
  };
}

async function persistEquipmentActions(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  actions: string[],
) {
  await tx.tempCheckEquipmentCorrectiveAction.deleteMany({ where: { equipmentId } });
  if (actions.length > 0) {
    await tx.tempCheckEquipmentCorrectiveAction.createMany({
      data: actions.map((label, sortOrder) => ({
        equipmentId,
        label,
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
    equipment: serializeEquipment(row),
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
        sortOrder: count,
      },
    });
    await persistEquipmentActions(tx, created.id, parsed.correctiveActions);
    return tx.tempCheckEquipment.findUniqueOrThrow({
      where: { id: created.id },
      include: equipmentInclude,
    });
  });

  return { ok: true as const, equipment: serializeEquipment(equipment) };
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
    return { ok: true as const, equipment: serializeEquipment(equipment) };
  }

  const merged: TempCheckEquipmentInput = {
    name: input.name ?? existing.name,
    tempMinF: input.tempMinF !== undefined ? input.tempMinF : existing.tempMinF,
    tempMaxF: input.tempMaxF !== undefined ? input.tempMaxF : existing.tempMaxF,
    correctiveActions:
      input.correctiveActions ??
      existing.correctiveActions.map((action) => action.label),
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

  return { ok: true as const, equipment: serializeEquipment(equipment) };
}

export async function deleteTempCheckEquipment(teamId: string, equipmentId: string, userId: string) {
  return updateTempCheckEquipment(teamId, equipmentId, userId, { isActive: false });
}
