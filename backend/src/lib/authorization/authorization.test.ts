import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { actorFromSession, authorize, AUTHZ_NOT_FOUND_MESSAGE } from "./index";
import { listVisibleRoster, listVisibleTasks } from "../authorized-data";
import { maskCheckInResponsesForViewer, getCheckInView } from "../authorized-data/check-ins";
import { historyTurnStillAuthorized } from "../seneca-conversations";
import { executeSenecaTool } from "../seneca-tools";
import { resolveSenecaToolScope } from "../seneca-tool-scope";

function subscription(teamId: string, plan: "team" | "free" = "team") {
  return {
    findUnique: async () => ({
      teamId,
      plan,
      status: "active",
      trialStartedAt: null,
      trialEndsAt: null,
    }),
    updateMany: async () => ({ count: 0 }),
  };
}

function dualRoleDb(): PrismaClient {
  return {
    teamMember: {
      findUnique: async ({ where }: { where: { userId_teamId: { teamId: string } } }) => {
        const teamId = where.userId_teamId.teamId;
        if (teamId === "workspace-a") {
          return { role: "team_leader", team: { organizationId: "org-1" } };
        }
        if (teamId === "workspace-b") {
          return { role: "member", team: { organizationId: "org-1" } };
        }
        return null;
      },
      findMany: async () => [{ teamId: "workspace-a" }, { teamId: "workspace-b" }],
    },
    teamSubscription: {
      findUnique: async ({ where }: { where: { teamId: string } }) => ({
        teamId: where.teamId,
        plan: "team",
        status: "active",
        trialStartedAt: null,
        trialEndsAt: null,
      }),
      updateMany: async () => ({ count: 0 }),
    },
    team: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        name: where.id === "workspace-a" ? "A" : "B",
        organizationId: "org-1",
      }),
    },
    user: {
      findUnique: async () => ({ profileTitle: "Floor lead", timezone: "UTC" }),
    },
    task: {
      findMany: async ({ where }: { where: { teamId: string } }) => {
        if (where.teamId === "workspace-a") {
          return [
            {
              id: "task-a",
              title: "Roster task",
              status: "open",
              priority: "high",
              dueDate: new Date("2020-01-01"),
              kind: "workspace_task",
              assignments: [{ user: { id: "other", name: "Sam" } }],
            },
          ];
        }
        return [];
      },
    },
    oneOnOneMeeting: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "meeting-a") {
          return {
            id: "meeting-a",
            teamId: "workspace-a",
            memberUserId: "other",
            templateTitle: "A",
            templateFields: "[]",
            responses: "{}",
            status: "published",
            publishedAt: new Date(),
            createdAt: new Date(),
            createdById: "user-1",
          };
        }
        if (where.id !== "meeting-1") return null;
        return {
          id: "meeting-1",
          teamId: "workspace-b",
          memberUserId: "user-1",
          templateTitle: "Weekly",
          templateFields: JSON.stringify([
            { id: "q1", label: "Wins", type: "text" },
            { id: "notes", label: "Summary", type: "manager_notes" },
          ]),
          responses: JSON.stringify({ q1: "Shipped", notes: "Private coaching" }),
          status: "published",
          publishedAt: new Date("2026-01-01"),
          createdAt: new Date("2026-01-01"),
          createdById: "mgr",
        };
      },
    },
    calendarEvent: { findMany: async () => [] },
    developmentGoal: { findMany: async () => [] },
  } as unknown as PrismaClient;
}

describe("authorization kernel", () => {
  test("actor comes only from the session user id", () => {
    expect(actorFromSession({ id: "user-1" })).toEqual({ userId: "user-1" });
    expect(actorFromSession(null)).toBeNull();
  });

  test("manager in A and member in B do not merge roles", async () => {
    const db = dualRoleDb();
    const actor = { userId: "user-1" };
    const a = await authorize({
      actor,
      action: "checkin.view_leader_notes",
      resource: { type: "checkin", id: "meeting-a" },
      db,
    });
    const bNotes = await authorize({
      actor,
      action: "checkin.view_leader_notes",
      resource: { type: "checkin", id: "meeting-1" },
      db,
    });
    expect(a.allow).toBe(true);
    expect(bNotes.allow).toBe(false);
    const summary = await authorize({
      actor,
      action: "checkin.view_summary",
      resource: { type: "checkin", id: "meeting-1" },
      db,
    });
    expect(summary.allow).toBe(true);
  });

  test("removed membership is not found", async () => {
    const db = dualRoleDb();
    const decision = await authorize({
      actor: { userId: "user-1" },
      action: "seneca.use",
      resource: { type: "workspace", id: "forged-id" },
      db,
    });
    expect(decision).toMatchObject({ allow: false, code: "NOT_FOUND", message: AUTHZ_NOT_FOUND_MESSAGE });
  });

  test("billing.view is owner only while check-in notes stay role-based", async () => {
    const db = {
      teamMember: {
        findUnique: async () => ({ role: "member", team: { organizationId: null } }),
      },
      teamSubscription: subscription("workspace-1"),
    } as unknown as PrismaClient;
    const actor = { userId: "member-1" };
    const billing = await authorize({
      actor,
      action: "billing.view",
      resource: { type: "workspace", id: "workspace-1" },
      db,
    });
    const ownerDb = {
      teamMember: {
        findUnique: async () => ({ role: "owner", team: { organizationId: null } }),
      },
      teamSubscription: subscription("workspace-1"),
      oneOnOneMeeting: {
        findUnique: async () => ({
          id: "m1",
          teamId: "workspace-1",
          memberUserId: "other",
          status: "published",
          createdById: "owner-1",
        }),
      },
    } as unknown as PrismaClient;
    const ownerBilling = await authorize({
      actor: { userId: "owner-1" },
      action: "billing.view",
      resource: { type: "workspace", id: "workspace-1" },
      db: ownerDb,
    });
    const ownerNotes = await authorize({
      actor: { userId: "owner-1" },
      action: "checkin.view_leader_notes",
      resource: { type: "checkin", id: "m1" },
      db: ownerDb,
    });
    expect(billing.allow).toBe(false);
    expect(ownerBilling.allow).toBe(true);
    expect(ownerNotes.allow).toBe(true);
  });

  test("hidden calendar events stay creator or assignee only", async () => {
    const db = {
      teamMember: {
        findUnique: async () => ({ role: "member", team: { organizationId: null } }),
      },
      teamSubscription: subscription("workspace-1"),
      calendarEvent: {
        findUnique: async () => ({
          id: "evt-1",
          teamId: "workspace-1",
          isHidden: true,
          approvalStatus: "approved",
          createdById: "creator",
          isVideoMeeting: true,
          isOneOnOne: false,
          oneOnOneMemberUserId: null,
          reminderMinutes: JSON.stringify({ assigneeIds: ["user-1"] }),
        }),
      },
    } as unknown as PrismaClient;
    const assignee = await authorize({
      actor: { userId: "user-1" },
      action: "event.view",
      resource: { type: "event", id: "evt-1" },
      db,
    });
    const stranger = await authorize({
      actor: { userId: "stranger" },
      action: "event.view",
      resource: { type: "event", id: "evt-1" },
      db,
    });
    expect(assignee.allow).toBe(true);
    expect(stranger.allow).toBe(false);
  });
});

describe("authorized data and field masks", () => {
  test("strips manager_notes unless the viewer may see leader notes", () => {
    const fields = [
      { id: "q1", type: "text" },
      { id: "notes", type: "manager_notes" },
    ];
    const responses = { q1: "ok", notes: "secret" };
    expect(maskCheckInResponsesForViewer(fields, responses, false)).toEqual({ q1: "ok" });
    expect(maskCheckInResponsesForViewer(fields, responses, true)).toEqual(responses);
  });

  test("associates get published summaries without notes", async () => {
    const view = await getCheckInView({ userId: "user-1" }, "meeting-1", dualRoleDb());
    expect(view?.summary.templateTitle).toBe("Weekly");
    expect(view?.leaderNotes).toBeNull();
  });

  test("task counts use the authorized page, not hidden totals", async () => {
    const listed = await listVisibleTasks(
      { userId: "user-1" },
      { workspaceId: "workspace-b" },
      dualRoleDb(),
    );
    expect(listed.status).toBe("ok");
    if (listed.status === "ok") {
      expect(listed.count).toBe(listed.items.length);
      expect(listed.items).toEqual([]);
    }
  });

  test("the same authorize helper is used by serializers and tools", async () => {
    const db = dualRoleDb();
    const viaAuthorize = await authorize({
      actor: { userId: "user-1" },
      action: "checkin.view_leader_notes",
      resource: { type: "checkin", id: "meeting-1" },
      db,
    });
    const viaView = await getCheckInView({ userId: "user-1" }, "meeting-1", db);
    expect(viaAuthorize.allow).toBe(false);
    expect(viaView?.leaderNotes).toBeNull();
  });
});

describe("Seneca tools and scope", () => {
  test("cross-org combine is blocked", async () => {
    const db = {
      user: { findUnique: async () => ({ profileTitle: "Lead" }) },
      teamMember: {
        findUnique: async ({
          where,
        }: {
          where: { userId_teamId: { teamId: string } };
        }) => ({
          role: "owner",
          team: {
            organizationId: where.userId_teamId.teamId === "w1" ? "org-a" : "org-b",
          },
        }),
      },
      teamSubscription: {
        findUnique: async () => ({
          teamId: "w",
          plan: "team",
          status: "active",
          trialStartedAt: null,
          trialEndsAt: null,
        }),
        updateMany: async () => ({ count: 0 }),
      },
      team: {
        findUnique: async ({ where }: { where: { id: string } }) => ({
          name: where.id,
          organizationId: where.id === "w1" ? "org-a" : "org-b",
        }),
      },
    } as unknown as PrismaClient;
    const result = await resolveSenecaToolScope({
      actor: { userId: "user-1" },
      mode: "selected",
      selectedWorkspaceIds: ["w1", "w2"],
      db,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("POLICY_UNDEFINED");
  });

  test("forged workspace ids return unavailable without contents", async () => {
    const result = await executeSenecaTool({
      actor: { userId: "user-1" },
      name: "list_visible_tasks",
      argumentsJson: JSON.stringify({ workspaceId: "forged", userId: "victim" }),
      allowedWorkspaceIds: new Set(["workspace-a"]),
      scopeMode: "current",
      currentWorkspaceId: "workspace-a",
      db: dualRoleDb(),
    });
    expect(result).toEqual({
      status: "unavailable",
      workspaceId: "forged",
      reason: "unavailable",
    });
  });

  test("prompt injection in tool args cannot change the actor", async () => {
    const result = await executeSenecaTool({
      actor: { userId: "user-1" },
      name: "list_checkin_summaries",
      argumentsJson: JSON.stringify({
        workspaceId: "workspace-b",
        memberUserId: "someone-else",
        userId: "admin",
      }),
      allowedWorkspaceIds: new Set(["workspace-b"]),
      scopeMode: "current",
      currentWorkspaceId: "workspace-b",
      db: {
        ...dualRoleDb(),
        oneOnOneMeeting: {
          findMany: async () => {
            throw new Error("should not list another member's check-ins");
          },
        },
      } as unknown as PrismaClient,
    });
    expect(result).toMatchObject({ status: "unavailable", workspaceId: "workspace-b" });
  });

  test("manager roster is unavailable to members", async () => {
    const member = await listVisibleRoster(
      { userId: "user-1" },
      { workspaceId: "workspace-b" },
      dualRoleDb(),
    );
    expect(member.status).toBe("unavailable");
    const leader = await listVisibleRoster(
      { userId: "user-1" },
      { workspaceId: "workspace-a" },
      {
        ...dualRoleDb(),
        teamMember: {
          ...dualRoleDb().teamMember,
          findMany: async () => [
            { userId: "user-1", role: "team_leader", user: { name: "Pat", email: "p@x" } },
            { userId: "other", role: "member", user: { name: "Sam", email: "s@x" } },
          ],
        },
      } as unknown as PrismaClient,
    );
    expect(leader.status).toBe("ok");
    if (leader.status === "ok") {
      expect(leader.items.map((row) => row.name)).toEqual(["Pat", "Sam"]);
    }
  });

  test("partial failure is unavailable, not an empty list", async () => {
    const result = await executeSenecaTool({
      actor: { userId: "user-1" },
      name: "list_attention_items",
      argumentsJson: JSON.stringify({ workspaceId: "workspace-missing" }),
      allowedWorkspaceIds: new Set(["workspace-a"]),
      scopeMode: "current",
      db: dualRoleDb(),
    });
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result).not.toMatchObject({ items: [] });
  });

  test("profileTitle is language only", async () => {
    const scoped = await resolveSenecaToolScope({
      actor: { userId: "user-1" },
      mode: "current",
      currentWorkspaceId: "workspace-b",
      db: dualRoleDb(),
    });
    expect(scoped.ok).toBe(true);
    if (scoped.ok) {
      expect(scoped.workspaces[0]?.position).toBe("Floor lead");
      expect(scoped.workspaces[0]?.capabilities.canUseManagerContext).toBe(false);
    }
  });
});

describe("history revocation", () => {
  test("drops manager turns after demotion", async () => {
    const db = {
      teamMember: {
        findUnique: async () => ({ role: "member" }),
      },
      teamSubscription: subscription("workspace-a"),
    } as unknown as PrismaClient;
    const ok = await historyTurnStillAuthorized(
      "user-1",
      {
        resolvedContext: { type: "workspace", workspaceId: "workspace-a" },
        turnCapabilityMode: "manager",
        citedWorkspaceIds: ["workspace-a"],
      },
      db,
    );
    expect(ok).toBe(false);
  });

  test("drops mixed-workspace assistant turns if any workspace is revoked", async () => {
    const db = dualRoleDb();
    const ok = await historyTurnStillAuthorized(
      "user-1",
      {
        resolvedContext: { type: "workspace", workspaceId: "workspace-a" },
        turnCapabilityMode: "manager",
        citedWorkspaceIds: ["workspace-a", "left-team"],
      },
      db,
    );
    expect(ok).toBe(false);
  });
});
