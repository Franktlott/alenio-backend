import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }: { user: { email: string }, url: string }) => {
      if (!env.RESEND_API_KEY) {
        console.warn("[auth] RESEND_API_KEY not set, skipping reset email");
        return;
      }
      const resend = new Resend(env.RESEND_API_KEY);
      const logoUrl = `${env.BACKEND_URL}/static/alenio-logo.png`;
      const lotttechLogoUrl = `${env.BACKEND_URL}/static/lotttech-logo.png`;
      const { data, error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: user.email,
        subject: "Reset your Alenio password",
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#EEF2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#EEF2FF" style="background:#EEF2FF;padding:32px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;">
        <tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 32px rgba(67,97,238,0.12);">

          <!-- Logo + tagline -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:40px 40px 24px;">
              <img src="${logoUrl}" alt="Alenio" width="220" style="height:auto;display:block;margin:0 auto 14px;border:0;" />
              <p style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                <span style="color:#4361EE;">Connect.</span>
                <span style="color:#7C3AED;"> Execute.</span>
                <span style="color:#EC4899;"> Celebrate.</span>
              </p>
            </td></tr>
          </table>

          <!-- Dark card -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:0 20px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#2D4FD6" style="background:#2D4FD6;border-radius:18px;">
                <tr><td style="padding:24px 24px 8px;">
                  <!-- Label with lines -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                    <tr>
                      <td width="30" style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                      <td style="padding:0 10px;white-space:nowrap;font-size:10px;font-weight:700;color:#A5B4FC;text-transform:uppercase;letter-spacing:1.5px;text-align:center;">Password Reset</td>
                      <td style="border-top:1px solid rgba(255,255,255,0.3);font-size:0;">&nbsp;</td>
                    </tr>
                  </table>
                  <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;line-height:1.25;">Reset your password</p>
                  <p style="margin:0 0 20px;font-size:14px;color:rgba(255,255,255,0.65);">Click the button below to choose a new password for your account.</p>
                  <!-- CTA button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                    <tr><td align="center" bgcolor="#5B7FFF" style="background:#5B7FFF;border-radius:13px;">
                      <a href="${url}" style="display:block;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:15px 0;text-align:center;border-radius:13px;">Reset Password</a>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td></tr>
          </table>

          <!-- Expiry + security note -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:20px 28px 8px;">
              <p style="margin:0 0 8px;font-size:13px;color:#64748B;">🕐 This link expires in 1 hour.</p>
              <p style="margin:0;font-size:12px;color:#94A3B8;">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
            </td></tr>
          </table>

          <!-- Lott logo -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:16px 28px 20px;border-top:1px solid #F1F5F9;margin-top:12px;">
              <img src="${lotttechLogoUrl}" alt="Lott Technology Group" height="60" style="height:60px;width:auto;display:inline-block;border:0;" />
            </td></tr>
          </table>

          <!-- E2E encrypted -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 28px 24px;">
              <p style="margin:0;font-size:12px;color:#94A3B8;">🔒 End-to-end encrypted</p>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
      if (error) {
        console.error("[auth] Reset password email error:", JSON.stringify(error));
      } else {
        console.log("[auth] Reset password email sent, id:", data?.id);
      }
    },
  },
  trustedOrigins: [
    "vibecode://*/*",
    "exp://*/*",
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.dev.vibecode.run",
    "https://*.vibecode.run",
    "https://*.vibecodeapp.com",
    "https://*.vibecode.dev",
    "https://vibecode.dev",
  ],
  plugins: [
    expo(),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }: { email: string; otp: string; type: string }) {
        if (!env.RESEND_API_KEY) {
          console.warn("[auth] RESEND_API_KEY not set, skipping OTP email");
          return;
        }
        const resend = new Resend(env.RESEND_API_KEY);
        const subject = type === "email-verification"
          ? "Verify your email"
          : type === "sign-in"
          ? "Your sign-in code"
          : "Your verification code";
        const { data, error } = await resend.emails.send({
          from: env.FROM_EMAIL,
          to: email,
          subject,
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
              <h2 style="color: #4361EE;">Your verification code</h2>
              <p>Use the code below to verify your email address. It expires in 10 minutes.</p>
              <div style="background: #f4f4f8; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4361EE;">${otp}</span>
              </div>
              <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
        if (error) {
          console.error("[auth] Resend OTP email error:", JSON.stringify(error));
        } else {
          console.log("[auth] OTP email sent, id:", data?.id);
        }
      },
    }),
  ],
  advanced: {
    trustedProxyHeaders: true,
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
});
