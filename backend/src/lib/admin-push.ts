import { prisma } from "../prisma";
import { sendPushToUsers, type NotifPrefKey } from "./push";

export type AdminNotifPrefKey = Extract<
  NotifPrefKey,
  "notifAdminUsers" | "notifAdminWorkspaces" | "notifAdminBilling"
>;

/**
 * Push a platform alert to every admin who has that category enabled and a push token.
 * Fire-and-forget safe: callers should `void notifyPlatformAdmins(...).catch(...)`.
 */
export async function notifyPlatformAdmins(
  prefKey: AdminNotifPrefKey,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true, [prefKey]: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  await sendPushToUsers(
    admins.map((a) => a.id),
    title,
    body,
    {
      type: "admin_alert",
      adminCategory: prefKey,
      ...data,
    },
    prefKey,
  );
}

export async function notifyAdminsNewUser(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  await notifyPlatformAdmins(
    "notifAdminUsers",
    "New user signed up",
    `${user.name} · ${user.email}`,
    { entityKind: "user", entityId: user.id },
  );
}

export async function notifyAdminsNewWorkspace(team: {
  id: string;
  name: string;
  ownerName?: string | null;
}): Promise<void> {
  const body = team.ownerName ? `${team.name} · by ${team.ownerName}` : team.name;
  await notifyPlatformAdmins(
    "notifAdminWorkspaces",
    "New workplace created",
    body,
    { entityKind: "team", entityId: team.id },
  );
}

export async function notifyAdminsMemberJoined(input: {
  userId: string;
  userName: string;
  teamId: string;
  teamName: string;
}): Promise<void> {
  await notifyPlatformAdmins(
    "notifAdminUsers",
    "Member joined a workplace",
    `${input.userName} · ${input.teamName}`,
    { entityKind: "user", entityId: input.userId, teamId: input.teamId },
  );
}

export async function notifyAdminsBillingChange(input: {
  teamId: string;
  teamName: string;
  plan: string;
  status: string;
  previousPlan?: string | null;
  previousStatus?: string | null;
}): Promise<void> {
  const prevPlan = input.previousPlan ?? "free";
  const prevStatus = input.previousStatus ?? "active";
  const { plan, status, teamName, teamId } = input;

  if (status === "past_due" && prevStatus !== "past_due") {
    await notifyPlatformAdmins(
      "notifAdminBilling",
      "Payment past due",
      `${teamName} · Team plan`,
      { entityKind: "team", entityId: teamId },
    );
    return;
  }

  if (status === "canceled" && prevStatus !== "canceled") {
    await notifyPlatformAdmins(
      "notifAdminBilling",
      "Subscription canceled",
      teamName,
      { entityKind: "team", entityId: teamId },
    );
    return;
  }

  const becamePaidActive =
    (status === "active" || status === "trialing") &&
    plan !== "free" &&
    (prevPlan === "free" || prevStatus === "canceled" || prevStatus === "past_due" || prevStatus === "incomplete");

  if (becamePaidActive) {
    const isNew = prevPlan === "free" || prevStatus === "canceled" || prevStatus === "incomplete";
    await notifyPlatformAdmins(
      "notifAdminBilling",
      isNew ? "New paid subscription" : "Subscription updated",
      `${teamName} · ${plan} plan`,
      { entityKind: "team", entityId: teamId },
    );
  }
}
