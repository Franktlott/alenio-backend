import { describe, expect, test } from "bun:test";
import {
  canManageCheckInTemplates,
  getCheckInTemplateDeletionBlock,
  type CheckInTemplateCalendarReference,
} from "./one-on-one-template-policy";

const NOW = new Date("2026-08-09T18:00:00.000Z");

function calendarReference(
  overrides: Partial<CheckInTemplateCalendarReference> = {},
): CheckInTemplateCalendarReference {
  return {
    isOneOnOne: true,
    oneOnOneTemplateId: "template-1",
    startDate: new Date("2026-08-10T18:00:00.000Z"),
    isHidden: false,
    approvalStatus: "approved",
    ...overrides,
  };
}

describe("canManageCheckInTemplates", () => {
  test("allows owners and team leaders", () => {
    expect(canManageCheckInTemplates("owner")).toBe(true);
    expect(canManageCheckInTemplates("team_leader")).toBe(true);
  });

  test("denies admins, regular members, and missing memberships", () => {
    expect(canManageCheckInTemplates("admin")).toBe(false);
    expect(canManageCheckInTemplates("member")).toBe(false);
    expect(canManageCheckInTemplates(null)).toBe(false);
  });
});

describe("getCheckInTemplateDeletionBlock", () => {
  test("blocks a template required by workspace standards", () => {
    expect(
      getCheckInTemplateDeletionBlock({
        templateId: "template-1",
        requiredCheckInTemplateId: "template-1",
        calendarReferences: [],
        now: NOW,
      }),
    ).toBe("required_by_workspace_standards");
  });

  test("blocks approved and pending future visible check-ins", () => {
    for (const approvalStatus of ["approved", "pending"]) {
      expect(
        getCheckInTemplateDeletionBlock({
          templateId: "template-1",
          requiredCheckInTemplateId: null,
          calendarReferences: [calendarReference({ approvalStatus })],
          now: NOW,
        }),
      ).toBe("future_scheduled_check_in");
    }
  });

  test("allows past, hidden, non-check-in, rejected, and unrelated events", () => {
    const allowedReferences = [
      calendarReference({ startDate: new Date("2026-08-08T18:00:00.000Z") }),
      calendarReference({ startDate: NOW }),
      calendarReference({ isHidden: true }),
      calendarReference({ isOneOnOne: false }),
      calendarReference({ approvalStatus: "rejected" }),
      calendarReference({ oneOnOneTemplateId: "template-2" }),
    ];

    for (const reference of allowedReferences) {
      expect(
        getCheckInTemplateDeletionBlock({
          templateId: "template-1",
          requiredCheckInTemplateId: null,
          calendarReferences: [reference],
          now: NOW,
        }),
      ).toBeNull();
    }
  });
});
