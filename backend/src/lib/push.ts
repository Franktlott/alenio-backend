import { prisma } from "../prisma";

const EXPO_PUSH_URL = "https://exp.host/--/exponent-push-notification-server/api/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(
  to: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify([{ to, title, body, data }]),
    });
  } catch {
    // Silently fail — notifications are non-critical
  }
}

type NotifPrefKey = "notifMessages" | "notifTaskAssigned" | "notifTaskDue";

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
  prefKey?: NotifPrefKey
): Promise<void> {
  if (userIds.length === 0) return;

  const where: Record<string, unknown> = {
    id: { in: userIds },
    pushToken: { not: null },
  };
  if (prefKey) {
    where[prefKey] = true;
  }

  const users = await prisma.user.findMany({
    where,
    select: { pushToken: true },
  });

  await Promise.all(
    users
      .filter((u) => u.pushToken?.startsWith("ExponentPushToken"))
      .map((u) => sendPushNotification(u.pushToken!, title, body, data))
  );
}
