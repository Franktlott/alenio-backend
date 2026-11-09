import { describe, expect, test } from "bun:test";
import { buildApprovalEmail, pickApprovers } from "./push-campaign-alerts";

const person = (id: string, staffRole: string | null, accountType = "platform_admin") => ({
  id,
  email: `${id}@alenio.app`,
  name: id,
  accountType,
  staffRole,
});

describe("approval alerts", () => {
  test("only other staff who can approve are alerted", () => {
    const staff = [
      person("submitter", "super_admin"),
      person("boss", "super_admin"),
      person("legacy", null),
      person("editor", "content_editor"),
      person("viewer", "read_only"),
      person("support", "support"),
      person("member", null, "member"),
    ];
    expect(pickApprovers(staff, "submitter").map((p) => p.id)).toEqual(["boss", "legacy"]);
  });

  test("email links to the approval queue and escapes the message", () => {
    const email = buildApprovalEmail({
      campaign: { id: "c1", title: "Big <news>", body: "Tap & see" },
      submitterName: "Sam",
    });
    expect(email.url).toContain("/admin/notifications?tab=approval&id=c1");
    expect(email.html).toContain("Big &lt;news&gt;");
    expect(email.html).toContain("Tap &amp; see");
    expect(email.subject).toBe("Approval needed: “Big <news>”");
  });
});
