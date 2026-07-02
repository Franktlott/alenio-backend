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

export type LinkedGoDeviceRow = {
  id: string;
  deviceId: string;
  deviceLabel: string | null;
  updatedAt: Date;
  source: "approved" | "active";
};

export async function recordGoDeviceCheckIn(
  hubToken: string,
  deviceId: string,
  deviceLabel?: string | null,
) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const label = deviceLabel?.trim() || null;
  const approved = await prisma.goLoginRequest.findUnique({
    where: { teamId_deviceId: { teamId: team.id, deviceId } },
    select: { status: true, deviceLabel: true },
  });

  await prisma.goDevicePresence.upsert({
    where: { teamId_deviceId: { teamId: team.id, deviceId } },
    create: {
      teamId: team.id,
      deviceId,
      deviceLabel: label ?? approved?.deviceLabel ?? null,
    },
    update: {
      lastSeenAt: new Date(),
      ...(label ? { deviceLabel: label } : {}),
    },
  });

  return {
    ok: true as const,
    teamId: team.id,
    approved: approved?.status === "approved",
  };
}

export async function listLinkedGoDevices(teamId: string): Promise<LinkedGoDeviceRow[]> {
  const [approved, active] = await Promise.all([
    prisma.goLoginRequest.findMany({
      where: { teamId, status: "approved" },
      select: {
        id: true,
        deviceId: true,
        deviceLabel: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.goDevicePresence.findMany({
      where: {
        teamId,
        lastSeenAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        deviceId: true,
        deviceLabel: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: "desc" },
    }),
  ]);

  const byDeviceId = new Map<string, LinkedGoDeviceRow>();
  for (const row of approved) {
    byDeviceId.set(row.deviceId, {
      id: row.id,
      deviceId: row.deviceId,
      deviceLabel: row.deviceLabel,
      updatedAt: row.updatedAt,
      source: "approved",
    });
  }
  for (const row of active) {
    if (byDeviceId.has(row.deviceId)) continue;
    byDeviceId.set(row.deviceId, {
      id: row.id,
      deviceId: row.deviceId,
      deviceLabel: row.deviceLabel,
      updatedAt: row.lastSeenAt,
      source: "active",
    });
  }

  return [...byDeviceId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** @deprecated Use listLinkedGoDevices */
export async function listApprovedGoDevices(teamId: string) {
  const rows = await listLinkedGoDevices(teamId);
  return rows.map(({ id, deviceId, deviceLabel, updatedAt }) => ({
    id,
    deviceId,
    deviceLabel,
    updatedAt,
  }));
}

async function isGoDeviceReachable(teamId: string, deviceId: string): Promise<boolean> {
  const approved = await prisma.goLoginRequest.findFirst({
    where: { teamId, deviceId, status: "approved" },
    select: { id: true },
  });
  if (approved) return true;

  const active = await prisma.goDevicePresence.findUnique({
    where: { teamId_deviceId: { teamId, deviceId } },
    select: { lastSeenAt: true },
  });
  if (!active) return false;
  return active.lastSeenAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000;
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
    const reachable = await isGoDeviceReachable(teamId, deviceId);
    if (!reachable) {
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
  return isGoDeviceReachable(teamId, deviceId);
}

export async function pollWorkplaceAlertsForDevice(hubToken: string, deviceId: string) {
  const team = await findTeamByChecklistHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const approved = await isGoDeviceReachable(team.id, deviceId);
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

  const approved = await isGoDeviceReachable(team.id, deviceId);
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
