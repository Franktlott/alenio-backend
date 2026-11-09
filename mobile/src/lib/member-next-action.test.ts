import { describe, expect, test } from "bun:test";
import type { MemberNextAction, MemberNextActionId } from "./types";
import { resolveMemberNextActionExecution } from "./member-next-action";

function action(
  id: MemberNextActionId,
  route: NonNullable<MemberNextAction["cta"]>["route"],
  params: Record<string, string> = {
    teamId: "team-1",
    memberUserId: "member-1",
  },
) {
  return { id, cta: { route, params } } as Pick<MemberNextAction, "id" | "cta">;
}

describe("resolveMemberNextActionExecution", () => {
  test("starts first and overdue check-ins in Workspace Development", () => {
    expect(
      resolveMemberNextActionExecution(action("first_check_in", "/(app)/execute")),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "check-ins",
        developmentSection: "check-ins",
        startCheckIn: "true",
      },
    });
    expect(
      resolveMemberNextActionExecution(action("overdue_check_in", "/(app)/execute")),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "check-ins",
        developmentSection: "check-ins",
        startCheckIn: "true",
      },
    });
  });

  test("opens scheduling with the server parameters", () => {
    expect(
      resolveMemberNextActionExecution(
        action("schedule_next_check_in", "/plan-one-on-one"),
      ),
    ).toEqual({
      kind: "navigate",
      pathname: "/plan-one-on-one",
      params: { teamId: "team-1", memberUserId: "member-1" },
    });
  });

  test("opens Workspace Development goals and distinguishes create from review", () => {
    expect(
      resolveMemberNextActionExecution(
        action("no_active_development_goals", "/(app)/execute"),
      ),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "goals",
        developmentSection: "goals",
        createGoal: "true",
      },
    });
    expect(
      resolveMemberNextActionExecution(
        action("development_goal_review_due", "/(app)/execute"),
      ),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        mode: "goals",
        developmentSection: "goals",
      },
    });
  });

  test("maps task actions to member-filtered Workspace Tasks", () => {
    expect(
      resolveMemberNextActionExecution(action("overdue_tasks", "/team-priority")),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        memberTaskFilter: "overdue",
      },
    });
    expect(
      resolveMemberNextActionExecution(action("tasks_due_soon", "/team-priority")),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/execute",
      params: {
        teamId: "team-1",
        memberUserId: "member-1",
        memberTaskFilter: "due-soon",
      },
    });
  });

  test("opens Chat for the on-track fallback", () => {
    expect(
      resolveMemberNextActionExecution(
        action("everything_up_to_date", "/(app)/chat"),
      ),
    ).toEqual({
      kind: "navigate",
      pathname: "/(app)/chat",
      params: { teamId: "team-1", memberUserId: "member-1" },
    });
  });

  test("returns no execution for an unavailable CTA", () => {
    expect(
      resolveMemberNextActionExecution({
        id: "everything_up_to_date",
        cta: null,
      } as unknown as Pick<MemberNextAction, "id" | "cta">),
    ).toBeNull();
  });
});
