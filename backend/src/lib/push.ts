import { prisma } from "../prisma";

const EXPO_PUSH_URL = "https://exp.host/api/v2/push/send";
const CHUNK_SIZE = 100;

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: string;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function sendPushNotifications(messages: PushPayload[]): Promise<void> {
  if (messages.length === 0) return;

  const chunks = chunkArray(messages, CHUNK_SIZE);

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            chunk.map((m) => ({
              to: m.token,
              title: m.title,
              body: m.body,
              sound: m.sound ?? "default",
              priority: "high",
              channelId: m.channelId ?? "alenio_main",
              data: m.data,
            }))
          ),
        });
        const result = await response.json() as { data?: { status: string; message?: string }[] };
        const errors = result.data?.filter((r) => r.status !== "ok");
        if (errors?.length) console.error("[push] Expo push errors:", JSON.stringify(errors));
      } catch (err) {
        console.error("[push] Failed to send push notifications:", err);
      }
    })
  );
}

// Kept for backwards compatibility with other routes
export async function sendPushNotification(
  to: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  await sendPushNotifications([{ token: to, title, body, data }]);
}

type NotifPrefKey = "notifMessages" | "notifTaskAssigned" | "notifTaskDue" | "notifMeetings";

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
    select: { pushToken: true, notifTone: true },
  });

  const TONE_MAP: Record<string, { channelId: string; sound: string }> = {
    bell:   { channelId: "alenio_bell",   sound: "bell" },
    chime:  { channelId: "alenio_chime",  sound: "chime" },
    alert:  { channelId: "alenio_alert",  sound: "alert" },
    silent: { channelId: "alenio_silent", sound: "none" },
  };
  const DEFAULT_TONE = { channelId: "alenio_main", sound: "default" };

  const messages: PushPayload[] = users
    .filter((u) => u.pushToken?.startsWith("ExponentPushToken"))
    .map((u) => {
      const { channelId, sound } = TONE_MAP[u.notifTone ?? ""] ?? DEFAULT_TONE;
      return { token: u.pushToken!, title, body, data, sound, channelId };
    });

  await sendPushNotifications(messages);
}
