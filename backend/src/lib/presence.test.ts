import { describe, expect, test } from "bun:test";
import {
  ACTIVE_PRESENCE_WINDOW_MS,
  HEARTBEAT_WRITE_THROTTLE_MS,
  isConnectionActiveNow,
  shouldWritePresenceHeartbeat,
} from "./presence";

const NOW = new Date("2026-08-09T12:00:00.000Z");
const ago = (milliseconds: number) => new Date(NOW.getTime() - milliseconds);

describe("shouldWritePresenceHeartbeat", () => {
  test("writes the first heartbeat", () => {
    expect(shouldWritePresenceHeartbeat(null, NOW)).toBe(true);
  });

  test("throttles writes through 60 seconds and permits stale writes", () => {
    expect(shouldWritePresenceHeartbeat(ago(HEARTBEAT_WRITE_THROTTLE_MS - 1), NOW)).toBe(false);
    expect(shouldWritePresenceHeartbeat(ago(HEARTBEAT_WRITE_THROTTLE_MS), NOW)).toBe(false);
    expect(shouldWritePresenceHeartbeat(ago(HEARTBEAT_WRITE_THROTTLE_MS + 1), NOW)).toBe(true);
  });
});

describe("isConnectionActiveNow", () => {
  const visiblePresence = {
    connectionAccepted: true,
    blockedEitherWay: false,
    showActiveStatus: true,
    lastActiveAt: ago(ACTIVE_PRESENCE_WINDOW_MS),
    now: NOW,
  };

  test("uses an inclusive five-minute active window", () => {
    expect(isConnectionActiveNow(visiblePresence)).toBe(true);
    expect(
      isConnectionActiveNow({
        ...visiblePresence,
        lastActiveAt: ago(ACTIVE_PRESENCE_WINDOW_MS + 1),
      }),
    ).toBe(false);
  });

  test("respects active-status opt-out", () => {
    expect(isConnectionActiveNow({ ...visiblePresence, showActiveStatus: false })).toBe(false);
  });

  test("requires an accepted connection", () => {
    expect(isConnectionActiveNow({ ...visiblePresence, connectionAccepted: false })).toBe(false);
  });

  test("hides presence when either direction is blocked", () => {
    expect(isConnectionActiveNow({ ...visiblePresence, blockedEitherWay: true })).toBe(false);
  });

  test("does not treat missing or future activity as active", () => {
    expect(isConnectionActiveNow({ ...visiblePresence, lastActiveAt: null })).toBe(false);
    expect(
      isConnectionActiveNow({
        ...visiblePresence,
        lastActiveAt: new Date(NOW.getTime() + 1),
      }),
    ).toBe(false);
  });
});
