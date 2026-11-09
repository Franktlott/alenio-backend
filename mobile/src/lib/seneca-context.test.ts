import { describe, expect, test } from "bun:test";
import type { SenecaContextOption } from "./seneca-api";
import {
  getSenecaActions,
  getSenecaSuggestedPrompts,
  resolveSenecaContext,
} from "./seneca-context";

const options: SenecaContextOption[] = [
  { type: "personal", name: "Personal", available: true },
  {
    type: "workspace",
    workspaceId: "managed",
    name: "Managed",
    role: "owner",
    available: true,
  },
  {
    type: "workspace",
    workspaceId: "member",
    name: "Member",
    role: "member",
    available: true,
  },
  {
    type: "workspace",
    workspaceId: "unpaid",
    name: "Unpaid",
    role: "team_leader",
    available: false,
  },
];

describe("resolveSenecaContext", () => {
  test("defaults to Personal", () => {
    expect(resolveSenecaContext(undefined, options)).toEqual({ type: "personal" });
  });

  test("keeps an available saved workspace", () => {
    expect(
      resolveSenecaContext(
        { type: "workspace", workspaceId: "managed" },
        options,
      ),
    ).toEqual({ type: "workspace", workspaceId: "managed" });
  });

  test("falls back to Personal for missing or unavailable workspaces", () => {
    expect(
      resolveSenecaContext(
        { type: "workspace", workspaceId: "missing" },
        options,
      ),
    ).toEqual({ type: "personal" });
    expect(
      resolveSenecaContext(
        { type: "workspace", workspaceId: "unpaid" },
        options,
      ),
    ).toEqual({ type: "personal" });
  });
});

describe("Seneca prompt and action selection", () => {
  test("uses personal prompts by default", () => {
    expect(getSenecaSuggestedPrompts(options[0])).toEqual([
      "Create a development goal",
      "Prepare for a coaching conversation",
      "Help me give recognition",
      "Improve my leadership skills",
    ]);
  });

  test("gives managers team-safe actions", () => {
    expect(getSenecaSuggestedPrompts(options[1])).toEqual([
      "Summarize today's activity",
      "What needs attention?",
      "Review team goals",
      "Who needs a check-in?",
    ]);
  });

  test("never gives regular members manager-only actions", () => {
    const memberActions = getSenecaActions(options[2]);
    expect(memberActions.map((action) => action.title)).toEqual([
      "Summarize my work",
      "What needs my attention?",
      "Review my goals",
      "Prepare for my next check-in",
    ]);
    expect(memberActions.some((action) => action.title.includes("team"))).toBe(
      false,
    );
  });
});
