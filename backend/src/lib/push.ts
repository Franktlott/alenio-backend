import { prisma } from "../prisma";

// Expo push API endpoint (note the required "/--/").
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  sound?: string;
}

async function parseExpoResponse(response: Response): Promise<{ data?: { status: string; message?: string; details?: unknown; id?: string }[] }> {
  const text = await response.text();
  try {
    return JSON.parse(text) as { data?: { status: string; message?: string; details?: unknown; id?: string }[] };
  } catch {
    const preview = text.slice(0, 250).replace(/\s+/g, " ").trim();
    throw new Error(`Expo response not JSON (HTTP ${response.status}): ${preview || "<empty>"}`);
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function sendPushChunkStrict(chunk: PushPayload[]): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
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

  const result = await parseExpoResponse(response);

  if (!response.ok) {
    throw new Error(`Expo push HTTP ${response.status}: ${JSON.stringify(result).slice(0, 500)}`);
  }

  const errors = result.data?.filter((r) => r.status !== "ok") ?? [];
  if (errors.length) {
    throw new Error(`Expo push rejected: ${JSON.stringify(errors).slice(0, 800)}`);
  }
}

// Strict sender (throws on any failure). Best for diagnostics and tests.
export async function sendPushNotificationsStrict(messages: PushPayload[]): Promise<void> {
  if (messages.length === 0) return;
  const chunks = chunkArray(messages, CHUNK_SIZE);
  for (const chunk of chunks) {
    await sendPushChunkStrict(chunk);
  }
}

// Non-strict sender (logs failures but does not throw).
export async function sendPushNotifications(messages: PushPayload[]): Promise<void> {
  if (messages.length === 0) return;

  const chunks = chunkArray(messages, CHUNK_SIZE);

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        await sendPushChunkStrict(chunk);
        console.log(`[push] ✅ Sent ${chunk.length} notification(s) to Expo successfully`);
      } catch (err) {
        console.error("[push] ❌ Failed to send push notifications:", err);
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
  console.log(`[push] sendPushToUsers — userIds: ${userIds.length}, prefKey: ${prefKey ?? "none"}, title: "${title}"`);
  if (userIds.length === 0) {
    console.log("[push] No userIds provided, skipping");
    return;
  }

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
  console.log(`[push] DB found ${users.length}/${userIds.length} users with token${prefKey ? ` + ${prefKey}=true` : ""}`);

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
      console.log(`[push] user tone: "${u.notifTone ?? "null"}" → channelId: "${channelId}", sound: "${sound}"`);
      return { token: u.pushToken!, title, body, data, sound, channelId };
    });
  console.log(`[push] Sending ${messages.length} message(s) after token format filter`);

  await sendPushNotifications(messages);
}
