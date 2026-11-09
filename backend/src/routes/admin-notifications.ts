import { Hono } from "hono";
import { z } from "zod";
import type { PushCampaign, PushTemplate } from "@prisma/client";
import { auth } from "../auth";
import { adminGuard, requireAbility, requireAbilityByMethod, resolveStaffActor } from "../middleware/admin-guard";
import { prisma } from "../prisma";
import { countPushAudience, PUSH_AUDIENCES, type PushAudience, type PushAudienceKind } from "../lib/push-campaign-audience";
import {
  checkApproval,
  isEditableStatus,
  PUSH_BODY_MAX,
  PUSH_CAMPAIGN_TYPES,
  PUSH_LINK_KINDS,
  PUSH_TITLE_MAX,
  sendCampaign,
  statusAfterApproval,
} from "../lib/push-campaigns";
import { notifyApproversOfSubmission, sendCampaignTest } from "../lib/push-campaign-alerts";
import { recordStaffAction } from "../lib/staff-audit";
import { effectiveStaffRole, STAFF_ROLE_LABELS } from "../lib/staff-roles";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const campaignBody = z
  .object({
    title: z.string().trim().min(1).max(PUSH_TITLE_MAX),
    body: z.string().trim().min(1).max(PUSH_BODY_MAX),
    type: z.enum(PUSH_CAMPAIGN_TYPES),
    category: z.string().trim().max(40).optional(),
    audienceKind: z.enum(PUSH_AUDIENCES),
    audienceTeamId: z.string().trim().max(64).nullable().optional(),
    linkKind: z.enum(PUSH_LINK_KINDS),
    linkValue: z.string().trim().max(120).optional(),
    deliveryMode: z.enum(["immediate", "scheduled"]),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.audienceKind === "workspace" && !value.audienceTeamId) {
      ctx.addIssue({ code: "custom", path: ["audienceTeamId"], message: "Choose a workspace." });
    }
    if (value.linkKind === "discover" && !value.linkValue) {
      ctx.addIssue({ code: "custom", path: ["linkValue"], message: "Choose a Discover article." });
    }
    if (value.deliveryMode === "scheduled" && !value.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a send time." });
    }
  });

const templateBody = z.object({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(PUSH_TITLE_MAX),
  body: z.string().trim().min(1).max(PUSH_BODY_MAX),
  type: z.enum(PUSH_CAMPAIGN_TYPES),
  category: z.string().trim().max(40).optional(),
  linkKind: z.enum(PUSH_LINK_KINDS),
  linkValue: z.string().trim().max(120).optional(),
});

type Person = { id: string; name: string; email: string; image: string | null; roleLabel: string | null };

async function peopleById(ids: Array<string | null | undefined>): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, email: true, image: true, accountType: true, staffRole: true },
  });
  return new Map(
    rows.map((row) => {
      const role = effectiveStaffRole(row);
      return [row.id, { id: row.id, name: row.name, email: row.email, image: row.image, roleLabel: role ? STAFF_ROLE_LABELS[role] : null }];
    }),
  );
}

async function teamNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.team.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

function audienceOf(campaign: Pick<PushCampaign, "audienceKind" | "audienceTeamId">): PushAudience {
  return { kind: campaign.audienceKind as PushAudienceKind, teamId: campaign.audienceTeamId };
}

/** Audience sizes for a page of campaigns, counted once per distinct audience. */
async function audienceCounts(campaigns: PushCampaign[]) {
  const cache = new Map<string, Promise<{ total: number; reachable: number }>>();
  const keyOf = (campaign: PushCampaign) => `${campaign.audienceKind}:${campaign.audienceTeamId ?? ""}`;
  for (const campaign of campaigns) {
    if (campaign.status === "sent" || cache.has(keyOf(campaign))) continue;
    cache.set(keyOf(campaign), countPushAudience(audienceOf(campaign)));
  }
  const resolved = new Map<string, { total: number; reachable: number }>();
  for (const [key, promise] of cache) resolved.set(key, await promise.catch(() => ({ total: 0, reachable: 0 })));
  return (campaign: PushCampaign) => resolved.get(keyOf(campaign)) ?? null;
}

async function serializeCampaigns(campaigns: PushCampaign[]) {
  const [people, teams, counts] = await Promise.all([
    peopleById(campaigns.flatMap((c) => [c.createdById, c.submittedById, c.approvedById, c.rejectedById, c.updatedById])),
    teamNames(campaigns.map((c) => c.audienceTeamId)),
    audienceCounts(campaigns),
  ]);
  const person = (id: string | null) => (id ? people.get(id) ?? null : null);
  return campaigns.map((campaign) => ({
    ...campaign,
    audienceTeamName: campaign.audienceTeamId ? teams.get(campaign.audienceTeamId) ?? null : null,
    audienceCount: counts(campaign),
    createdBy: person(campaign.createdById),
    updatedBy: person(campaign.updatedById),
    submittedBy: person(campaign.submittedById),
    approvedBy: person(campaign.approvedById),
    rejectedBy: person(campaign.rejectedById),
  }));
}

async function serializeOne(campaign: PushCampaign) {
  const [row] = await serializeCampaigns([campaign]);
  return row!;
}

function invalid(c: { json: (body: unknown, status: 400) => Response }, error: z.ZodError) {
  const first = error.issues[0];
  return c.json({ error: { message: first?.message ?? "Check the form and try again.", code: "INVALID", field: first?.path.join(".") } }, 400);
}

function campaignData(input: z.infer<typeof campaignBody>) {
  return {
    title: input.title,
    body: input.body,
    type: input.type,
    category: input.category ?? "",
    audienceKind: input.audienceKind,
    audienceTeamId: input.audienceKind === "workspace" ? input.audienceTeamId ?? null : null,
    linkKind: input.linkKind,
    linkValue: input.linkKind === "discover" ? input.linkValue ?? "" : "",
    deliveryMode: input.deliveryMode,
    scheduledAt: input.deliveryMode === "scheduled" && input.scheduledAt ? new Date(input.scheduledAt) : null,
  };
}

const LIST_STATUS: Record<string, string[]> = {
  draft: ["draft", "rejected"],
  pending: ["pending"],
  scheduled: ["scheduled", "approved", "sending"],
  sent: ["sent"],
};

export const adminNotificationsRouter = new Hono<{ Variables: Variables }>();

adminNotificationsRouter.use("*", adminGuard);
adminNotificationsRouter.use("*", requireAbilityByMethod("notifications.view", "notifications.create"));

async function actorOf(c: Parameters<typeof resolveStaffActor>[0]) {
  const actor = await resolveStaffActor(c);
  if (!actor) throw new Error("Staff actor missing after guard");
  return actor;
}

function audit(actor: { id: string; email: string | null }, action: string, campaign: { id: string; title: string }, verb: string) {
  return recordStaffAction({
    actorId: actor.id,
    actorEmail: actor.email,
    action,
    targetType: "notification",
    targetId: campaign.id,
    summary: `${verb} push notification “${campaign.title}”`,
  });
}

adminNotificationsRouter.get("/metrics", async (c) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [drafts, pending, scheduled, sent30] = await Promise.all([
    prisma.pushCampaign.count({ where: { status: { in: LIST_STATUS.draft } } }),
    prisma.pushCampaign.count({ where: { status: "pending" } }),
    prisma.pushCampaign.count({ where: { status: { in: LIST_STATUS.scheduled } } }),
    prisma.pushCampaign.count({ where: { status: "sent", sentAt: { gte: since } } }),
  ]);
  return c.json({ data: { drafts, pending, scheduled, sent30 } });
});

adminNotificationsRouter.get("/campaigns", async (c) => {
  const status = c.req.query("status") ?? "";
  const q = (c.req.query("q") ?? "").trim();
  const campaigns = await prisma.pushCampaign.findMany({
    where: {
      ...(LIST_STATUS[status] ? { status: { in: LIST_STATUS[status] } } : {}),
      ...(q
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return c.json({ data: await serializeCampaigns(campaigns) });
});

adminNotificationsRouter.get("/campaigns/:id", async (c) => {
  const campaign = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!campaign) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: await serializeOne(campaign) });
});

adminNotificationsRouter.get("/audience", async (c) => {
  const kind = c.req.query("kind") as PushAudienceKind;
  if (!(PUSH_AUDIENCES as readonly string[]).includes(kind)) {
    return c.json({ error: { message: "Unknown audience", code: "INVALID" } }, 400);
  }
  return c.json({ data: await countPushAudience({ kind, teamId: c.req.query("teamId") || null }) });
});

adminNotificationsRouter.get("/workspaces", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  const teams = await prisma.team.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    select: { id: true, name: true, _count: { select: { members: true } } },
    orderBy: { name: "asc" },
    take: 25,
  });
  return c.json({ data: teams.map((team) => ({ id: team.id, name: team.name, memberCount: team._count.members })) });
});

adminNotificationsRouter.post("/campaigns", async (c) => {
  const parsed = campaignBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  const actor = await actorOf(c);
  const campaign = await prisma.pushCampaign.create({
    data: { ...campaignData(parsed.data), status: "draft", createdById: actor.id, updatedById: actor.id },
  });
  await audit(actor, "notification.create", campaign, "Drafted");
  return c.json({ data: await serializeOne(campaign) }, 201);
});

adminNotificationsRouter.patch("/campaigns/:id", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  if (!isEditableStatus(existing.status)) {
    return c.json({ error: { message: "Only drafts can be edited. Move it back to draft first.", code: "NOT_EDITABLE" } }, 409);
  }
  const parsed = campaignBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  const actor = await actorOf(c);
  const campaign = await prisma.pushCampaign.update({
    where: { id: existing.id },
    data: { ...campaignData(parsed.data), updatedById: actor.id },
  });
  await audit(actor, "notification.update", campaign, "Edited");
  return c.json({ data: await serializeOne(campaign) });
});

adminNotificationsRouter.post("/campaigns/:id/submit", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  if (!isEditableStatus(existing.status)) {
    return c.json({ error: { message: "This notification was already submitted.", code: "NOT_EDITABLE" } }, 409);
  }
  if (existing.deliveryMode === "scheduled" && (!existing.scheduledAt || existing.scheduledAt.getTime() <= Date.now())) {
    return c.json({ error: { message: "Pick a send time in the future.", code: "INVALID", field: "scheduledAt" } }, 400);
  }
  const actor = await actorOf(c);
  const campaign = await prisma.pushCampaign.update({
    where: { id: existing.id },
    data: {
      status: "pending",
      submittedAt: new Date(),
      submittedById: actor.id,
      rejectedAt: null,
      rejectedById: null,
      rejectionNote: "",
    },
  });
  await audit(actor, "notification.submit", campaign, "Submitted for approval");
  void notifyApproversOfSubmission(campaign, actor.id).catch((error) =>
    console.error("[push-campaigns] approval alerts failed:", error),
  );
  return c.json({ data: await serializeOne(campaign) });
});

adminNotificationsRouter.post("/campaigns/:id/test", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  const body = z.object({ email: z.string().trim().email().max(254).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: { message: "Enter a valid email.", code: "INVALID", field: "email" } }, 400);
  const actor = await actorOf(c);
  const email = body.data.email ?? actor.email;
  if (!email) return c.json({ error: { message: "Enter an email to send the test to.", code: "INVALID", field: "email" } }, 400);
  const result = await sendCampaignTest(existing, email);
  if (!result.ok) return c.json({ error: { message: result.message, code: result.code } }, result.status);
  await recordStaffAction({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "notification.test",
    targetType: "notification",
    targetId: existing.id,
    summary: `Sent a test of “${existing.title}” to ${result.email}`,
  });
  return c.json({ data: { email: result.email } });
});

adminNotificationsRouter.post("/campaigns/:id/approve", requireAbility("notifications.approve"), async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  const actor = await actorOf(c);
  const check = checkApproval(existing, actor.id);
  if (!check.ok) return c.json({ error: { message: check.message, code: check.code } }, check.code === "SAME_APPROVER" ? 403 : 409);
  const next = statusAfterApproval(existing);
  const approved = await prisma.pushCampaign.updateMany({
    where: { id: existing.id, status: "pending" },
    data: { status: next, approvedAt: new Date(), approvedById: actor.id },
  });
  if (approved.count === 0) {
    return c.json({ error: { message: "Someone else already reviewed this notification.", code: "NOT_PENDING" } }, 409);
  }
  await audit(actor, "notification.approve", existing, next === "scheduled" ? "Approved and scheduled" : "Approved and sent");
  if (next === "approved") {
    void sendCampaign(existing.id).catch((error) => console.error("[push-campaigns] send after approval failed:", error));
  }
  const campaign = await prisma.pushCampaign.findUniqueOrThrow({ where: { id: existing.id } });
  return c.json({ data: await serializeOne(campaign) });
});

adminNotificationsRouter.post("/campaigns/:id/reject", requireAbility("notifications.approve"), async (c) => {
  const body = z.object({ note: z.string().trim().max(500).optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return invalid(c, body.error);
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  const actor = await actorOf(c);
  const check = checkApproval(existing, actor.id);
  if (!check.ok) return c.json({ error: { message: check.message.replace("approve", "review"), code: check.code } }, check.code === "SAME_APPROVER" ? 403 : 409);
  const campaign = await prisma.pushCampaign.update({
    where: { id: existing.id },
    data: { status: "rejected", rejectedAt: new Date(), rejectedById: actor.id, rejectionNote: body.data.note ?? "" },
  });
  await audit(actor, "notification.reject", campaign, "Sent back");
  return c.json({ data: await serializeOne(campaign) });
});

/** Withdraws a pending or scheduled campaign back to draft, clearing any approval. */
adminNotificationsRouter.post("/campaigns/:id/cancel", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  const moved = await prisma.pushCampaign.updateMany({
    where: { id: existing.id, status: { in: ["pending", "scheduled"] } },
    data: { status: "draft", submittedAt: null, submittedById: null, approvedAt: null, approvedById: null },
  });
  if (moved.count === 0) {
    return c.json({ error: { message: "This notification is already sending or sent.", code: "NOT_CANCELABLE" } }, 409);
  }
  const actor = await actorOf(c);
  await audit(actor, "notification.cancel", existing, existing.status === "scheduled" ? "Unscheduled" : "Withdrew");
  const campaign = await prisma.pushCampaign.findUniqueOrThrow({ where: { id: existing.id } });
  return c.json({ data: await serializeOne(campaign) });
});

adminNotificationsRouter.post("/campaigns/:id/duplicate", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  const actor = await actorOf(c);
  const campaign = await prisma.pushCampaign.create({
    data: {
      title: existing.title,
      body: existing.body,
      type: existing.type,
      category: existing.category,
      audienceKind: existing.audienceKind,
      audienceTeamId: existing.audienceTeamId,
      linkKind: existing.linkKind,
      linkValue: existing.linkValue,
      deliveryMode: "immediate",
      status: "draft",
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await audit(actor, "notification.duplicate", campaign, "Duplicated");
  return c.json({ data: await serializeOne(campaign) }, 201);
});

adminNotificationsRouter.delete("/campaigns/:id", async (c) => {
  const existing = await prisma.pushCampaign.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Notification not found", code: "NOT_FOUND" } }, 404);
  if (!isEditableStatus(existing.status)) {
    return c.json({ error: { message: "Only drafts can be deleted.", code: "NOT_DELETABLE" } }, 409);
  }
  await prisma.pushCampaign.delete({ where: { id: existing.id } });
  await audit(await actorOf(c), "notification.delete", existing, "Deleted");
  return c.json({ data: { ok: true } });
});

function serializeTemplate(template: PushTemplate) {
  return template;
}

adminNotificationsRouter.get("/templates", async (c) => {
  const templates = await prisma.pushTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return c.json({ data: templates.map(serializeTemplate) });
});

adminNotificationsRouter.post("/templates", async (c) => {
  const parsed = templateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  const actor = await actorOf(c);
  const template = await prisma.pushTemplate.create({
    data: {
      ...parsed.data,
      category: parsed.data.category ?? "",
      linkValue: parsed.data.linkKind === "discover" ? parsed.data.linkValue ?? "" : "",
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  await recordStaffAction({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "notification.template.create",
    targetType: "notification",
    targetId: template.id,
    summary: `Created notification template “${template.name}”`,
  });
  return c.json({ data: serializeTemplate(template) }, 201);
});

adminNotificationsRouter.patch("/templates/:id", async (c) => {
  const parsed = templateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalid(c, parsed.error);
  const existing = await prisma.pushTemplate.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  const actor = await actorOf(c);
  const template = await prisma.pushTemplate.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      category: parsed.data.category ?? "",
      linkValue: parsed.data.linkKind === "discover" ? parsed.data.linkValue ?? "" : "",
      updatedById: actor.id,
    },
  });
  await recordStaffAction({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "notification.template.update",
    targetType: "notification",
    targetId: template.id,
    summary: `Edited notification template “${template.name}”`,
  });
  return c.json({ data: serializeTemplate(template) });
});

adminNotificationsRouter.delete("/templates/:id", async (c) => {
  const existing = await prisma.pushTemplate.findUnique({ where: { id: c.req.param("id") } });
  if (!existing) return c.json({ error: { message: "Template not found", code: "NOT_FOUND" } }, 404);
  await prisma.pushTemplate.delete({ where: { id: existing.id } });
  const actor = await actorOf(c);
  await recordStaffAction({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "notification.template.delete",
    targetType: "notification",
    targetId: existing.id,
    summary: `Deleted notification template “${existing.name}”`,
  });
  return c.json({ data: { ok: true } });
});
