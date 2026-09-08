import { describe, expect, test } from "bun:test";
import { buildVideoInviteEmail } from "./video-invite-email";

describe("video invite email", () => {
  test("uses the shared Alenio email style and escapes meeting copy", () => {
    const email = buildVideoInviteEmail({
      inviteUrl: "https://example.daily.co/test?t=token",
      roomName: "<Leadership sync>",
      senderName: "Alex & Sam",
      expiresAt: new Date("2026-09-05T16:30:00.000Z"),
    });

    expect(email.subject).toContain("Alex & Sam");
    expect(email.html).toContain("linear-gradient(135deg,#0B1220");
    expect(email.html).toContain("Join meeting");
    expect(email.html).toContain("&lt;Leadership sync&gt;");
    expect(email.html).toContain("Alex &amp; Sam");
    expect(email.html).not.toContain("<Leadership sync>");
    expect(email.text).toContain("Meeting: <Leadership sync>");
  });
});
