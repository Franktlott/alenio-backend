import type { Href } from "expo-router";

export type WorkspaceDevelopmentSection = "goals" | "check-ins";

export function workspaceDevelopmentHref(
  teamId: string,
  options?: {
    memberUserId?: string | null;
    section?: WorkspaceDevelopmentSection;
    createGoal?: boolean;
    startCheckIn?: boolean;
    checkInId?: string | null;
    templateId?: string | null;
    plannedEventId?: string | null;
    checkInLaunchId?: string | null;
  },
): Href {
  const section =
    options?.section ??
    (options?.startCheckIn || options?.checkInId ? "check-ins" : "goals");

  if (!options?.memberUserId) {
    return {
      pathname: "/(app)/execute",
      params: {
        teamId,
        mode: "development",
      },
    };
  }

  // Development is workspace-scoped, so it lives on the workspace tab where the
  // workspace is explicit, rather than on the profile where it had to be guessed.
  return {
    pathname: "/(app)/execute",
    params: {
      teamId,
      mode: "development",
      memberUserId: options.memberUserId,
      developmentSection: section,
      ...(options.createGoal ? { createGoal: "true" } : {}),
      ...(options.startCheckIn ? { startCheckIn: "true" } : {}),
      ...(options.checkInId ? { checkInId: options.checkInId } : {}),
      ...(options.templateId ? { templateId: options.templateId } : {}),
      ...(options.plannedEventId
        ? { plannedEventId: options.plannedEventId }
        : {}),
      ...(options.checkInLaunchId
        ? { checkInLaunchId: options.checkInLaunchId }
        : {}),
    },
  };
}
