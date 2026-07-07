import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { findTeamByGoHubToken } from "./go-hub";
import { isGoDeviceApproved } from "./workplace-alerts";

const PIN_PATTERN = /^\d{4,8}$/;

export type VerifiedGoLeader = {
  userId: string;
  name: string;
  role: "owner" | "team_leader";
};

export function normalizeGoLeaderPin(pin: string): string {
  return pin.replace(/\s+/g, "");
}

export function isValidGoLeaderPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export async function setGoLeaderPin(
  prisma: PrismaClient,
  teamId: string,
  userId: string,
  pin: string,
): Promise<{ ok: true; hasPin: true } | { ok: false; code: "NOT_MEMBER" | "INVALID_PIN" }> {
  const normalized = normalizeGoLeaderPin(pin);
  if (!isValidGoLeaderPin(normalized)) return { ok: false, code: "INVALID_PIN" };

  const hash = await bcrypt.hash(normalized, 12);
  const updated = await prisma.teamMember.updateMany({
    where: { teamId, userId },
    data: { goPinHash: hash },
  });

  if (updated.count === 0) return { ok: false, code: "NOT_MEMBER" };
  return { ok: true, hasPin: true };
}

export async function getGoLeaderPinStatus(
  prisma: PrismaClient,
  teamId: string,
  userId: string,
): Promise<{ ok: true; hasPin: boolean } | { ok: false; code: "NOT_MEMBER" }> {
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { goPinHash: true },
  });
  if (!member) return { ok: false, code: "NOT_MEMBER" };
  return { ok: true, hasPin: Boolean(member.goPinHash) };
}

export async function verifyOwnGoLeaderPin(
  prisma: PrismaClient,
  teamId: string,
  userId: string,
  pin: string,
): Promise<
  | { ok: true; leader: VerifiedGoLeader }
  | { ok: false; code: "NOT_MEMBER" | "NO_PIN" | "INVALID_PIN" }
> {
  const normalized = normalizeGoLeaderPin(pin);
  if (!isValidGoLeaderPin(normalized)) return { ok: false, code: "INVALID_PIN" };

  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: {
      userId: true,
      role: true,
      goPinHash: true,
      user: { select: { name: true } },
    },
  });
  if (!member) return { ok: false, code: "NOT_MEMBER" };
  if (!member.goPinHash) return { ok: false, code: "NO_PIN" };
  if (member.role !== "owner" && member.role !== "team_leader") {
    return { ok: false, code: "NOT_MEMBER" };
  }

  const valid = await bcrypt.compare(normalized, member.goPinHash);
  if (!valid) return { ok: false, code: "INVALID_PIN" };

  return {
    ok: true,
    leader: {
      userId: member.userId,
      name: member.user.name.trim().slice(0, 120) || "Leader",
      role: member.role === "owner" ? "owner" : "team_leader",
    },
  };
}

export async function verifyGoLeaderPin(
  prisma: PrismaClient,
  hubToken: string,
  deviceId: string,
  pin: string,
): Promise<
  | { ok: true; leader: VerifiedGoLeader }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_PIN" }
> {
  const normalized = normalizeGoLeaderPin(pin);
  if (!isValidGoLeaderPin(normalized)) return { ok: false, code: "INVALID_PIN" };

  const team = await findTeamByGoHubToken(hubToken);
  if (!team) return { ok: false, code: "NOT_FOUND" };

  const reachable = await isGoDeviceApproved(team.id, deviceId);
  if (!reachable) return { ok: false, code: "FORBIDDEN" };

  const candidates = await prisma.teamMember.findMany({
    where: {
      teamId: team.id,
      role: { in: ["owner", "team_leader"] },
      goPinHash: { not: null },
    },
    select: {
      userId: true,
      role: true,
      goPinHash: true,
      user: { select: { name: true } },
    },
  });

  let match: VerifiedGoLeader | null = null;
  for (const member of candidates) {
    if (!member.goPinHash) continue;
    const valid = await bcrypt.compare(normalized, member.goPinHash);
    if (!valid) continue;
    if (match) return { ok: false, code: "INVALID_PIN" };
    match = {
      userId: member.userId,
      name: member.user.name.trim().slice(0, 120) || "Leader",
      role: member.role === "owner" ? "owner" : "team_leader",
    };
  }

  if (!match) return { ok: false, code: "INVALID_PIN" };
  return { ok: true, leader: match };
}

export async function resolveVerifiedGoLeader(
  prisma: PrismaClient,
  teamId: string,
  leaderUserId: string,
): Promise<{ ok: true; leader: VerifiedGoLeader } | { ok: false; code: "INVALID_LEADER" }> {
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: leaderUserId, teamId } },
    select: {
      userId: true,
      role: true,
      goPinHash: true,
      user: { select: { name: true } },
    },
  });
  if (!member?.goPinHash) return { ok: false, code: "INVALID_LEADER" };
  if (member.role !== "owner" && member.role !== "team_leader") {
    return { ok: false, code: "INVALID_LEADER" };
  }
  return {
    ok: true,
    leader: {
      userId: member.userId,
      name: member.user.name.trim().slice(0, 120) || "Leader",
      role: member.role === "owner" ? "owner" : "team_leader",
    },
  };
}
