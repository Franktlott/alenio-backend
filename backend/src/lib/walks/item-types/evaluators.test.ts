import { describe, expect, test } from "bun:test";
import { evaluateTemperature } from "./temperature";
import { evaluateYesNo } from "./yes-no";
import { evaluateVisualCheck } from "./visual-check";
import { evaluatePhoto } from "./photo";
import { evaluateWalkItemResponse, parseItemConfig } from "./registry";
import { canManageWalks, canViewWalks } from "../permissions";

describe("temperature evaluation", () => {
  test("ABOVE passes when value meets minimum", () => {
    expect(
      evaluateTemperature(
        {
          comparisonType: "ABOVE",
          minimumTemperature: 165,
          maximumTemperature: null,
          unit: "F",
          allowManualEntry: true,
          allowBluetoothProbe: false,
          requireRetestOnFailure: false,
          maximumRetests: 1,
        },
        { value: 165, source: "manual" },
      ),
    ).toBe("PASS");
  });

  test("ABOVE fails when value is below minimum", () => {
    expect(
      evaluateTemperature(
        {
          comparisonType: "ABOVE",
          minimumTemperature: 165,
          maximumTemperature: null,
          unit: "F",
          allowManualEntry: true,
          allowBluetoothProbe: false,
          requireRetestOnFailure: false,
          maximumRetests: 1,
        },
        { value: 162.4, source: "manual" },
      ),
    ).toBe("FAIL");
  });

  test("BETWEEN requires both bounds", () => {
    const config = {
      comparisonType: "BETWEEN" as const,
      minimumTemperature: 34,
      maximumTemperature: 40,
      unit: "F" as const,
      allowManualEntry: true,
      allowBluetoothProbe: false,
      requireRetestOnFailure: false,
      maximumRetests: 1,
    };
    expect(evaluateTemperature(config, { value: 38.2, source: "manual" })).toBe("PASS");
    expect(evaluateTemperature(config, { value: 41, source: "manual" })).toBe("FAIL");
  });
});

describe("yes/no evaluation", () => {
  test("matches passing answer", () => {
    expect(
      evaluateYesNo({ passingAnswer: "YES", yesLabel: "Yes", noLabel: "No" }, { answer: "YES" }),
    ).toBe("PASS");
    expect(
      evaluateYesNo({ passingAnswer: "YES", yesLabel: "Yes", noLabel: "No" }, { answer: "NO" }),
    ).toBe("FAIL");
  });

  test("NO can be the passing answer", () => {
    expect(
      evaluateYesNo({ passingAnswer: "NO", yesLabel: "Yes", noLabel: "No" }, { answer: "NO" }),
    ).toBe("PASS");
  });
});

describe("visual check evaluation", () => {
  const config = {
    passingOptions: ["Looks good"],
    failingOptions: ["Needs attention"],
    requirePhotoOnFailure: true,
  };

  test("passing option", () => {
    expect(evaluateVisualCheck(config, { selectedOption: "Looks good" })).toBe("PASS");
  });

  test("failing option without required photo needs action", () => {
    expect(evaluateVisualCheck(config, { selectedOption: "Needs attention" })).toBe("NEEDS_ACTION");
  });

  test("failing option with photo fails", () => {
    expect(
      evaluateVisualCheck(config, {
        selectedOption: "Needs attention",
        photoUrls: ["https://example.com/a.jpg"],
      }),
    ).toBe("FAIL");
  });
});

describe("photo evaluation", () => {
  test("requires minimum photos", () => {
    expect(
      evaluatePhoto({ minimumPhotos: 1, maximumPhotos: 3, instructions: null }, { photoUrls: [] }),
    ).toBe("NEEDS_ACTION");
    expect(
      evaluatePhoto(
        { minimumPhotos: 1, maximumPhotos: 3, instructions: null },
        { photoUrls: ["https://example.com/a.jpg"] },
      ),
    ).toBe("PASS");
  });
});

describe("registry", () => {
  test("parseItemConfig accepts temperature defaults", () => {
    const result = parseItemConfig("TEMPERATURE", {});
    expect(result.ok).toBe(true);
  });

  test("evaluateWalkItemResponse delegates", () => {
    expect(
      evaluateWalkItemResponse(
        "YES_NO",
        { passingAnswer: "YES", yesLabel: "Yes", noLabel: "No" },
        { answer: "YES" },
      ),
    ).toBe("PASS");
  });
});

describe("permissions", () => {
  test("owners and team leaders can manage walks", () => {
    expect(canManageWalks("owner")).toBe(true);
    expect(canManageWalks("team_leader")).toBe(true);
    expect(canManageWalks("member")).toBe(false);
    expect(canManageWalks("admin")).toBe(false);
  });

  test("members can view walks", () => {
    expect(canViewWalks("member")).toBe(true);
    expect(canViewWalks("owner")).toBe(true);
  });
});
