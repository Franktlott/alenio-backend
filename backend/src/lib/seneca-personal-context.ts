import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";

export type SenecaPersonalProfile = {
  name: string;
  username: string | null;
  profileTitle: string | null;
  profileOrganization: string | null;
  profileLocation: string | null;
  profileBio: string | null;
  timezone: string | null;
};

export type SenecaPersonalContext = {
  scope: "personal_only";
  grounding: string;
  profile: SenecaPersonalProfile;
};

export function buildPersonalContextFromProfile(profile: SenecaPersonalProfile): SenecaPersonalContext {
  return {
    scope: "personal_only",
    grounding:
      "This context contains only the authenticated user's own account/profile fields. It contains no workspace, teammate, manager, task, goal, check-in, calendar, or team-health data.",
    profile,
  };
}

export async function buildSenecaPersonalContext(
  userId: string,
  db: PrismaClient = prisma,
): Promise<SenecaPersonalContext> {
  const profile = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      username: true,
      profileTitle: true,
      profileOrganization: true,
      profileLocation: true,
      profileBio: true,
      timezone: true,
    },
  });
  if (!profile) throw new Error("User not found");
  return buildPersonalContextFromProfile(profile);
}

export function senecaPersonalContextToPrompt(context: SenecaPersonalContext): string {
  return JSON.stringify(context, null, 2);
}
