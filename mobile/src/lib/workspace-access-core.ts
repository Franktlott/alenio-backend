export type WorkspaceAccessStatus = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type WorkspaceAccessMode = "full" | "read_only";
export type WorkspaceBannerSeverity = "none" | "info" | "warning" | "critical";
export type WorkspaceFeatures = { team: boolean; operations: boolean };

export type WorkspaceSubscription = {
  plan: string;
  status: WorkspaceAccessStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  remainingDays: number | null;
  canWrite: boolean;
  accessMode: WorkspaceAccessMode;
  bannerSeverity: WorkspaceBannerSeverity;
  hasTeamFeatures: boolean;
  hasGoFeatures: boolean;
  features?: Partial<WorkspaceFeatures> | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  billingInterval?: string | null;
  billingProvider?: string | null;
};

export type WorkspaceAccess = WorkspaceSubscription & {
  isLegacyFree: boolean;
  features: WorkspaceFeatures;
};

const LEGACY_ACCESS: WorkspaceAccess = {
  plan: "free",
  status: "active",
  trialStartedAt: null,
  trialEndsAt: null,
  remainingDays: null,
  canWrite: true,
  accessMode: "full",
  bannerSeverity: "none",
  hasTeamFeatures: false,
  hasGoFeatures: false,
  isLegacyFree: true,
  features: { team: false, operations: false },
};

export function deriveWorkspaceAccess(subscription: WorkspaceSubscription | null | undefined): WorkspaceAccess {
  if (!subscription) return LEGACY_ACCESS;
  const status = subscription.status ?? "active";
  const isLegacyFree =
    subscription.plan === "free" &&
    status === "active" &&
    !subscription.trialStartedAt &&
    !subscription.trialEndsAt;
  const canWrite =
    subscription.canWrite ?? (isLegacyFree || status === "active" || status === "trialing");
  return {
    ...subscription,
    status,
    canWrite,
    accessMode: subscription.accessMode ?? (canWrite ? "full" : "read_only"),
    bannerSeverity:
      subscription.bannerSeverity ??
      (canWrite ? (status === "trialing" ? "info" : "none") : "critical"),
    isLegacyFree,
    features: {
      team: subscription.features?.team ?? subscription.hasTeamFeatures ?? false,
      operations: subscription.features?.operations ?? subscription.hasGoFeatures ?? false,
    },
  };
}

export type TrialBannerPresentation = {
  visible: boolean;
  severity: WorkspaceBannerSeverity;
  title: string;
  message: string;
};

export function trialBannerPresentation(access: WorkspaceAccess): TrialBannerPresentation {
  if (!access.trialStartedAt && access.status !== "trialing" && access.canWrite) {
    return { visible: false, severity: "none", title: "", message: "" };
  }
  if (!access.canWrite || access.status === "expired") {
    return {
      visible: true,
      severity: "critical",
      title: "Trial ended — workspace is read-only",
      message: "Choose a plan to create, edit, complete, or delete workspace content.",
    };
  }
  if (access.status !== "trialing") {
    return { visible: false, severity: "none", title: "", message: "" };
  }
  const days = Math.max(0, access.remainingDays ?? 0);
  const severity = days <= 3 ? "warning" : "info";
  const title =
    days === 1
      ? "Operations trial ends tomorrow"
      : days <= 7
        ? `${days} days left in your Operations trial`
        : `Operations trial · ${days} days left`;
  const message = days <= 3 ? "Choose a plan now to keep workspace editing uninterrupted." : "";
  return { visible: true, severity, title, message };
}
