export type WorkspaceStatusSubscription = {
  plan?: string | null;
  status?: string | null;
  trialEndsAt?: string | null;
};

export type WorkspaceOrderItem = {
  id: string;
};

export function orderWorkspacesCurrentFirst<T extends WorkspaceOrderItem>(
  workspaces: readonly T[],
  activeTeamId: string | null | undefined,
): T[] {
  if (!activeTeamId) return [...workspaces];
  const activeIndex = workspaces.findIndex((workspace) => workspace.id === activeTeamId);
  if (activeIndex <= 0) return [...workspaces];
  return [
    workspaces[activeIndex],
    ...workspaces.slice(0, activeIndex),
    ...workspaces.slice(activeIndex + 1),
  ];
}

export function workspacePreviewCardWidth(containerWidth: number): number {
  const safeWidth = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  // Three cards plus two 10px gaps fit fully across standard phone widths.
  return Math.min(150, Math.max(92, Math.floor((safeWidth - 20) / 3)));
}

function titleCasePlan(plan: string): string {
  return plan
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export type WorkspaceStatusDisplay =
  | { kind: "trial"; title: "Trial"; detail: string; line: string }
  | { kind: "plan"; label: string; line: string }
  | { kind: "active"; label: "Active"; line: "Active" };

export function workspaceStatusDisplay(
  subscription: WorkspaceStatusSubscription | null | undefined,
  locale = "en-US",
): WorkspaceStatusDisplay {
  if (!subscription) return { kind: "active", label: "Active", line: "Active" };

  const status = subscription.status?.trim().toLowerCase();
  const trialEndsAt = subscription.trialEndsAt?.trim();
  if (status === "trialing" && trialEndsAt) {
    const endDate = new Date(trialEndsAt);
    if (!Number.isNaN(endDate.getTime())) {
      const formatted = new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(endDate);
      const detail = `Ends ${formatted}`;
      return {
        kind: "trial",
        title: "Trial",
        detail,
        line: `Trial · ${detail}`,
      };
    }
  }

  const plan = subscription.plan?.trim().toLowerCase();
  if (plan === "team" || plan === "pro") {
    return { kind: "plan", label: "Pro", line: "Pro" };
  }
  if (plan === "operations") {
    return { kind: "plan", label: "Operations", line: "Operations" };
  }
  if (plan && !["free", "none"].includes(plan)) {
    const label = titleCasePlan(plan);
    return { kind: "plan", label, line: label };
  }

  return { kind: "active", label: "Active", line: "Active" };
}

/** Single-line status for accessibility / legacy callers. */
export function workspaceStatusLine(
  subscription: WorkspaceStatusSubscription | null | undefined,
  locale = "en-US",
): string {
  return workspaceStatusDisplay(subscription, locale).line;
}

export function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function workspaceMemberCountLabel(count: number | null | undefined): string {
  const safeCount = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `${safeCount} member${safeCount === 1 ? "" : "s"}`;
}
