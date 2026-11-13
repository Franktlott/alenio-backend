import { Redirect, useLocalSearchParams } from "expo-router";
import { useTeamStore } from "@/lib/state/team-store";
import { workspacePlanHref } from "@/lib/plan-access-copy";

/** Legacy route — redirects to this workspace’s plan screen */
export default function SubscriptionRedirectScreen() {
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const teamId =
    typeof params.teamId === "string" && params.teamId.trim()
      ? params.teamId
      : activeTeamId;
  return <Redirect href={workspacePlanHref(teamId)} />;
}
