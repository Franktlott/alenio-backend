const EXPO_PUSH_URL = "https://exp.host/--/exponent-push-notification-server/api/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } catch {
    // Silently fail — notifications are non-critical
  }
}

export async function sendPushToUsers(
  prisma: any,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, pushToken: { not: null } },
    select: { pushToken: true },
  });
  const messages = users
    .filter((u: any) => u.pushToken?.startsWith("ExponentPushToken"))
    .map((u: any) => ({ to: u.pushToken!, title, body, data }));
  await sendPushNotification(messages);
}
