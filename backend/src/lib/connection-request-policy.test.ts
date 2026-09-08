import { describe, expect, test } from "bun:test";
import {
  CONNECTION_REQUEST_COOLDOWN_CODE,
  decideConnectionRequest,
  type ConnectionRequestState,
} from "./connection-request-policy";

describe("decideConnectionRequest", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  test("shared workspace changes a missing row to accepted", () => {
    expect(decideConnectionRequest("none", true)).toEqual({
      action: "create",
      nextStatus: "accepted",
      responseStatus: "connected",
    });
  });

  test("shared workspace changes declined and outgoing pending rows to accepted", () => {
    expect(decideConnectionRequest("declined", true)).toEqual({
      action: "update",
      nextStatus: "accepted",
      resetDirection: true,
      responseStatus: "connected",
    });
    expect(decideConnectionRequest("pending_outgoing", true)).toEqual({
      action: "update",
      nextStatus: "accepted",
      resetDirection: false,
      responseStatus: "connected",
    });
  });

  test("without shared membership, missing and declined rows become pending", () => {
    expect(decideConnectionRequest("none", false)).toEqual({
      action: "create",
      nextStatus: "pending",
      responseStatus: "pending_outgoing",
    });
    expect(decideConnectionRequest("declined", false)).toEqual({
      action: "update",
      nextStatus: "pending",
      resetDirection: true,
      responseStatus: "pending_outgoing",
    });
  });

  test("an active declined-request cooldown blocks every request path", () => {
    const declinedAt = new Date("2026-08-01T12:00:00.000Z");
    for (const sharesWorkspace of [true, false]) {
      expect(
        decideConnectionRequest("declined", sharesWorkspace, {
          declinedAt,
          now,
        }),
      ).toEqual({
        action: "blocked",
        code: CONNECTION_REQUEST_COOLDOWN_CODE,
        remainingSeconds: 21 * 24 * 60 * 60,
        retryAt: new Date("2026-08-31T12:00:00.000Z"),
      });
    }
  });

  test("normal shared and non-shared policy resumes when cooldown expires", () => {
    const declinedAt = new Date("2026-07-11T12:00:00.000Z");
    expect(
      decideConnectionRequest("declined", true, { declinedAt, now }),
    ).toEqual({
      action: "update",
      nextStatus: "accepted",
      resetDirection: true,
      responseStatus: "connected",
    });
    expect(
      decideConnectionRequest("declined", false, { declinedAt, now }),
    ).toEqual({
      action: "update",
      nextStatus: "pending",
      resetDirection: true,
      responseStatus: "pending_outgoing",
    });
  });

  test("an existing outgoing pending request stays pending without shared membership", () => {
    expect(decideConnectionRequest("pending_outgoing", false)).toEqual({
      action: "none",
      responseStatus: "pending_outgoing",
    });
  });

  test("an incoming pending request accepts independently of shared membership", () => {
    for (const sharesWorkspace of [true, false]) {
      expect(decideConnectionRequest("pending_incoming", sharesWorkspace)).toEqual({
        action: "update",
        nextStatus: "accepted",
        resetDirection: false,
        responseStatus: "connected",
      });
    }
  });

  test("post-unblock reconnection always requires a fresh accepted request", () => {
    for (const sharesWorkspace of [true, false]) {
      expect(
        decideConnectionRequest("reconnect_required", sharesWorkspace),
      ).toEqual({
        action: "update",
        nextStatus: "pending",
        resetDirection: true,
        responseStatus: "pending_outgoing",
      });
    }
  });

  test("an accepted connection is unchanged independently of shared membership", () => {
    for (const sharesWorkspace of [true, false]) {
      expect(decideConnectionRequest("accepted", sharesWorkspace)).toEqual({
        action: "none",
        responseStatus: "connected",
      });
    }
  });

  test("covers every persisted/request-relative state", () => {
    const states: ConnectionRequestState[] = [
      "none",
      "accepted",
      "pending_outgoing",
      "pending_incoming",
      "declined",
      "reconnect_required",
    ];

    expect(states.map((state) => decideConnectionRequest(state, true))).toHaveLength(6);
  });
});
