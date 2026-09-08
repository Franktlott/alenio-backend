import { describe, expect, test } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import {
  formatSenecaConversation,
  resolveSenecaQuestion,
  resolveSenecaScope,
  senecaAskBodySchema,
  senecaRoleCapabilities,
  validateSenecaContextRef,
  workspaceHasSenecaEntitlement,
} from "./seneca-scope";
import {
  buildPersonalContextFromProfile,
  senecaPersonalContextToPrompt,
} from "./seneca-personal-context";
import { memberWorkspaceGrounding } from "./seneca-member-workspace-context";
import { groundingRulesForSenecaScope } from "./seneca-prompt-assembly";

function scopeTestDb(role: string | null, plan: "team" | "free" = "team"): PrismaClient {
  return {
    teamMember: {
      findUnique: async () => (role ? { role } : null),
    },
    teamSubscription: {
      findUnique: async () => ({
        teamId: "workspace-1",
        plan,
        status: "active",
        trialStartedAt: null,
        trialEndsAt: null,
      }),
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as PrismaClient;
}

describe("Seneca scope validation", () => {
  test("accepts exactly one explicit context discriminant", () => {
    expect(validateSenecaContextRef({ type: "personal" })).toEqual({ type: "personal" });
    expect(
      validateSenecaContextRef({ type: "workspace", workspaceId: "workspace-1" }),
    ).toEqual({ type: "workspace", workspaceId: "workspace-1" });
    expect(validateSenecaContextRef({ type: "personal", workspaceId: "workspace-1" })).toBeNull();
    expect(validateSenecaContextRef({ workspaceId: "workspace-1" })).toBeNull();
    expect(validateSenecaContextRef({ type: "workspace" })).toBeNull();
  });

  test("rejects implicit and ambiguous ask payloads", () => {
    expect(senecaAskBodySchema.safeParse({ question: "Help me" }).success).toBe(false);
    expect(
      senecaAskBodySchema.safeParse({
        context: { type: "personal" },
        workspaceId: "workspace-1",
        question: "Help me",
      }).success,
    ).toBe(false);
  });

  test("accepts attachment-only asks and resolves the visible review prompt", () => {
    process.env.FIREBASE_STORAGE_BUCKET = "alenio-test.appspot.com";
    const parsed = senecaAskBodySchema.parse({
      context: { type: "personal" },
      attachment: {
        url: "https://firebasestorage.googleapis.com/v0/b/alenio-test.appspot.com/o/users%2Fuser-1%2Fuploads%2F123-file.pdf?alt=media",
        mimeType: "application/pdf",
        fileName: "file.pdf",
        sizeBytes: 100,
      },
    });
    expect(resolveSenecaQuestion(parsed)).toBe(
      "Review this attachment and summarize the key information, risks, and useful next steps.",
    );
    expect(
      senecaAskBodySchema.safeParse({ context: { type: "personal" } }).success,
    ).toBe(false);
  });
});

describe("Seneca role capabilities", () => {
  test("all members can use workspace Seneca but only leaders get manager context", () => {
    expect(senecaRoleCapabilities("member")).toEqual({
      canUseWorkspaceSeneca: true,
      canUseManagerContext: false,
      canReceiveManagerProposals: false,
    });
    for (const role of ["owner", "team_leader"]) {
      expect(senecaRoleCapabilities(role)).toEqual({
        canUseWorkspaceSeneca: true,
        canUseManagerContext: true,
        canReceiveManagerProposals: true,
      });
    }
  });

  test("workspace scope requires the existing paid team entitlement", () => {
    expect(workspaceHasSenecaEntitlement({ hasTeamFeatures: true })).toBe(true);
    expect(workspaceHasSenecaEntitlement({ hasTeamFeatures: false })).toBe(false);
  });

  test("resolves personal, member, stale, and unpaid scopes safely", async () => {
    await expect(
      resolveSenecaScope("user-1", { type: "personal" }, scopeTestDb(null)),
    ).resolves.toEqual({
      ok: true,
      scope: { type: "personal", userId: "user-1" },
    });

    const member = await resolveSenecaScope(
      "user-1",
      { type: "workspace", workspaceId: "workspace-1" },
      scopeTestDb("member"),
    );
    expect(member.ok && member.scope.type === "workspace").toBe(true);
    if (member.ok && member.scope.type === "workspace") {
      expect(member.scope.capabilities.canUseManagerContext).toBe(false);
    }

    const stale = await resolveSenecaScope(
      "user-1",
      { type: "workspace", workspaceId: "workspace-1" },
      scopeTestDb(null),
    );
    expect(stale).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const unpaid = await resolveSenecaScope(
      "user-1",
      { type: "workspace", workspaceId: "workspace-1" },
      scopeTestDb("owner", "free"),
    );
    expect(unpaid).toMatchObject({ ok: false, code: "SENECA_UNAVAILABLE" });
  });
});

describe("Seneca grounding", () => {
  test("personal context contains only supplied account/profile fields", () => {
    const context = buildPersonalContextFromProfile({
      name: "Alex",
      username: "alex",
      profileTitle: "Associate",
      profileOrganization: "Example",
      profileLocation: "Boston",
      profileBio: "Learning every day",
      timezone: "America/New_York",
    });
    const prompt = senecaPersonalContextToPrompt(context);

    expect(context.scope).toBe("personal_only");
    expect(prompt).toContain("authenticated user's own account/profile fields");
    expect(prompt).not.toContain("workspaceId");
    expect(prompt).not.toContain("teamHealth");
    expect(prompt).not.toContain("membersNeedingCheckIn");
  });

  test("member grounding explicitly denies team-wide and manager-private data", () => {
    const grounding = memberWorkspaceGrounding("member");
    expect(grounding).toContain("Never infer");
    expect(grounding).toContain("another member's data");
    expect(grounding).toContain("manager-only actions");
  });

  test("personal prompt assembly excludes workspace data grounding", () => {
    const grounding = groundingRulesForSenecaScope("personal_only");
    expect(grounding).toContain("scope is personal_only");
    expect(grounding).not.toContain("memberStats.overdueTasks");
    expect(grounding).not.toContain("teamHealth");
  });

  test("conversation grounding keeps only the latest twelve prior turns", () => {
    const messages = Array.from({ length: 14 }, (_, index) => ({
      role: "user" as const,
      content: `message-${index}`,
    }));
    const prompt = formatSenecaConversation(messages, "latest");
    expect(prompt).not.toContain("User: message-0\n");
    expect(prompt).not.toContain("User: message-1\n");
    expect(prompt).toContain("User: message-2\n");
    expect(prompt).toContain("User: latest");
  });
});
