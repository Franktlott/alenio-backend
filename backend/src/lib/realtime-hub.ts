/** In-memory realtime pub/sub for Bun WebSocket clients (single-process MVP). */

export type RealtimeSocket = {
  send: (data: string) => void;
  data: RealtimeSocketData;
};

export type RealtimeSocketData = {
  userId: string;
  channels: Set<string>;
};

export type TeamMessageCreatedEvent = {
  type: "message.created";
  channel: "team";
  teamId: string;
  topicId: string | null;
  message: unknown;
};

export type DmMessageCreatedEvent = {
  type: "message.created";
  channel: "dm";
  conversationId: string;
  message: unknown;
};

export type InboxUpdatedEvent = {
  type: "inbox.updated";
  channel: "inbox";
  kind: "team" | "dm";
  teamId?: string;
  topicId?: string | null;
  conversationId?: string;
};

export type TeamPinUpdatedEvent = {
  type: "pin.updated";
  channel: "team";
  teamId: string;
  topicId: string | null;
  pinnedMessages: unknown[];
};

export type DmPinUpdatedEvent = {
  type: "pin.updated";
  channel: "dm";
  conversationId: string;
  pinnedMessages: unknown[];
};

export type RealtimeEvent =
  | TeamMessageCreatedEvent
  | DmMessageCreatedEvent
  | InboxUpdatedEvent
  | TeamPinUpdatedEvent
  | DmPinUpdatedEvent;

const rooms = new Map<string, Set<RealtimeSocket>>();

export function teamRealtimeKey(teamId: string, topicId: string | null | undefined): string {
  return `team:${teamId}:topic:${topicId ?? "general"}`;
}

export function dmRealtimeKey(conversationId: string): string {
  return `dm:${conversationId}`;
}

export function userRealtimeKey(userId: string): string {
  return `user:${userId}`;
}

export function subscribeSocket(ws: RealtimeSocket, keys: string[]) {
  for (const key of keys) {
    if (!key || ws.data.channels.has(key)) continue;
    ws.data.channels.add(key);
    let room = rooms.get(key);
    if (!room) {
      room = new Set();
      rooms.set(key, room);
    }
    room.add(ws);
  }
}

export function unsubscribeSocket(ws: RealtimeSocket, keys: string[]) {
  for (const key of keys) {
    if (!ws.data.channels.has(key)) continue;
    ws.data.channels.delete(key);
    const room = rooms.get(key);
    if (!room) continue;
    room.delete(ws);
    if (room.size === 0) rooms.delete(key);
  }
}

export function detachSocket(ws: RealtimeSocket) {
  for (const key of [...ws.data.channels]) {
    const room = rooms.get(key);
    if (!room) continue;
    room.delete(ws);
    if (room.size === 0) rooms.delete(key);
  }
  ws.data.channels.clear();
}

export function publishRealtime(event: RealtimeEvent, roomKey: string) {
  const room = rooms.get(roomKey);
  if (!room || room.size === 0) return;
  const payload = JSON.stringify(event);
  for (const ws of room) {
    try {
      ws.send(payload);
    } catch (err) {
      console.error("[realtime] send failed:", err);
    }
  }
}

export function publishTeamMessageCreated(input: {
  teamId: string;
  topicId: string | null;
  message: unknown;
}) {
  publishRealtime(
    {
      type: "message.created",
      channel: "team",
      teamId: input.teamId,
      topicId: input.topicId,
      message: input.message,
    },
    teamRealtimeKey(input.teamId, input.topicId),
  );
}

export function publishDmMessageCreated(input: {
  conversationId: string;
  message: unknown;
}) {
  publishRealtime(
    {
      type: "message.created",
      channel: "dm",
      conversationId: input.conversationId,
      message: input.message,
    },
    dmRealtimeKey(input.conversationId),
  );
}

/** Notify recipients' personal inbox channels so tab badges refresh immediately. */
export function publishUserInboxUpdated(
  userIds: string[],
  detail: {
    kind: "team" | "dm";
    teamId?: string;
    topicId?: string | null;
    conversationId?: string;
  },
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    publishRealtime(
      {
        type: "inbox.updated",
        channel: "inbox",
        kind: detail.kind,
        teamId: detail.teamId,
        topicId: detail.topicId,
        conversationId: detail.conversationId,
      },
      userRealtimeKey(userId),
    );
  }
}

export function publishTeamPinUpdated(input: {
  teamId: string;
  topicId: string | null;
  pinnedMessages: unknown[];
}) {
  publishRealtime(
    {
      type: "pin.updated",
      channel: "team",
      teamId: input.teamId,
      topicId: input.topicId,
      pinnedMessages: input.pinnedMessages,
    },
    teamRealtimeKey(input.teamId, input.topicId),
  );
}

export function publishDmPinUpdated(input: {
  conversationId: string;
  pinnedMessages: unknown[];
}) {
  publishRealtime(
    {
      type: "pin.updated",
      channel: "dm",
      conversationId: input.conversationId,
      pinnedMessages: input.pinnedMessages,
    },
    dmRealtimeKey(input.conversationId),
  );
}
