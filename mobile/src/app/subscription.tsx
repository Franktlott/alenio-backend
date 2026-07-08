import { Redirect, useLocalSearchParams } from "expo-router";

/** Legacy route — redirects to account hub (alenio://subscription) */
export default function SubscriptionRedirectScreen() {
  const params = useLocalSearchParams<{ teamId?: string }>();
  return (
    <Redirect
      href={{
        pathname: "/account-hub",
        params: typeof params.teamId === "string" ? { teamId: params.teamId } : {},
      }}
    />
  );
}
