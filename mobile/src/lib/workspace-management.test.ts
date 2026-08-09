import { describe, expect, test } from "bun:test";
import {
  canOpenWorkspaceTitleMenu,
  workspaceManagementCapabilities,
} from "./workspace-management";

describe("canOpenWorkspaceTitleMenu", () => {
  test("keeps the menu discoverable for an owner with one workspace", () => {
    expect(
      canOpenWorkspaceTitleMenu({
        enabled: true,
        teamCount: 1,
        activeRole: "owner",
      }),
    ).toBe(true);
  });

  test("opens for members when they have multiple workspaces", () => {
    expect(
      canOpenWorkspaceTitleMenu({
        enabled: true,
        teamCount: 2,
        activeRole: "member",
      }),
    ).toBe(true);
  });

  test("does not expose a single-workspace member menu", () => {
    expect(
      canOpenWorkspaceTitleMenu({
        enabled: true,
        teamCount: 1,
        activeRole: "member",
      }),
    ).toBe(false);
  });
});

describe("workspaceManagementCapabilities", () => {
  test("gives owners all management capabilities", () => {
    expect(workspaceManagementCapabilities("owner")).toEqual({
      canEditDetails: true,
      canManageMembers: true,
      canManagePermissions: true,
      canManageStandards: true,
      canDelete: true,
      canLeave: false,
    });
  });

  test("allows team leaders to manage people but not owner settings", () => {
    expect(workspaceManagementCapabilities("team_leader")).toEqual({
      canEditDetails: true,
      canManageMembers: true,
      canManagePermissions: true,
      canManageStandards: false,
      canDelete: false,
      canLeave: true,
    });
  });

  test("keeps members read-only and allows leaving", () => {
    expect(workspaceManagementCapabilities("member")).toEqual({
      canEditDetails: false,
      canManageMembers: false,
      canManagePermissions: false,
      canManageStandards: false,
      canDelete: false,
      canLeave: true,
    });
  });
});
