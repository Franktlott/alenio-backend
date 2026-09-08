import { describe, expect, test } from "bun:test";
import type { Prisma } from "@prisma/client";
import {
  consumeWorkspaceTrial,
  normalizeTrialIdentityEmail,
  workspaceTrialEmailHash,
} from "./workspace-trial-policy";

describe("workspace trial identity", () => {
  test("normalizes aliases and hashes without retaining raw email", () => {
    const normalized = normalizeTrialIdentityEmail("  Owner@Example.COM ");
    expect(normalized).toBe("owner@example.com");
    const hash = workspaceTrialEmailHash(normalized!);
    expect(hash).toBe(workspaceTrialEmailHash("OWNER@example.com"));
    expect(hash).not.toContain("example.com");
    expect(hash).toHaveLength(64);
  });

  test("rejects a durable identity that already consumed a trial", async () => {
    const tx = {
      workspaceTrialIdentity: {
        findUnique: async () => ({ trialConsumedAt: new Date() }),
      },
    } as unknown as Prisma.TransactionClient;
    expect(await consumeWorkspaceTrial(tx, "user-1", "owner@example.com", new Date())).toBe(false);
  });

  test("uses the user row as an atomic one-time lock", async () => {
    const identityUpdates: unknown[] = [];
    const tx = {
      workspaceTrialIdentity: {
        findUnique: async () => null,
        upsert: async () => ({}),
        findFirst: async () => null,
        updateMany: async (args: unknown) => {
          identityUpdates.push(args);
          return { count: 1 };
        },
      },
      user: {
        updateMany: async () => ({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;
    const at = new Date("2026-08-29T12:00:00.000Z");
    expect(await consumeWorkspaceTrial(tx, "user-1", "owner@example.com", at)).toBe(true);
    expect(identityUpdates).toHaveLength(1);
  });

  test("losing a concurrent reservation does not consume twice", async () => {
    const tx = {
      workspaceTrialIdentity: {
        findUnique: async () => null,
        upsert: async () => ({}),
        findFirst: async () => null,
      },
      user: {
        updateMany: async () => ({ count: 0 }),
      },
    } as unknown as Prisma.TransactionClient;
    expect(await consumeWorkspaceTrial(tx, "user-1", "owner@example.com", new Date())).toBe(false);
  });
});
