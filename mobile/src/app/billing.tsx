import { Redirect, useLocalSearchParams } from "expo-router";
import { useTeamStore } from "@/lib/state/team-store";
import { workspacePlanHref } from "@/lib/plan-access-copy";

/** Deep link alias: alenio://billing → this workspace’s plan screen */
export default function BillingDeepLinkScreen() {
  const params = useLocalSearchParams<{ teamId?: string }>();
  const activeTeamId = useTeamStore((state) => state.activeTeamId);
  const teamId =
    typeof params.teamId === "string" && params.teamId.trim()
      ? params.teamId
      : activeTeamId;
  return <Redirect href={workspacePlanHref(teamId)} />;
}
