import { api } from "@/lib/api/api";
import { webBillingUrlForTeam } from "@/lib/plan-access-copy";
import { Linking } from "react-native";

export type BillingProvider = "stripe" | "mobile_store" | "none";

export type WorkspaceBillingRow = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  canManageBilling: boolean;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    billingProvider: BillingProvider;
    hasStripeCustomer: boolean;
    hasStripeSubscription: boolean;
  };
};

export type BillingWorkspacesResponse = {
  workspaces: WorkspaceBillingRow[];
};

type TeamListRow = {
  id: string;
  name: string;
  image: string | null;
  role: string;
};

type SubscriptionRow = {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  billingProvider?: BillingProvider;
};

export function rowFromTeamAndSubscription(team: TeamListRow, sub: SubscriptionRow): WorkspaceBillingRow {
  const billingProvider = sub.billingProvider ?? "none";
  const isStripe = billingProvider === "stripe";
  return {
    id: team.id,
    name: team.name,
    image: team.image,
    role: team.role,
    canManageBilling: team.role === "owner",
    subscription: {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      billingProvider,
      hasStripeCustomer: isStripe,
      hasStripeSubscription: isStripe && (sub.plan === "team" || sub.plan === "pro"),
    },
  };
}

/** Load workplaces via existing mobile APIs (same as profile / tabs). */
export async function fetchBillingWorkspaces(): Promise<BillingWorkspacesResponse> {
  const teams = await api.get<TeamListRow[]>("/api/teams");
  const workspaces = await Promise.all(
    teams.map(async (team) => {
      const sub = await api.get<SubscriptionRow>(`/api/teams/${team.id}/subscription`);
      return rowFromTeamAndSubscription(team, sub);
    }),
  );
  return { workspaces };
}

function isBillingApiUnavailable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("404") ||
    m.includes("not configured") ||
    m.includes("not available") ||
    m.includes("request failed: 404")
  );
}

async function postBillingSession(
  teamId: string,
  kind: "checkout" | "portal",
): Promise<{ url: string; openedWebFallback?: boolean }> {
  const teamPaths =
    kind === "checkout"
      ? [`/api/teams/${teamId}/subscription/checkout-session`]
      : [`/api/teams/${teamId}/subscription/portal-session`];
  const legacyPaths =
    kind === "checkout" ? ["/api/billing/checkout-session"] : ["/api/billing/portal-session"];

  let lastError: Error | null = null;
  for (const path of [...teamPaths, ...legacyPaths]) {
    try {
      const body = path.startsWith("/api/billing/") ? { teamId } : {};
      return await api.post<{ url: string }>(path, body);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastError && isBillingApiUnavailable(lastError.message)) {
    const url = webBillingUrlForTeam(teamId, { subscribe: kind === "checkout" });
    await Linking.openURL(url);
    return { url, openedWebFallback: true };
  }

  throw lastError ?? new Error("Billing is unavailable right now.");
}

export function postBillingCheckout(teamId: string) {
  return postBillingSession(teamId, "checkout");
}

export function postBillingPortal(teamId: string) {
  return postBillingSession(teamId, "portal");
}

export function tierFromPlan(plan: string | null | undefined): "free" | "team" {
  const p = (plan ?? "free").trim().toLowerCase();
  if (p === "team" || p === "pro") return "team";
  return "free";
}

export function planStatusLabel(plan: string, status: string): string {
  const tier = tierFromPlan(plan);
  if (tier === "team") {
    if (status === "past_due") return "Team — payment issue";
    if (status === "trialing") return "Team — trial";
    if (status === "canceled") return "Team — canceled";
    return "Team plan active";
  }
  return "Free plan";
}
