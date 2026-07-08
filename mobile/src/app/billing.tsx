import { Redirect, useLocalSearchParams } from "expo-router";

/** Deep link alias: alenio://billing → account hub */
export default function BillingDeepLinkScreen() {
  const params = useLocalSearchParams<{ teamId?: string; billing?: string }>();
  return (
    <Redirect
      href={{
        pathname: "/account-hub",
        params: {
          ...(typeof params.teamId === "string" ? { teamId: params.teamId } : {}),
          ...(typeof params.billing === "string" ? { billing: params.billing } : {}),
        },
      }}
    />
  );
}
