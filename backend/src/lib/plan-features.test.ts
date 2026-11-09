import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_PLAN_FEATURES,
  cleanFeatureKeys,
  displayFeatureLines,
  featuresOfDbPlan,
  legacyExtraLines,
  setSavedPlanFeatures,
} from "./plan-features";
import { resolveWorkspaceAccess } from "./workspace-access";
import { workspaceHasSenecaEntitlement } from "./seneca-scope";

afterEach(() => setSavedPlanFeatures({}));

describe("cleanFeatureKeys", () => {
  test("drops unknown keys, keeps catalog order and always includes required features", () => {
    expect(cleanFeatureKeys(["go_walks", "nope", "seneca"])).toEqual(["workspace", "seneca", "go_walks"]);
    expect(cleanFeatureKeys(null)).toEqual(["workspace"]);
  });
});

describe("featuresOfDbPlan", () => {
  test("maps the legacy team plan to Pro and ignores unsold plans", () => {
    expect(featuresOfDbPlan("team")).toEqual(DEFAULT_PLAN_FEATURES.pro);
    expect(featuresOfDbPlan("free")).toEqual([]);
  });

  test("follows saved toggles", () => {
    setSavedPlanFeatures({ pro: ["workspace", "go_checklists"] });
    expect(featuresOfDbPlan("pro")).toEqual(["workspace", "go_checklists"]);
  });
});

describe("workspace access follows plan toggles", () => {
  const sub = { teamId: "t1", plan: "team", status: "active", trialStartedAt: null, trialEndsAt: null };

  test("defaults match the old rules", () => {
    const pro = resolveWorkspaceAccess("t1", sub);
    expect(pro.hasTeamFeatures).toBe(true);
    expect(pro.hasGoFeatures).toBe(false);
    expect(workspaceHasSenecaEntitlement(pro)).toBe(true);
    expect(resolveWorkspaceAccess("t1", { ...sub, plan: "operations" }).hasGoFeatures).toBe(true);
  });

  test("switching Seneca off removes it; switching a Go tool on unlocks Go", () => {
    setSavedPlanFeatures({ pro: ["workspace", "go_walks"] });
    const pro = resolveWorkspaceAccess("t1", sub);
    expect(workspaceHasSenecaEntitlement(pro)).toBe(false);
    expect(pro.hasGoFeatures).toBe(true);
  });
});

describe("displayFeatureLines", () => {
  const pro = { key: "pro", name: "Pro", priceCents: 3999, included: ["workspace", "seneca"], extras: [] };
  const ops = {
    key: "operations",
    name: "Operations",
    priceCents: 6999,
    included: ["workspace", "seneca", "go_walks"],
    extras: ["Floor-ready ops workflows"],
  };

  test("summarises a cheaper plan it contains", () => {
    expect(displayFeatureLines(ops, [pro, ops])).toEqual([
      "Everything in Pro",
      "Guided walks",
      "Floor-ready ops workflows",
    ]);
    expect(displayFeatureLines(pro, [pro, ops])).toEqual(["Tasks & action items", "Seneca AI coaching assistant"]);
  });

  test("lists everything when the cheaper plan has something it lacks", () => {
    const lean = { ...ops, included: ["workspace", "go_walks"], extras: [] };
    expect(displayFeatureLines(lean, [pro, lean])).toEqual(["Tasks & action items", "Guided walks"]);
  });
});

test("legacyExtraLines keeps only lines the catalog doesn't cover", () => {
  expect(
    legacyExtraLines(["Everything in Pro", "Shift briefings & walks", "Workflow execution tools", "Team calendar"]),
  ).toEqual(["Workflow execution tools"]);
});
