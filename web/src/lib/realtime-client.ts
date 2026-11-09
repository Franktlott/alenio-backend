import { getAccessToken } from "./auth-client";
import { getResolvedBackendUrl } from "./env-config";

export type WebTaskUpdatedEvent = {
  type: "task.updated";
  channel: "tasks";
  teamId: string;
  taskId: string;
  reason?: string;
  actorUserId?: string;
};

export type WebDmMessageCreatedEvent = {
  type: "message.created";
  channel: "dm";
  conversationId: string;
  message: unknown;
};

export type WebInboxUpdatedEvent = {
  type: "inbox.updated";
  channel: "inbox";
  kind: "team" | "dm";
  teamId?: string;
  topicId?: string | null;
  conversationId?: string;
  resource?: "calendar" | "check_ins" | "goals";
};

type TaskHandler = (event: WebTaskUpdatedEvent) => void;
type DmMessageHandler = (event: WebDmMessageCreatedEvent) => void;
type InboxHandler = (event: WebInboxUpdatedEvent) => void;

function toWsUrl(token: string): string {
  const httpUrl = getResolvedBackendUrl();
  const wsBase = httpUrl.replace(/^http/i, "ws");
  return `${wsBase}/api/realtime?token=${encodeURIComponent(token)}`;
}

export function teamTasksRealtimeChannel(teamId: string): string {
  return `team:${teamId}:tasks`;
}

export function dmRealtimeChannel(conversationId: string): string {
  return `dm:${conversationId}`;
}

export function userInboxRealtimeChannel(userId: string): string {
  return `user:${userId}`;
}

class WebRealtimeClient {
  private ws: WebSocket | null = null;
  private desiredChannels = new Map<string, number>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private connecting = false;
  private taskHandlers = new Set<TaskHandler>();
  private dmMessageHandlers = new Set<DmMessageHandler>();
  private inboxHandlers = new Set<InboxHandler>();

  onTaskUpdated(handler: TaskHandler) {
    this.taskHandlers.add(handler);
    return () => this.taskHandlers.delete(handler);
  }

  onDmMessageCreated(handler: DmMessageHandler) {
    this.dmMessageHandlers.add(handler);
    return () => {
      this.dmMessageHandlers.delete(handler);
    };
  }

  onInboxUpdated(handler: InboxHandler) {
    this.inboxHandlers.add(handler);
    return () => {
      this.inboxHandlers.delete(handler);
    };
  }

  subscribe(channels: string[]) {
    for (const channel of channels) {
      if (!channel) continue;
      this.desiredChannels.set(channel, (this.desiredChannels.get(channel) ?? 0) + 1);
    }
    void this.connect();
    this.flushSubscriptions();
  }

  unsubscribe(channels: string[]) {
    const removing: string[] = [];
    for (const channel of channels) {
      if (!channel) continue;
      const count = this.desiredChannels.get(channel) ?? 0;
      if (count <= 1) {
        this.desiredChannels.delete(channel);
        if (count === 1) removing.push(channel);
      } else {
        this.desiredChannels.set(channel, count - 1);
      }
    }
    if (removing.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", channels: removing }));
    }
    if (this.desiredChannels.size === 0) this.stop();
  }

  private async connect() {
    if (this.connecting || this.ws || this.desiredChannels.size === 0) return;
    this.connecting = true;
    this.intentionalClose = false;
    try {
      const token = getAccessToken();
      if (!token) {
        this.connecting = false;
        this.scheduleReconnect();
        return;
      }
      const ws = new WebSocket(toWsUrl(token));
      this.ws = ws;
      ws.onopen = () => {
        this.connecting = false;
        this.reconnectAttempt = 0;
        this.flushSubscriptions();
        this.startPing();
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as { type?: string; channel?: string };
          if (data.type === "task.updated") {
            const payload = data as WebTaskUpdatedEvent;
            for (const handler of this.taskHandlers) handler(payload);
          } else if (data.type === "message.created" && data.channel === "dm") {
            const payload = data as WebDmMessageCreatedEvent;
            for (const handler of this.dmMessageHandlers) handler(payload);
          } else if (data.type === "inbox.updated") {
            const payload = data as WebInboxUpdatedEvent;
            for (const handler of this.inboxHandlers) handler(payload);
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        this.connecting = false;
        this.ws = null;
        this.stopPing();
        if (!this.intentionalClose && this.desiredChannels.size > 0) this.scheduleReconnect();
      };
      ws.onerror = () => {
        // onclose handles reconnect
      };
    } catch {
      this.connecting = false;
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  private flushSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const channels = [...this.desiredChannels.keys()];
    if (channels.length === 0) return;
    this.ws.send(JSON.stringify({ type: "subscribe", channels }));
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.desiredChannels.size === 0) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private stop() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}

export const webRealtimeClient = new WebRealtimeClient();
