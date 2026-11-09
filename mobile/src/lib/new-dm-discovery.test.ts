import { describe, expect, test } from "bun:test";
import {
  connectionStatusAfterAction,
  resolveNewDmRowAction,
} from "./new-dm-discovery";

describe("new message discovery actions", () => {
  test("maps relationship and privacy state to the correct action", () => {
    expect(
      resolveNewDmRowAction({ connectionStatus: "connected", canMessage: true }),
    ).toBe("message");
    expect(
      resolveNewDmRowAction({ connectionStatus: "none", canMessage: true }),
    ).toBe("message");
    expect(
      resolveNewDmRowAction({ connectionStatus: "pending_incoming", canMessage: true }),
    ).toBe("accept");
    expect(
      resolveNewDmRowAction({ connectionStatus: "pending_outgoing", canMessage: false }),
    ).toBe("requested");
    expect(
      resolveNewDmRowAction({ connectionStatus: "none", canMessage: false }),
    ).toBe("connect");
  });

  test("updates request and acceptance state without stale row actions", () => {
    expect(connectionStatusAfterAction("request", "pending_outgoing")).toEqual({
      connectionStatus: "pending_outgoing",
      canMessage: false,
    });
    expect(connectionStatusAfterAction("request", "connected")).toEqual({
      connectionStatus: "connected",
      canMessage: true,
    });
    expect(connectionStatusAfterAction("accept", "connected")).toEqual({
      connectionStatus: "connected",
      canMessage: true,
    });
  });
});
