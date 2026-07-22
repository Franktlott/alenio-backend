import { api } from "@/lib/api/api";
import { webBillingUrlForTeam } from "@/lib/plan-access-copy";
import { Linking } from "react-native";

export type BillingProvider = "stripe" | "mobile_store" | "none";
export type BillingInterval = "month" | "year";

export type WorkspaceBillingRow = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  canManageBilling: boolean;
  memberCount: number;
  /** null while subscription has not loaded yet (do not treat as Free). */
  subscription: WorkspaceSubscriptionSnapshot | null;
  subscriptionError?: boolean;
};

export type WorkspaceSubscriptionSnapshot = {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd?: boolean;
  billingInterval?: BillingInterval | null;
  billingProvider: BillingProvider;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
};

export type BillingWorkspacesResponse = {
  workspaces: WorkspaceBillingRow[];
};

type TeamListRow = {
  id: string;
  name: string;
  image: string | null;
  role: string;
  _count?: { members: number };
};

export type SubscriptionApiRow = {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd?: boolean;
  billingInterval?: BillingInterval | null;
  billingProvider?: BillingProvider;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  hasStripeCustomer?: boolean;
  hasStripeSubscription?: boolean;
};

export function rowFromTeamAndSubscription(team: TeamListRow, sub: SubscriptionApiRow): WorkspaceBillingRow {
  const billingProvider = sub.billingProvider ?? "none";
  const hasStripeCustomer =
    typeof sub.hasStripeCustomer === "boolean"
      ? sub.hasStripeCustomer
      : !!sub.stripeCustomerId?.trim() || billingProvider === "stripe";
  const hasStripeSubscription =
    typeof sub.hasStripeSubscription === "boolean"
      ? sub.hasStripeSubscription
      : !!sub.stripeSubscriptionId?.trim() ||
        (billingProvider === "stripe" &&
          (sub.plan === "team" || sub.plan === "pro" || sub.plan === "operations"));

  return {
    id: team.id,
    name: team.name,
    image: team.image,
    role: team.role,
    canManageBilling: team.role === "owner",
    memberCount: team._count?.members ?? 0,
    subscription: {
      plan: sub.plan,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
      billingInterval: sub.billingInterval ?? null,
      billingProvider,
      hasStripeCustomer,
      hasStripeSubscription,
    },
  };
}

export function pendingWorkspaceRow(team: TeamListRow, subscriptionError = false): WorkspaceBillingRow {
  return {
    id: team.id,
    name: team.name,
    image: team.image,
    role: team.role,
    canManageBilling: team.role === "owner",
    memberCount: team._count?.members ?? 0,
    subscription: null,
    subscriptionError,
  };
}

export type WorkspaceSubscriptionTone = "free" | "active" | "canceling" | "canceled" | "issue" | "pending";

export function workspaceSubscriptionTone(sub: {
  plan: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
} | null | undefined): WorkspaceSubscriptionTone {
  if (!sub) return "pending";
  const tier = tierFromPlan(sub.plan);
  if (tier !== "team") return "free";
  const status = (sub.status ?? "active").trim().toLowerCase();
  if (status === "canceled") return "canceled";
  if (status === "past_due" || status === "incomplete" || status === "paused") return "issue";
  if (sub.cancelAtPeriodEnd) return "canceling";
  return "active";
}

export function workspaceSubscriptionLine(
  sub: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd?: boolean;
  } | null | undefined,
  formatDate: (iso: string | null) => string,
): string {
  if (!sub) return "Loading plan…";
  const tier = tierFromPlan(sub.plan);
  if (tier !== "team") return "Not subscribed";
  const status = (sub.status ?? "active").trim().toLowerCase();
  if (status === "canceled") return "Subscription ended";
  if (status === "past_due") return "Payment issue";
  if (status === "incomplete" || status === "paused") return "Payment pending";
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    return `Cancels ${formatDate(sub.currentPeriodEnd)}`;
  }
  if (sub.currentPeriodEnd) {
    return `Renews ${formatDate(sub.currentPeriodEnd)}`;
  }
  return planStatusLabel(sub.plan, sub.status);
}

/** Full plan name for badges (Free / Team / Operations). */
export function planBadgeLabel(plan: string | null | undefined): "Free" | "Team" | "Operations" {
  const p = (plan ?? "free").trim().toLowerCase();
  if (p === "operations") return "Operations";
  if (p === "team" || p === "pro") return "Team";
  return "Free";
}

export function isPaidPlanBadge(label: ReturnType<typeof planBadgeLabel>): boolean {
  return label !== "Free";
}

export function billingCycleLabelFromSubscription(
  sub: WorkspaceSubscriptionSnapshot | null | undefined,
): string {
  if (!sub) return "…";
  const tier = tierFromPlan(sub.plan);
  if (tier !== "team") return "—";
  if (sub.billingInterval === "year") return "Yearly";
  if (sub.billingInterval === "month") return "Monthly";
  if (sub.billingProvider === "stripe" || sub.hasStripeSubscription || sub.hasStripeCustomer) {
    // Stripe Team/Pro prices are monthly unless interval is known.
    return "Monthly";
  }
  if (sub.billingProvider === "mobile_store") return "App Store";
  return "Active";
}

/** Load workplaces via existing mobile APIs (same as profile / tabs). */
export async function fetchBillingWorkspaces(): Promise<BillingWorkspacesResponse> {
  const teams = await api.get<TeamListRow[]>("/api/teams");
  const workspaces = await Promise.all(
    teams.map(async (team) => {
      try {
        const sub = await api.get<SubscriptionApiRow>(`/api/teams/${team.id}/subscription`);
        return rowFromTeamAndSubscription(team, sub);
      } catch {
        return pendingWorkspaceRow(team, true);
      }
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

/** Open Stripe checkout/portal for a workspace, or fall back to the web billing deep link. */
export async function openWorkspaceBilling(
  workspace: WorkspaceBillingRow,
): Promise<{ url: string; openedWebFallback?: boolean }> {
  const sub = workspace.subscription;
  const tier = tierFromPlan(sub?.plan);
  const hasStripeBilling =
    !!sub &&
    (sub.billingProvider === "stripe" || sub.hasStripeSubscription || sub.hasStripeCustomer);

  if (!workspace.canManageBilling) {
    const url = webBillingUrlForTeam(workspace.id);
    await Linking.openURL(url);
    return { url, openedWebFallback: true };
  }

  if (tier === "team" && hasStripeBilling) {
    return postBillingPortal(workspace.id);
  }

  if (tier === "free" || !sub) {
    return postBillingCheckout(workspace.id);
  }

  const url = webBillingUrlForTeam(workspace.id);
  await Linking.openURL(url);
  return { url, openedWebFallback: true };
}

export function tierFromPlan(plan: string | null | undefined): "free" | "team" {
  const p = (plan ?? "free").trim().toLowerCase();
  if (p === "team" || p === "pro" || p === "operations") return "team";
  return "free";
}

export function planStatusLabel(plan: string, status: string): string {
  const p = (plan ?? "free").trim().toLowerCase();
  if (p === "operations") {
    if (status === "past_due") return "Operations — payment issue";
    if (status === "trialing") return "Operations — trial";
    if (status === "canceled") return "Operations — canceled";
    return "Operations plan active";
  }
  const tier = tierFromPlan(plan);
  if (tier === "team") {
    if (status === "past_due") return "Team — payment issue";
    if (status === "trialing") return "Team — trial";
    if (status === "canceled") return "Team — canceled";
    return "Team plan active";
  }
  return "Free plan";
}
