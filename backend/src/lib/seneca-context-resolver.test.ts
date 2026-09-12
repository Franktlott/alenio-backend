import { describe, expect, test } from "bun:test";
import { resolveSenecaAskContext } from "./seneca-context-resolver";

const acme = {
  workspaceId: "acme",
  name: "Acme",
  available: true,
};
const north = {
  workspaceId: "north",
  name: "North Store",
  available: true,
};
const unpaid = {
  workspaceId: "unpaid",
  name: "Unpaid Co",
  available: false,
};

describe("resolveSenecaAskContext", () => {
  test("routes personal questions to personal even with two workspaces", () => {
    const result = resolveSenecaAskContext({
      question: "Help me prepare for a coaching conversation",
      workspaces: [acme, north],
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "personal" },
      name: "Personal",
    });
  });

  test("matches a uniquely named workspace", () => {
    const result = resolveSenecaAskContext({
      question: "What is overdue at Acme?",
      workspaces: [acme, north, unpaid],
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "workspace", workspaceId: "acme" },
      name: "Acme",
    });
  });

  test("ignores locked workspaces when matching names", () => {
    const result = resolveSenecaAskContext({
      question: "Summarize Unpaid Co",
      workspaces: [acme, unpaid],
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "personal" },
      name: "Personal",
    });
  });

  test("uses the only entitled workspace for work language", () => {
    const result = resolveSenecaAskContext({
      question: "What tasks are overdue?",
      workspaces: [acme, unpaid],
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "workspace", workspaceId: "acme" },
      name: "Acme",
    });
  });

  test("routes across-workspace questions to all entitled workspaces", () => {
    const result = resolveSenecaAskContext({
      question: "What's going on across workspaces?",
      workspaces: [acme, north],
    });
    expect(result).toEqual({
      kind: "all_authorized",
      name: "your workspaces",
    });
  });

  test("does not keep personal scope for an across-workspace question", () => {
    const result = resolveSenecaAskContext({
      question: "What's going on across workspaces?",
      workspaces: [acme, north],
      lastContext: { type: "personal" },
    });
    expect(result).toEqual({
      kind: "all_authorized",
      name: "your workspaces",
    });
  });

  test("asks which workspace when work language is ambiguous", () => {
    const result = resolveSenecaAskContext({
      question: "What needs attention on the team?",
      workspaces: [acme, north],
    });
    expect(result.kind).toBe("clarify");
    if (result.kind === "clarify") {
      expect(
        result.options.flatMap((option) =>
          option.type === "workspace" ? [option.workspaceId] : [],
        ),
      ).toEqual(["acme", "north"]);
    }
  });

  test("does not stay personal when work language is ambiguous", () => {
    const result = resolveSenecaAskContext({
      question: "What needs attention on the team?",
      workspaces: [acme, north],
      lastContext: { type: "personal" },
    });
    expect(result.kind).toBe("clarify");
  });

  test("sticks to the current workspace on follow-ups", () => {
    const result = resolveSenecaAskContext({
      question: "What about goals?",
      workspaces: [acme, north],
      lastContext: { type: "workspace", workspaceId: "acme" },
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "workspace", workspaceId: "acme" },
      name: "Acme",
    });
  });

  test("switches when a different workspace is named", () => {
    const result = resolveSenecaAskContext({
      question: "Now check North Store overdue tasks",
      workspaces: [acme, north],
      lastContext: { type: "workspace", workspaceId: "acme" },
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "workspace", workspaceId: "north" },
      name: "North Store",
    });
  });

  test("switches to personal when asked", () => {
    const result = resolveSenecaAskContext({
      question: "Switch to personal. Help with my sleep.",
      workspaces: [acme, north],
      lastContext: { type: "workspace", workspaceId: "acme" },
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "personal" },
      name: "Personal",
    });
  });

  test("treats a client hint as optional when no stronger signal exists", () => {
    const result = resolveSenecaAskContext({
      question: "Hello",
      workspaces: [acme, north],
      hint: { type: "workspace", workspaceId: "north" },
    });
    expect(result).toEqual({
      kind: "resolved",
      context: { type: "workspace", workspaceId: "north" },
      name: "North Store",
    });
  });
});
