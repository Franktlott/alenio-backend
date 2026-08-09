import type { PrismaClient, TeamSubscription } from "@prisma/client";
import { prisma } from "../prisma";

export const WORKSPACE_TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WorkspaceAccessStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";
export type WorkspaceAccessMode = "full" | "read_only";
export type WorkspaceBannerSeverity = "none" | "info" | "warning" | "critical";

export type WorkspaceSubscriptionLike = Pick<
  TeamSubscription,
  "teamId" | "plan" | "status" | "trialStartedAt" | "trialEndsAt"
>;

export type WorkspaceAccessState = {
  teamId: string;
  plan: string;
  status: WorkspaceAccessStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  remainingDays: number | null;
  canWrite: boolean;
  accessMode: WorkspaceAccessMode;
  bannerSeverity: WorkspaceBannerSeverity;
  hasTeamFeatures: boolean;
  hasGoFeatures: boolean;
  isLegacyGrandfathered: boolean;
};

export function trialEndsAtFrom(startedAt: Date, days = WORKSPACE_TRIAL_DAYS): Date {
  return new Date(startedAt.getTime() + days * DAY_MS);
}

export function remainingTrialDays(trialEndsAt: Date | null | undefined, now = new Date()): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}

function normalizeStatus(raw: string): WorkspaceAccessStatus {
  const status = raw.trim().toLowerCase();
  if (status === "trialing" || status === "past_due" || status === "canceled" || status === "expired") {
    return status;
  }
  return "active";
}

/**
 * Pure workspace access resolver. A missing row and existing free/active rows are
 * legacy grandfathered workspaces; no new code should create either shape.
 */
export function resolveWorkspaceAccess(
  teamId: string,
  subscription: WorkspaceSubscriptionLike | null | undefined,
  now = new Date(),
): WorkspaceAccessState {
  const isMissingLegacy = !subscription;
  const plan = (subscription?.plan ?? "free").trim().toLowerCase() || "free";
  let status = normalizeStatus(subscription?.status ?? "active");
  const trialStartedAt = subscription?.trialStartedAt ?? null;
  const trialEndsAt = subscription?.trialEndsAt ?? null;
  const remainingDays = remainingTrialDays(trialEndsAt, now);

  if (status === "trialing" && (!trialEndsAt || trialEndsAt.getTime() <= now.getTime())) {
    status = "expired";
  }

  const isLegacyGrandfathered =
    isMissingLegacy || (plan === "free" && status === "active" && !trialStartedAt && !trialEndsAt);
  const canWrite = isLegacyGrandfathered || status === "active" || status === "trialing";
  const paidPlan = plan === "team" || plan === "pro" || plan === "operations";
  const hasTeamFeatures = paidPlan;
  const hasGoFeatures = plan === "operations";

  let bannerSeverity: WorkspaceBannerSeverity = "none";
  if (status === "trialing") {
    bannerSeverity = (remainingDays ?? 0) <= 3 ? "warning" : "info";
  } else if (!canWrite) {
    bannerSeverity = "critical";
  }

  return {
    teamId,
    plan,
    status,
    trialStartedAt,
    trialEndsAt,
    remainingDays,
    canWrite,
    accessMode: canWrite ? "full" : "read_only",
    bannerSeverity,
    hasTeamFeatures,
    hasGoFeatures,
    isLegacyGrandfathered,
  };
}

export async function getWorkspaceAccess(
  teamId: string,
  now = new Date(),
  db: PrismaClient = prisma,
): Promise<WorkspaceAccessState> {
  const row = await db.teamSubscription.findUnique({ where: { teamId } });
  const state = resolveWorkspaceAccess(teamId, row, now);
  if (row?.status === "trialing" && state.status === "expired") {
    await db.teamSubscription.updateMany({
      where: { teamId, status: "trialing" },
      data: { status: "expired" },
    });
  }
  return state;
}

export async function expireEndedWorkspaceTrials(
  now = new Date(),
  db: PrismaClient = prisma,
): Promise<number> {
  const result = await db.teamSubscription.updateMany({
    where: {
      status: "trialing",
      trialEndsAt: { lte: now },
    },
    data: { status: "expired" },
  });
  return result.count;
}

export function workspaceReadOnlyError(state: WorkspaceAccessState) {
  return {
    error: {
      message: "This workspace is read-only. Update billing to make changes.",
      code: "WORKSPACE_READ_ONLY",
      teamId: state.teamId,
      status: state.status,
      trialEndsAt: state.trialEndsAt?.toISOString() ?? null,
    },
  };
}

export async function assertWorkspaceCanWrite(teamId: string) {
  const access = await getWorkspaceAccess(teamId);
  return access.canWrite ? { ok: true as const, access } : { ok: false as const, access };
}
