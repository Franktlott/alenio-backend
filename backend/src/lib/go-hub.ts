import { randomBytes } from "crypto";
import { prisma } from "../prisma";
import { getTeamSubscription } from "../routes/subscription";

export function generateGoHubToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function teamHasGoPlan(teamId: string): Promise<boolean> {
  const subscription = await getTeamSubscription(teamId);
  return subscription.plan === "team" || subscription.plan === "pro";
}

export async function ensureTeamGoHubToken(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { checklistHubToken: true },
  });
  if (team?.checklistHubToken) return team.checklistHubToken;
  const token = generateGoHubToken();
  await prisma.team.update({
    where: { id: teamId },
    data: { checklistHubToken: token },
  });
  return token;
}

export async function findTeamByGoHubToken(token: string) {
  return prisma.team.findFirst({
    where: { checklistHubToken: token },
    select: {
      id: true,
      name: true,
      image: true,
      goFrontendSettings: true,
    },
  });
}
