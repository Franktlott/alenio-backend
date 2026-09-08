import { describe, expect, test } from "bun:test";
import { buildAuthOtpEmail } from "./auth-otp-email";

describe("auth OTP email", () => {
  test("uses the shared Alenio email design for email changes", () => {
    const email = buildAuthOtpEmail({
      type: "email-change",
      otp: "123456",
      toEmail: "new@example.com",
    });

    expect(email.subject).toBe("Confirm your new Alenio email");
    expect(email.html).toContain("Verify your new email");
    expect(email.html).toContain("123456");
    expect(email.html).toContain("new@example.com");
    expect(email.html).toContain("Alenio Insights, LLC");
    expect(email.text).toContain("Use your new email the next time you sign in");
  });
});
