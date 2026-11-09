import { describe, expect, test } from "bun:test";
import { checkApproval, isEditableStatus, sendCampaign, statusAfterApproval } from "./push-campaigns";

describe("push campaign approval", () => {
  const pending = { status: "pending", createdById: "u-writer", submittedById: "u-writer" };

  test("the writer can never approve their own campaign", () => {
    expect(checkApproval(pending, "u-writer")).toEqual({
      ok: false,
      code: "SAME_APPROVER",
      message: "A different admin has to approve this notification.",
    });
  });

  test("someone who only submitted it can't approve it either", () => {
    expect(checkApproval({ ...pending, submittedById: "u-submitter" }, "u-submitter").ok).toBe(false);
  });

  test("a second admin can approve a pending campaign", () => {
    expect(checkApproval(pending, "u-reviewer")).toEqual({ ok: true });
    expect(checkApproval({ ...pending, status: "draft" }, "u-reviewer").ok).toBe(false);
  });

  test("approved campaigns go out now unless scheduled for later", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(statusAfterApproval({ deliveryMode: "immediate", scheduledAt: null }, now)).toBe("approved");
    expect(statusAfterApproval({ deliveryMode: "scheduled", scheduledAt: new Date("2026-11-08T09:00:00Z") }, now)).toBe("scheduled");
    expect(statusAfterApproval({ deliveryMode: "scheduled", scheduledAt: new Date("2026-11-07T11:00:00Z") }, now)).toBe("approved");
  });

  test("only drafts and rejected campaigns are editable", () => {
    expect(["draft", "rejected", "pending", "scheduled", "sent"].map(isEditableStatus)).toEqual([true, true, false, false, false]);
  });
});

describe("sendCampaign", () => {
  function fakeDb(initialStatus: string) {
    const row = {
      id: "c1",
      status: initialStatus,
      title: "Hi",
      body: "There",
      audienceKind: "all",
      audienceTeamId: null,
      linkKind: "discover",
      linkValue: "fasp",
      scheduledAt: null as Date | null,
      recipientCount: 0,
      deliveredCount: 0,
    };
    const db = {
      pushCampaign: {
        // Mirrors the guarded claim: only an approved (or due scheduled) row flips to sending.
        updateMany: async ({ where, data }: { where: { OR: Array<{ status: string }> }; data: { status: string } }) => {
          const claimable = where.OR.some((clause) => clause.status === row.status);
          if (!claimable) return { count: 0 };
          row.status = data.status;
          return { count: 1 };
        },
        findUnique: async () => ({ ...row }),
        update: async ({ data }: { data: Partial<typeof row> }) => Object.assign(row, data),
      },
    };
    return { row, db: db as never };
  }

  test("sends once with campaign data and records counts", async () => {
    const { row, db } = fakeDb("approved");
    const calls: unknown[][] = [];
    const sent = await sendCampaign("c1", {
      db,
      recipients: async () => ["u1", "u2", "u3"],
      send: (async (...args: unknown[]) => {
        calls.push(args);
        return 2;
      }) as never,
    });
    expect(sent).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toEqual({ type: "campaign", campaignId: "c1", linkKind: "discover", linkValue: "fasp" });
    expect(calls[0]?.[4]).toBe("notifProductUpdates");
    expect(row.status).toBe("sent");
    expect(row.recipientCount).toBe(3);
    expect(row.deliveredCount).toBe(2);
  });

  test("a second caller can't send it again", async () => {
    const { db } = fakeDb("approved");
    let sends = 0;
    const deps = { db, recipients: async () => ["u1"], send: (async () => ++sends) as never };
    const [first, second] = await Promise.all([sendCampaign("c1", deps), sendCampaign("c1", deps)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(sends).toBe(1);
  });

  test("drafts and pending campaigns are never sent", async () => {
    for (const status of ["draft", "pending", "sent", "rejected"]) {
      const { db } = fakeDb(status);
      expect(await sendCampaign("c1", { db, recipients: async () => ["u1"], send: (async () => 1) as never })).toBe(false);
    }
  });
});
