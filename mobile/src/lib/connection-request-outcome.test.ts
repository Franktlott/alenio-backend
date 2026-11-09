import { describe, expect, test } from "bun:test";
import { connectionRequestOutcome } from "./connection-request-outcome";
import type { ConnectionRequestResponse } from "./types";

function response(
  status: ConnectionRequestResponse["status"],
): ConnectionRequestResponse {
  return { status };
}

describe("connectionRequestOutcome", () => {
  test("reports an authoritative shared-workspace connection immediately", () => {
    expect(connectionRequestOutcome(response("connected"))).toEqual({
      status: "connected",
      toastTitle: "Connected",
      statusLabel: "Connected",
      isConnected: true,
    });
  });

  test("reports a non-shared request as pending", () => {
    expect(connectionRequestOutcome(response("pending_outgoing"))).toEqual({
      status: "pending_outgoing",
      toastTitle: "Connection request sent",
      statusLabel: "Requested",
      isConnected: false,
    });
  });

  test("preserves unexpected authoritative statuses without guessing", () => {
    expect(connectionRequestOutcome(response("blocked"))).toEqual({
      status: "blocked",
      toastTitle: "Connection updated",
      statusLabel: "Updated",
      isConnected: false,
    });
  });
});
