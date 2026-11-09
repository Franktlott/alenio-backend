import type { PushCampaign } from "@prisma/client";
import { prisma } from "../prisma";
import { pushAudienceUserIds, type PushAudienceKind } from "./push-campaign-audience";
import { sendPushToUsers } from "./push";

export const PUSH_CAMPAIGN_STATUSES = ["draft", "pending", "approved", "scheduled", "sending", "sent", "rejected"] as const;
export type PushCampaignStatus = (typeof PUSH_CAMPAIGN_STATUSES)[number];

export const PUSH_CAMPAIGN_TYPES = [
  "product_announcement",
  "feature_update",
  "reminder",
  "recognition",
  "billing",
] as const;

export const PUSH_LINK_KINDS = ["home", "discover", "seneca"] as const;

export const PUSH_TITLE_MAX = 65;
export const PUSH_BODY_MAX = 178;

/** Drafts and sent-back campaigns are the only ones whose message can change. */
export function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected";
}

export type ApprovalCheck = { ok: true } | { ok: false; code: "NOT_PENDING" | "SAME_APPROVER"; message: string };

/** A second person must approve: never the one who wrote or submitted it. */
export function checkApproval(campaign: Pick<PushCampaign, "status" | "createdById" | "submittedById">, actorId: string): ApprovalCheck {
  if (campaign.status !== "pending") {
    return { ok: false, code: "NOT_PENDING", message: "Only campaigns waiting for approval can be approved." };
  }
  if (campaign.createdById === actorId || campaign.submittedById === actorId) {
    return { ok: false, code: "SAME_APPROVER", message: "A different admin has to approve this notification." };
  }
  return { ok: true };
}

/** Where an approved campaign goes next: out now, or onto the schedule. */
export function statusAfterApproval(
  campaign: Pick<PushCampaign, "deliveryMode" | "scheduledAt">,
  now: Date = new Date(),
): "approved" | "scheduled" {
  if (campaign.deliveryMode === "scheduled" && campaign.scheduledAt && campaign.scheduledAt.getTime() > now.getTime()) {
    return "scheduled";
  }
  return "approved";
}

type CampaignDb = {
  pushCampaign: {
    updateMany: typeof prisma.pushCampaign.updateMany;
    findUnique: typeof prisma.pushCampaign.findUnique;
    update: typeof prisma.pushCampaign.update;
  };
};

type SendDeps = {
  db?: CampaignDb;
  recipients?: (audience: { kind: PushAudienceKind; teamId?: string | null }) => Promise<string[]>;
  send?: typeof sendPushToUsers;
  now?: () => Date;
};

/**
 * Sends one campaign. The status flip to "sending" is a guarded update, so two
 * callers (the approve request and the minute job) can never both send it.
 * Returns false when someone else already claimed it.
 */
export async function sendCampaign(id: string, deps: SendDeps = {}): Promise<boolean> {
  const db = deps.db ?? prisma;
  const now = deps.now?.() ?? new Date();
  const claimed = await db.pushCampaign.updateMany({
    where: {
      id,
      OR: [{ status: "approved" }, { status: "scheduled", scheduledAt: { lte: now } }],
    },
    data: { status: "sending" },
  });
  if (claimed.count === 0) return false;

  const campaign = await db.pushCampaign.findUnique({ where: { id } });
  if (!campaign) return false;

  try {
    const userIds = await (deps.recipients ?? pushAudienceUserIds)({
      kind: campaign.audienceKind as PushAudienceKind,
      teamId: campaign.audienceTeamId,
    });
    const delivered = await (deps.send ?? sendPushToUsers)(
      userIds,
      campaign.title,
      campaign.body,
      {
        type: "campaign",
        campaignId: campaign.id,
        linkKind: campaign.linkKind,
        linkValue: campaign.linkValue,
      },
      "notifProductUpdates",
    );
    await db.pushCampaign.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), recipientCount: userIds.length, deliveredCount: delivered },
    });
  } catch (error) {
    console.error(`[push-campaigns] send failed for ${id}:`, error);
    await db.pushCampaign.update({ where: { id }, data: { status: "sent", sentAt: new Date() } });
  }
  return true;
}

/** Minute job: sends scheduled campaigns that are due, plus approved ones a restart interrupted. */
export async function runDuePushCampaigns(): Promise<void> {
  const due = await prisma.pushCampaign.findMany({
    where: {
      OR: [{ status: "approved" }, { status: "scheduled", scheduledAt: { lte: new Date() } }],
    },
    select: { id: true },
    take: 20,
  });
  for (const { id } of due) {
    await sendCampaign(id).catch((error) => console.error(`[push-campaigns] due send failed for ${id}:`, error));
  }
}

export async function recordPushCampaignOpen(campaignId: string, userId: string): Promise<boolean> {
  const exists = await prisma.pushCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!exists) return false;
  try {
    await prisma.$transaction([
      prisma.pushCampaignOpen.create({ data: { campaignId, userId } }),
      prisma.pushCampaign.update({ where: { id: campaignId }, data: { openCount: { increment: 1 } } }),
    ]);
  } catch {
    // Already counted for this person.
  }
  return true;
}
