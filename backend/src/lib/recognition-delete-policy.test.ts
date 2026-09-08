import { describe, expect, test } from "bun:test";
import {
  canDeleteSentRecognition,
  sentRecognitionDeleteUntil,
} from "./recognition-delete-policy";

describe("recognition delete policy", () => {
  const createdAt = new Date("2026-08-29T12:00:00.000Z");

  test("allows a sender to delete through five minutes", () => {
    expect(canDeleteSentRecognition(createdAt, new Date("2026-08-29T12:04:59.999Z"))).toBe(true);
    expect(canDeleteSentRecognition(createdAt, new Date("2026-08-29T12:05:00.000Z"))).toBe(true);
  });

  test("closes the sender delete window after five minutes", () => {
    expect(canDeleteSentRecognition(createdAt, new Date("2026-08-29T12:05:00.001Z"))).toBe(false);
    expect(sentRecognitionDeleteUntil(createdAt).toISOString()).toBe("2026-08-29T12:05:00.000Z");
  });
});
