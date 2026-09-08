import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../env";
import { prisma } from "../prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type WorkspaceTrialEligibilityResult = {
  canStartWorkspaceTrial: boolean;
  workspaceTrialStartedAt: Date | null;
  workspaceTrialConsumedAt: Date | null;
};

export function normalizeTrialIdentityEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized && normalized.includes("@") ? normalized : null;
}

export function workspaceTrialEmailHash(email: string): string {
  const secret =
    env.TRIAL_IDENTITY_SECRET?.trim() ||
    env.BETTER_AUTH_SECRET?.trim() ||
    "alenio-development-trial-identity-secret";
  return createHmac("sha256", secret).update(normalizeTrialIdentityEmail(email) ?? email).digest("hex");
}

function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  return dates.length ? new Date(Math.min(...dates.map((value) => value.getTime()))) : null;
}

/** Attach the current email alias and restore sticky audit fields from durable history. */
export async function syncWorkspaceTrialIdentity(
  userId: string,
  email: string | null | undefined,
  db: DbClient = prisma,
): Promise<WorkspaceTrialEligibilityResult> {
  const normalized = normalizeTrialIdentityEmail(email);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { workspaceTrialStartedAt: true, workspaceTrialConsumedAt: true },
  });
  if (!user) {
    return {
      canStartWorkspaceTrial: false,
      workspaceTrialStartedAt: null,
      workspaceTrialConsumedAt: null,
    };
  }

  let identity: { trialStartedAt: Date | null; trialConsumedAt: Date | null } | null = null;
  if (normalized) {
    identity = await db.workspaceTrialIdentity.upsert({
      where: { emailHash: workspaceTrialEmailHash(normalized) },
      create: {
        emailHash: workspaceTrialEmailHash(normalized),
        userId,
        trialStartedAt: user.workspaceTrialStartedAt,
        trialConsumedAt: user.workspaceTrialConsumedAt,
      },
      update: { userId },
      select: { trialStartedAt: true, trialConsumedAt: true },
    });
  }

  const linked = await db.workspaceTrialIdentity.findMany({
    where: { userId },
    select: { trialStartedAt: true, trialConsumedAt: true },
  });
  const startedAt = earliestDate(
    user.workspaceTrialStartedAt,
    identity?.trialStartedAt,
    ...linked.map((row) => row.trialStartedAt),
  );
  const consumedAt = earliestDate(
    user.workspaceTrialConsumedAt,
    identity?.trialConsumedAt,
    ...linked.map((row) => row.trialConsumedAt),
  );

  if (
    startedAt?.getTime() !== user.workspaceTrialStartedAt?.getTime() ||
    consumedAt?.getTime() !== user.workspaceTrialConsumedAt?.getTime()
  ) {
    await db.user.update({
      where: { id: userId },
      data: {
        workspaceTrialStartedAt: startedAt,
        workspaceTrialConsumedAt: consumedAt,
      },
    });
  }

  if (consumedAt) {
    await db.workspaceTrialIdentity.updateMany({
      where: { userId },
      data: {
        trialStartedAt: startedAt ?? consumedAt,
        trialConsumedAt: consumedAt,
      },
    });
  }

  return {
    canStartWorkspaceTrial: !consumedAt,
    workspaceTrialStartedAt: startedAt,
    workspaceTrialConsumedAt: consumedAt,
  };
}

export async function getWorkspaceTrialEligibility(
  userId: string,
  email: string | null | undefined,
): Promise<WorkspaceTrialEligibilityResult> {
  return syncWorkspaceTrialIdentity(userId, email);
}

/**
 * Atomically reserves the account's only trial. The caller must use the same transaction
 * to create the trial workspace so a failed create rolls this reservation back.
 */
export async function consumeWorkspaceTrial(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string | null | undefined,
  at: Date,
): Promise<boolean> {
  const normalized = normalizeTrialIdentityEmail(email);
  if (normalized) {
    const hash = workspaceTrialEmailHash(normalized);
    const existing = await tx.workspaceTrialIdentity.findUnique({
      where: { emailHash: hash },
      select: { trialConsumedAt: true },
    });
    if (existing?.trialConsumedAt) return false;
    await tx.workspaceTrialIdentity.upsert({
      where: { emailHash: hash },
      create: { emailHash: hash, userId },
      update: { userId },
    });
  }

  const linkedConsumed = await tx.workspaceTrialIdentity.findFirst({
    where: { userId, trialConsumedAt: { not: null } },
    select: { id: true },
  });
  if (linkedConsumed) return false;

  const acquired = await tx.user.updateMany({
    where: { id: userId, workspaceTrialConsumedAt: null },
    data: {
      workspaceTrialStartedAt: at,
      workspaceTrialConsumedAt: at,
    },
  });
  if (acquired.count !== 1) return false;

  await tx.workspaceTrialIdentity.updateMany({
    where: { userId },
    data: { trialStartedAt: at, trialConsumedAt: at },
  });
  return true;
}
