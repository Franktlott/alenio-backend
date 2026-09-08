import { describe, expect, test } from "bun:test";
import {
  canCompleteDevelopmentGoalSteps,
  canManageAssignedDevelopmentGoals,
  canManageCheckIns,
  canManageDevelopmentGoals,
  canManageMemberNextActions,
  canManageSenecaStudio,
  canManageWorkspaceCalendar,
  canManageWorkspaceJoinRequests,
  canManageWorkspaceRelationships,
  canManageWorkspaceRoster,
  canManageWorkspaceSettings,
  canManageWorkspaceSpaces,
  canManageWorkspaceTasks,
  canModerateWorkspaceContent,
  canAccessWorkspaceManagerInsights,
  canViewFormerWorkspaceMembers,
} from "./workspace-role-policy";

const capabilities = [
  canManageWorkspaceRelationships,
  canManageWorkspaceRoster,
  canManageWorkspaceJoinRequests,
  canManageWorkspaceSettings,
  canManageDevelopmentGoals,
  canManageCheckIns,
  canManageMemberNextActions,
  canViewFormerWorkspaceMembers,
  canManageWorkspaceCalendar,
  canManageWorkspaceSpaces,
  canManageWorkspaceTasks,
  canModerateWorkspaceContent,
  canAccessWorkspaceManagerInsights,
  canManageSenecaStudio,
];

describe("workspace role capability policy", () => {
  test("owner and team leader have relationship management capabilities", () => {
    for (const capability of capabilities) {
      expect(capability("owner")).toBe(true);
      expect(capability("team_leader")).toBe(true);
    }
  });

  test("legacy admin, member, unknown, and missing roles are read-only", () => {
    for (const capability of capabilities) {
      expect(capability("admin")).toBe(false);
      expect(capability("member")).toBe(false);
      expect(capability("unknown")).toBe(false);
      expect(capability(null)).toBe(false);
      expect(capability(undefined)).toBe(false);
    }
  });

  test("leaders and assigned members can complete development goal steps", () => {
    expect(canCompleteDevelopmentGoalSteps("owner", "owner-1", "member-1")).toBe(true);
    expect(canCompleteDevelopmentGoalSteps("team_leader", "leader-1", "member-1")).toBe(true);
    expect(canCompleteDevelopmentGoalSteps("member", "member-1", "member-1")).toBe(true);
    expect(canCompleteDevelopmentGoalSteps("member", "member-2", "member-1")).toBe(false);
  });

  test("leaders and assigned members can manage development goals", () => {
    expect(canManageAssignedDevelopmentGoals("owner", "owner-1", "member-1")).toBe(true);
    expect(canManageAssignedDevelopmentGoals("team_leader", "leader-1", "member-1")).toBe(true);
    expect(canManageAssignedDevelopmentGoals("member", "member-1", "member-1")).toBe(true);
    expect(canManageAssignedDevelopmentGoals("member", "member-2", "member-1")).toBe(false);
  });
});
