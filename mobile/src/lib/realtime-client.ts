import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";
import { getBackendUrl } from "@/lib/backend-url";
import { getAccessToken } from "@/lib/auth/auth-client";

export type RealtimeTeamMessageEvent = {
  type: "message.created";
  channel: "team";
  teamId: string;
  topicId: string | null;
  message: unknown;
};

export type RealtimeDmMessageEvent = {
  type: "message.created";
  channel: "dm";
  conversationId: string;
  message: unknown;
};

export type RealtimeInboxUpdatedEvent = {
  type: "inbox.updated";
  channel: "inbox";
  kind: "team" | "dm";
  teamId?: string;
  topicId?: string | null;
  conversationId?: string;
};

export type RealtimeServerEvent =
  | { type: "ready"; userId: string }
  | { type: "pong" }
  | { type: "subscribed"; channels: string[] }
  | { type: "unsubscribed"; channels: string[] }
  | RealtimeTeamMessageEvent
  | RealtimeDmMessageEvent
  | RealtimeInboxUpdatedEvent;

type MessageHandler = (event: RealtimeTeamMessageEvent | RealtimeDmMessageEvent) => void;
type InboxHandler = (event: RealtimeInboxUpdatedEvent) => void;
type StatusHandler = (connected: boolean) => void;

function toWsUrl(token: string): string {
  const httpUrl = getBackendUrl();
  const wsBase = httpUrl.replace(/^http/i, "ws");
  return `${wsBase}/api/realtime?token=${encodeURIComponent(token)}`;
}

export function teamRealtimeChannel(teamId: string, topicKey: string): string {
  return `team:${teamId}:topic:${topicKey || "general"}`;
}

export function dmRealtimeChannel(conversationId: string): string {
  return `dm:${conversationId}`;
}

export function userRealtimeChannel(userId: string): string {
  return `user:${userId}`;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private desiredChannels = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private connecting = false;
  private connected = false;
  private appStateSub: NativeEventSubscription | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private inboxHandlers = new Set<InboxHandler>();
  private statusHandlers = new Set<StatusHandler>();

  isConnected() {
    return this.connected;
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onInboxUpdated(handler: InboxHandler) {
    this.inboxHandlers.add(handler);
    return () => this.inboxHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    handler(this.connected);
    return () => this.statusHandlers.delete(handler);
  }

  subscribe(channels: string[]) {
    for (const channel of channels) {
      if (channel) this.desiredChannels.add(channel);
    }
    this.ensureStarted();
    this.flushSubscriptions();
  }

  unsubscribe(channels: string[]) {
    const removing: string[] = [];
    for (const channel of channels) {
      if (!channel) continue;
      if (this.desiredChannels.delete(channel)) removing.push(channel);
    }
    if (removing.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", channels: removing }));
    }
    if (this.desiredChannels.size === 0) {
      this.stop();
    }
  }

  private setConnected(next: boolean) {
    if (this.connected === next) return;
    this.connected = next;
    for (const handler of this.statusHandlers) handler(next);
  }

  private ensureStarted() {
    if (!this.appStateSub) {
      this.appStateSub = AppState.addEventListener("change", this.onAppStateChange);
    }
    if (this.desiredChannels.size === 0) return;
    if (this.ws || this.connecting) return;
    void this.connect();
  }

  private onAppStateChange = (state: AppStateStatus) => {
    if (state === "active" && this.desiredChannels.size > 0) {
      this.ensureStarted();
    }
  };

  private async connect() {
    if (this.connecting || this.ws) return;
    this.connecting = true;
    this.intentionalClose = false;
    try {
      const token = await getAccessToken();
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
        this.setConnected(true);
        this.flushSubscriptions();
        this.startPing();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as RealtimeServerEvent;
          if (data.type === "message.created") {
            for (const handler of this.messageHandlers) handler(data);
          } else if (data.type === "inbox.updated") {
            for (const handler of this.inboxHandlers) handler(data);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };

      ws.onclose = () => {
        this.connecting = false;
        this.ws = null;
        this.stopPing();
        this.setConnected(false);
        if (!this.intentionalClose && this.desiredChannels.size > 0) {
          this.scheduleReconnect();
        }
      };
    } catch {
      this.connecting = false;
      this.ws = null;
      this.setConnected(false);
      this.scheduleReconnect();
    }
  }

  private flushSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const channels = [...this.desiredChannels];
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
    this.setConnected(false);
  }
}

export const realtimeClient = new RealtimeClient();
