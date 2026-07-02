import { prisma } from "../prisma";
import { findTeamByChecklistHubToken } from "./checklist-locations";
import { canManageGoLoginRequests } from "./go-login-requests";
import { sendPushToUsers } from "./push";

export type WorkplaceAlertTarget = "device" | "all_devices" | "all_users";

export type CreateWorkplaceAlertInput = {
  title: string;
  body: string;
  targetType: WorkplaceAlertTarget;
  targetDeviceId?: string | null;
  playSound?: boolean;
};

export async function listApprovedGoDevices(teamId: string) {
  return prisma.goLoginRequest.findMany({
    where: { teamId, status: "approved" },
    select: {
      id: true,
      deviceId: true,
      deviceLabel: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createWorkplaceAlert(
  teamId: string,
  createdByUserId: string,
  input: CreateWorkplaceAlertInput,
) {
  const title = input.title.trim() || "Workplace alert";
  const body = input.body.trim();
  if (!body) {
    return { ok: false as const, code: "VALIDATION" as const };
  }

  if (input.targetType === "device") {
    const deviceId = input.targetDeviceId?.trim();
    if (!deviceId) {
      return { ok: false as const, code: "VALIDATION" as const };
    }
    const linked = await prisma.goLoginRequest.findFirst({
      where: { teamId, deviceId, status: "approved" },
    });
    if (!linked) {
      return { ok: false as const, code: "DEVICE_NOT_FOUND" as const };
    }
  }

  const alert = await prisma.workplaceAlert.create({
    data: {
      teamId,
      title,
      body,
      targetType: input.targetType,
      targetDeviceId: input.targetType === "device" ? input.targetDeviceId!.trim() : null,
      playSound: input.playSound !== false,
      createdByUserId,
    },
  });

  if (input.targetType === "all_users") {
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    const userIds = members.map((m) => m.userId).filter((id) => id !== createdByUserId);
    if (userIds.length > 0) {
      await sendPushToUsers(
        userIds,
        title,
        body,
        { teamId, type: "workplace_alert", alertId: alert.id },
        "notifMessages",
        teamId,
      );
    }
  }

  return { ok: true as const, alert };
}

export async function isGoDeviceApproved(teamId: string, deviceId: string): Promise<boolean> {
  const row = await prisma.goLoginRequest.findFirst({
    where: { teamId, deviceId, status: "approved" },
    select: { id: true },
  });
  return !!row;
}

export async function pollWorkplaceAlertsForDevice(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const approved = await isGoDeviceApproved(team.id, deviceId);
  if (!approved) return { ok: false as const, code: "FORBIDDEN" as const };

  const alerts = await prisma.workplaceAlert.findMany({
    where: {
      teamId: team.id,
      OR: [{ targetType: "all_devices" }, { targetType: "device", targetDeviceId: deviceId }],
      acks: { none: { deviceId } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      body: true,
      playSound: true,
      createdAt: true,
    },
  });

  return { ok: true as const, alerts };
}

export async function ackWorkplaceAlertForDevice(alertId: string, hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const approved = await isGoDeviceApproved(team.id, deviceId);
  if (!approved) return { ok: false as const, code: "FORBIDDEN" as const };

  const alert = await prisma.workplaceAlert.findUnique({ where: { id: alertId } });
  if (!alert || alert.teamId !== team.id) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  await prisma.workplaceAlertAck.upsert({
    where: { alertId_deviceId: { alertId, deviceId } },
    create: { alertId, deviceId },
    update: {},
  });

  return { ok: true as const };
}

export { canManageGoLoginRequests as canManageWorkplaceAlerts };
