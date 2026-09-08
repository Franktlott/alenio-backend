export const ACTIVE_PRESENCE_WINDOW_MS = 5 * 60 * 1000;
export const HEARTBEAT_WRITE_THROTTLE_MS = 60 * 1000;

export function shouldWritePresenceHeartbeat(
  lastActiveAt: Date | null,
  now = new Date(),
): boolean {
  if (!lastActiveAt) return true;
  return now.getTime() - lastActiveAt.getTime() > HEARTBEAT_WRITE_THROTTLE_MS;
}

type ConnectionPresenceInput = {
  connectionAccepted: boolean;
  blockedEitherWay: boolean;
  showActiveStatus: boolean;
  lastActiveAt: Date | null;
  now?: Date;
};

export function isConnectionActiveNow({
  connectionAccepted,
  blockedEitherWay,
  showActiveStatus,
  lastActiveAt,
  now = new Date(),
}: ConnectionPresenceInput): boolean {
  if (!connectionAccepted || blockedEitherWay || !showActiveStatus || !lastActiveAt) {
    return false;
  }

  const elapsedMs = now.getTime() - lastActiveAt.getTime();
  return elapsedMs >= 0 && elapsedMs <= ACTIVE_PRESENCE_WINDOW_MS;
}
