import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Backward-compatible route for notifications and older links.
 * The person route is the only profile destination; workspace membership adds
 * context without creating a second visual profile.
 */
export default function LegacyMemberProfileRedirect() {
  const params = useLocalSearchParams<{
    teamId?: string;
    memberUserId?: string;
    userId?: string;
    tab?: string;
    startCheckIn?: string;
    plannedEventId?: string;
    createGoal?: string;
    intent?: string;
    checkInId?: string;
  }>();
  const userId =
    typeof params.memberUserId === "string"
      ? params.memberUserId
      : typeof params.userId === "string"
        ? params.userId
        : "";
  const tab = params.tab?.trim().toLowerCase();
  const checkInRequested =
    tab === "check-in" ||
    tab === "check-ins" ||
    params.startCheckIn === "true" ||
    params.startCheckIn === "1";
  const goalRequested =
    tab === "goals" ||
    tab === "growth" ||
    tab === "development" ||
    params.createGoal === "true" ||
    params.intent === "create-goal";

  return (
    <Redirect
      href={{
        pathname: "/person",
        params: {
          userId,
          ...(typeof params.teamId === "string" ? { teamId: params.teamId } : {}),
          ...(checkInRequested
            ? { tab: "check-ins" }
            : goalRequested
              ? { tab: "goals" }
              : typeof params.tab === "string"
                ? { tab: params.tab }
                : {}),
          ...(params.startCheckIn === "true" || params.startCheckIn === "1"
            ? { startCheckIn: "true" }
            : {}),
          ...(typeof params.plannedEventId === "string"
            ? { plannedEventId: params.plannedEventId }
            : {}),
          ...(typeof params.checkInId === "string"
            ? { checkInId: params.checkInId }
            : {}),
          ...(params.createGoal === "true" || params.intent === "create-goal"
            ? { createGoal: "true" }
            : {}),
        },
      }}
    />
  );
}
