import { parseGoFrontendSettings } from "./go-frontend-settings";
import { resolveGoAlertSoundUrl } from "./go-alert-sounds";
import { findTeamByGoHubToken } from "./go-hub";
import { canManageGoLoginRequests } from "./go-login-requests";
import { prisma } from "../prisma";
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
  source: "approved";
};

export const GO_DEVICE_UNLINKED_MESSAGE =
  "This device was unlinked. Link again to continue.";

export type GoDeviceLinkStatus = "approved" | "pending" | "rejected" | "none";

async function getGoDeviceLinkStatus(teamId: string, deviceId: string): Promise<GoDeviceLinkStatus> {
  const request = await prisma.goLoginRequest.findUnique({
    where: { teamId_deviceId: { teamId, deviceId } },
    select: { status: true },
  });
  if (!request) return "none";
  if (request.status === "approved" || request.status === "pending" || request.status === "rejected") {
    return request.status;
  }
  return "none";
}

export async function recordGoDeviceCheckIn(
  hubToken: string,
  deviceId: string,
  deviceLabel?: string | null,
) {
  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const trimmedDeviceId = deviceId.trim();
  const linkStatus = await getGoDeviceLinkStatus(team.id, trimmedDeviceId);
  if (linkStatus !== "approved") {
    return {
      ok: true as const,
      teamId: team.id,
      approved: false,
      linkStatus,
    };
  }

  const label = deviceLabel?.trim() || null;
  const approved = await prisma.goLoginRequest.findUnique({
    where: { teamId_deviceId: { teamId: team.id, deviceId: trimmedDeviceId } },
    select: { deviceLabel: true },
  });

  await prisma.goDevicePresence.upsert({
    where: { teamId_deviceId: { teamId: team.id, deviceId: trimmedDeviceId } },
    create: {
      teamId: team.id,
      deviceId: trimmedDeviceId,
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
    approved: true,
    linkStatus: "approved" as const,
  };
}

export async function listLinkedGoDevices(teamId: string): Promise<LinkedGoDeviceRow[]> {
  const approved = await prisma.goLoginRequest.findMany({
    where: { teamId, status: "approved" },
    select: {
      id: true,
      deviceId: true,
      deviceLabel: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (approved.length === 0) return [];

  const presence = await prisma.goDevicePresence.findMany({
    where: { teamId, deviceId: { in: approved.map((row) => row.deviceId) } },
    select: { deviceId: true, deviceLabel: true, lastSeenAt: true },
  });
  const presenceByDevice = new Map(presence.map((row) => [row.deviceId, row]));

  return approved
    .map((row) => {
      const seen = presenceByDevice.get(row.deviceId);
      return {
        id: row.id,
        deviceId: row.deviceId,
        deviceLabel: seen?.deviceLabel ?? row.deviceLabel,
        updatedAt: seen?.lastSeenAt ?? row.updatedAt,
        source: "approved" as const,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** Revoke a linked Alenio Go device so it must request access again. */
export async function revokeLinkedGoDevice(teamId: string, deviceId: string) {
  const trimmed = deviceId.trim();
  if (!trimmed) return { ok: false as const, code: "VALIDATION" as const };

  const [loginRequest, presence] = await Promise.all([
    prisma.goLoginRequest.findUnique({
      where: { teamId_deviceId: { teamId, deviceId: trimmed } },
      select: { id: true, status: true },
    }),
    prisma.goDevicePresence.findUnique({
      where: { teamId_deviceId: { teamId, deviceId: trimmed } },
      select: { id: true },
    }),
  ]);

  if (!loginRequest && !presence) {
    return { ok: false as const, code: "NOT_FOUND" as const };
  }

  await prisma.$transaction([
    ...(loginRequest
      ? [
          prisma.goLoginRequest.update({
            where: { id: loginRequest.id },
            data: { status: "rejected", approvedByUserId: null },
          }),
        ]
      : []),
    ...(presence
      ? [prisma.goDevicePresence.delete({ where: { teamId_deviceId: { teamId, deviceId: trimmed } } })]
      : []),
  ]);

  return { ok: true as const };
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
  const linkStatus = await getGoDeviceLinkStatus(teamId, deviceId.trim());
  return linkStatus === "approved";
}

export async function assertGoDeviceLinked(teamId: string, deviceId: string) {
  const linkStatus = await getGoDeviceLinkStatus(teamId, deviceId.trim());
  if (linkStatus === "approved") return { ok: true as const };
  return { ok: false as const, code: "DEVICE_UNLINKED" as const, linkStatus };
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
  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const approved = await isGoDeviceReachable(team.id, deviceId);
  if (!approved) return { ok: false as const, code: "DEVICE_UNLINKED" as const };

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

  const goSettings = parseGoFrontendSettings(team.goFrontendSettings);
  const workspaceSoundUrl = resolveGoAlertSoundUrl(goSettings);

  return {
    ok: true as const,
    alerts: alerts.map((alert) => ({
      ...alert,
      soundUrl: alert.playSound ? workspaceSoundUrl : null,
    })),
  };
}

export async function ackWorkplaceAlertForDevice(alertId: string, hubToken: string, deviceId: string) {
  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false as const, code: "NOT_FOUND" as const };

  const approved = await isGoDeviceReachable(team.id, deviceId);
  if (!approved) return { ok: false as const, code: "DEVICE_UNLINKED" as const };

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
